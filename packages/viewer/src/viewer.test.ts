// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { WebGLRenderer } from 'three';
import type { Mesh, Scene, ShaderMaterial, LineSegments, DataTexture } from 'three';
import {
  autoExposureValue,
  parsePhotometry,
  parseIES,
  parseLDT,
  saturationLuminance,
  serializeLDT,
  writeLDT,
} from '@ies-tools/core';
import { temperatureColor } from './lightColor.js';
import { iesSource } from '../../core/test/iesSource.js';
const gpu = vi.hoisted(() => ({ render: vi.fn(), dispose: vi.fn() }));
// Preserve real scene objects and orbit controls; replace only WebGL rendering.
vi.mock('three', async (importOriginal) => ({
  ...(await importOriginal<typeof import('three')>()),
  WebGLRenderer: vi.fn(function () {
    return {
      domElement: document.createElement('canvas'),
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: gpu.render,
      dispose: gpu.dispose,
    };
  }),
}));
import { createLightViewer } from './viewer.js';

const renderedMaterial = () =>
  ((gpu.render.mock.calls.at(-1)![0] as Scene).children[0] as Mesh).material as ShaderMaterial;

const color = () => renderedMaterial().uniforms.lightColor!.value;
const distribution = () => Array.from((renderedMaterial().uniforms.distribution!.value as DataTexture).image.data);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('clears the distribution, helper and document, disposes textures and can reload', () => {
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(function () {
      return { observe: vi.fn(), disconnect: vi.fn() };
    }),
  );
  const host = document.createElement('div');
  const viewer = createLightViewer(host, { autoExposure: false, exposure: 2, floorDistance: 4 });
  try {
    const photometry = parsePhotometry(iesSource());
    viewer.setDocument(photometry);
    const scene = gpu.render.mock.calls.at(-1)![0] as Scene;
    const material = (scene.children[0] as Mesh).material as ShaderMaterial;
    const texture = material.uniforms.distribution!.value as DataTexture;
    const disposed = vi.spyOn(texture, 'dispose');
    const helper = scene.children[3] as LineSegments;
    expect(helper.visible).toBe(true);
    expect(viewer.document).toBe(photometry);
    gpu.render.mockClear();
    viewer.clear();
    expect(viewer.document).toBeUndefined();
    expect(disposed).toHaveBeenCalledOnce();
    expect(helper.visible).toBe(false);
    const blank = material.uniforms.distribution!.value as DataTexture;
    expect(blank).not.toBe(texture);
    expect(Array.from(blank.image.data).every((value) => value === 0)).toBe(true);
    expect(gpu.render).toHaveBeenCalledOnce();
    expect(viewer.getSettings()).toMatchObject({ exposure: 2, floorDistance: 4 });
    const blankDisposed = vi.spyOn(blank, 'dispose');
    viewer.setDocument(photometry);
    expect(blankDisposed).toHaveBeenCalledOnce();
    expect(viewer.document).toBe(photometry);
    expect(helper.visible).toBe(true);
  } finally {
    viewer.dispose();
  }
  expect(() => viewer.clear()).toThrow('disposed');
});

it('explains WebGL initialization recovery and preserves the underlying error', () => {
  const cause = new Error('Error creating WebGL context');
  vi.mocked(WebGLRenderer).mockImplementationOnce(function () {
    throw cause;
  });
  let failure: unknown;
  try {
    createLightViewer(document.createElement('div'));
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({ cause, message: expect.stringContaining('Enable graphics acceleration') });
  expect((failure as Error).message).toContain('ies chart');
});

it('updates uniform color for IES profiles, selected LDT configurations, fallback and clear', () => {
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(function () {
      return { observe: vi.fn(), disconnect: vi.fn() };
    }),
  );
  const viewer = createLightViewer(document.createElement('div'));
  try {
    expect(color()).toEqual(temperatureColor(6500));
    viewer.load(iesSource({ metadata: '[_TEMPCOLOR] 3000K' }));
    expect(color()).toEqual(temperatureColor(3000));
    const intensities = distribution();
    viewer.setProfile(parseIES(iesSource({ metadata: '[COLORTEMP] 5000' })));
    expect(color()).toEqual(temperatureColor(5000));
    expect(distribution()).toEqual(intensities);
    viewer.setProfile(parseIES(iesSource()));
    expect(color()).toEqual(temperatureColor(6500));

    const native = parseLDT(serializeLDT(parseIES(iesSource())).value);
    native.lampSets[0]!.lampCount = 1;
    native.lampSets[0]!.colorTemperature = '2700K';
    native.lampSets.push({ ...native.lampSets[0]!, colorTemperature: '4000 K' });
    const ldtText = writeLDT(native);
    viewer.loadDocument(ldtText, 'ldt', { lampSetIndex: 0 });
    expect(color()).toEqual(temperatureColor(2700));
    const first = distribution();
    const selected = parsePhotometry(ldtText, 'ldt', { lampSetIndex: 1 });
    viewer.setDocument(selected);
    expect(viewer.document).toBe(selected);
    expect(color()).toEqual(temperatureColor(4000));
    expect(distribution()).toEqual(first);
    viewer.setSettings({ exposure: 2 });
    expect(color()).toEqual(temperatureColor(4000));
    viewer.clear();
    expect(color()).toEqual(temperatureColor(6500));
    viewer.setDocument(selected);
    expect(color()).toEqual(temperatureColor(4000));
  } finally {
    viewer.dispose();
  }
});

