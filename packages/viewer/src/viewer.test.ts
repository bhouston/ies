// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { WebGLRenderer } from 'three';
import type { Mesh, Scene, ShaderMaterial, LineSegments, DataTexture } from 'three';
import {
  autoExposureValue,
  getPhotometricTypeSupport,
  parsePhotometry,
  parseIES,
  parseLDT,
  saturationLuminance,
  serializeLDT,
  writeLDT,
} from '@ies-tools/core';
import { temperatureColor } from './lightColor.js';
import { iesSource } from '../../core/test/iesSource.js';
const gpu = vi.hoisted(() => ({
  render: vi.fn(),
  dispose: vi.fn(),
  setSize: vi.fn(),
  setPixelRatio: vi.fn(),
  lost: false,
}));
// Preserve real scene objects and orbit controls; replace only WebGL rendering.
vi.mock('three', async (importOriginal) => ({
  ...(await importOriginal<typeof import('three')>()),
  WebGLRenderer: vi.fn(function () {
    return {
      domElement: document.createElement('canvas'),
      setPixelRatio: gpu.setPixelRatio,
      getPixelRatio: () => 2,
      setSize: gpu.setSize,
      getContext: () => ({ isContextLost: () => gpu.lost, drawingBufferWidth: 320, drawingBufferHeight: 200 }),
      capabilities: { maxTextureSize: 4096 },
      render: gpu.render,
      dispose: gpu.dispose,
    };
  }),
}));
const orbit = vi.hoisted(() => ({ controls: undefined as { rotateSpeed: number } | undefined }));
// Real orbit controls, recorded so tests can read their configuration.
vi.mock('three/addons/controls/OrbitControls.js', async (importOriginal) => {
  const { OrbitControls } = await importOriginal<typeof import('three/addons/controls/OrbitControls.js')>();
  return {
    OrbitControls: class extends OrbitControls {
      constructor(...args: ConstructorParameters<typeof OrbitControls>) {
        super(...args);
        orbit.controls = this;
      }
    },
  };
});
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

it('orbits at a comfortable speed: a full-height drag turns about 126 degrees', () => {
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(function () {
      return { observe: vi.fn(), disconnect: vi.fn() };
    }),
  );
  const viewer = createLightViewer(document.createElement('div'));
  try {
    expect(orbit.controls!.rotateSpeed).toBe(0.35);
  } finally {
    viewer.dispose();
  }
});

it('rejects Type A/B documents with the core capability message and keeps the current document', () => {
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(function () {
      return { observe: vi.fn(), disconnect: vi.fn() };
    }),
  );
  const viewer = createLightViewer(document.createElement('div'));
  try {
    const typeC = parsePhotometry(iesSource());
    viewer.setDocument(typeC);
    const typeB = parsePhotometry(iesSource({ type: 2, vertical: [-90, 0, 90] }));
    const support = getPhotometricTypeSupport(typeB.profile);
    expect(support.supported).toBe(false);
    expect(() => viewer.setDocument(typeB)).toThrow(support.supported ? '' : support.message);
    expect(viewer.document).toBe(typeC);
  } finally {
    viewer.dispose();
  }
});

it('captures the current scene at requested dimensions, restoring the canvas, and rejects bad input', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(function () {
      return { observe: vi.fn(), disconnect: vi.fn() };
    }),
  );
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((done, type) => done(new Blob(['x'], { type: type ?? 'image/png' })));
  const viewer = createLightViewer(document.createElement('div'));
  try {
    gpu.render.mockClear();
    gpu.setSize.mockClear();
    const blob = await viewer.capture({ type: 'image/jpeg', quality: 0.8, width: 320, height: 200 });
    expect(blob.type).toBe('image/jpeg');
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.8);
    expect(gpu.setSize.mock.calls[0]).toEqual([320, 200, false]);
    expect(gpu.setPixelRatio.mock.calls.slice(-2)).toEqual([[1], [2]]);
    // One render for the capture, one restoring the on-screen frame.
    expect(gpu.render).toHaveBeenCalledTimes(2);
    await expect(viewer.capture({ width: 640, height: 400 })).rejects.toThrow('could not allocate');
    await expect(viewer.capture({ width: 0, height: 10 })).rejects.toThrow('integers from 1 to 4096');
    await expect(viewer.capture({ width: 5000 })).rejects.toThrow(RangeError);
    await expect(viewer.capture({ quality: 2 })).rejects.toThrow('quality');
    toBlob.mockImplementationOnce((done) => done(null));
    await expect(viewer.capture()).rejects.toThrow('could not encode');
    gpu.lost = true;
    await expect(viewer.capture()).rejects.toThrow('context was lost');
  } finally {
    gpu.lost = false;
    toBlob.mockRestore();
    viewer.dispose();
  }
  await expect(viewer.capture()).rejects.toThrow('disposed');
});
