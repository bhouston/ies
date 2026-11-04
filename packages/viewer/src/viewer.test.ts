// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { WebGLRenderer } from 'three';
import type { Mesh, Scene, ShaderMaterial, LineSegments, DataTexture } from 'three';
import { parsePhotometry } from '@ies-tools/core';
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
  const viewer = createLightViewer(host, { exposure: 2, floorDistance: 4 });
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