it('meters EV100 from the peak receiver luminance until switched to manual', () => {
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(function () {
      return { observe: vi.fn(), disconnect: vi.fn() };
    }),
  );
  const viewer = createLightViewer(document.createElement('div'));
  const events: unknown[] = [];
  viewer.addEventListener('settingschange', (event) => events.push(event.detail));
  try {
    // Isotropic 100 cd: the 60% wall 2 m away (25 lx) is the brightest receiver.
    viewer.load(iesSource());
    const ev = autoExposureValue((0.6 * 25) / Math.PI);
    expect(viewer.getSettings()).toMatchObject({ autoExposure: true, exposure: ev });
    expect(events).toHaveLength(1);
    const exposure = () => renderedMaterial().uniforms.exposure!.value as number;
    expect(exposure()).toBeCloseTo(1 / saturationLuminance(ev), 12);
    viewer.setSettings({ exposure: 12 });
    expect(viewer.getSettings().exposure).toBe(ev);
    // A wall 1 m away receives four times the illuminance: two stops more exposure.
    viewer.setSettings({ wallDistance: 1 });
    expect(viewer.getSettings().exposure).toBeCloseTo(ev + 2, 1);
    viewer.setSettings({ autoExposure: false });
    expect(viewer.getSettings().exposure).toBeCloseTo(ev + 2, 1);
    viewer.setSettings({ exposure: 9 });
    viewer.setSettings({ wallDistance: 2 });
    expect(viewer.getSettings().exposure).toBe(9);
    // One more stop halves the displayed luminance.
    const nine = exposure();
    viewer.setSettings({ exposure: 10 });
    expect(exposure()).toBeCloseTo(nine / 2, 12);
    viewer.setSettings({ autoExposure: true });
    expect(viewer.getSettings().exposure).toBe(ev);
    viewer.setExposure(8);
    expect(viewer.getSettings()).toMatchObject({ autoExposure: false, exposure: 8 });
  } finally {
    viewer.dispose();
  }
});

it('shows an auto-ranged illuminance legend and contour uniforms only in measurement mode', () => {
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(function () {
      return { observe: vi.fn(), disconnect: vi.fn() };
    }),
  );
  const host = document.createElement('div');
  const viewer = createLightViewer(host, { viewMode: 'measurement' });
  try {
    const legend = host.querySelector<HTMLElement>('.viewer-overlay .illuminance-legend')!;
    expect(legend.hidden).toBe(true);
    // Isotropic 100 cd: the wall 2 m away and the floor 2 m below both peak at 25 lx.
    viewer.load(iesSource());
    expect(legend.hidden).toBe(false);
    expect(legend.textContent).toContain('Illuminance (lx)');
    expect(legend.textContent).toContain('peak 25');
    const material = renderedMaterial();
    expect('MEASUREMENT' in material.defines).toBe(true);
    expect(material.uniforms.rampPeak!.value).toBeCloseTo(25, 9);
    expect(material.uniforms.levelCount!.value).toBe(9);
    expect(material.uniforms.logLevels!.value[8]).toBeCloseTo(Math.log(20), 9);
    viewer.setSettings({ units: 'imperial', wallDistance: 1 });
    expect(legend.textContent).toContain('Illuminance (fc)');
    expect(legend.textContent).toContain('peak 9.29');
    expect(material.uniforms.rampPeak!.value).toBeCloseTo(100, 9);
    viewer.setSettings({ viewMode: 'realistic' });
    expect(legend.hidden).toBe(true);
    expect('MEASUREMENT' in renderedMaterial().defines).toBe(false);
  } finally {
    viewer.dispose();
  }
  expect(host.querySelector('.viewer-overlay')).toBeNull();
});
