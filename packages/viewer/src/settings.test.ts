import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_VIEWER_SETTINGS, resolveViewerSettings, TONE_MAPPING_OPTIONS } from './settings.js';
import {
  createLightScene,
  applyLightSceneSettings,
  disposeLightScene,
  fitDistanceChange,
  TONE_MAPPING,
} from './scene.js';

describe('physical scene settings', () => {
  it('keeps defaults and accepts all supported tone curves and nonnegative exposures', () => {
    expect(resolveViewerSettings({})).toEqual(DEFAULT_VIEWER_SETTINGS);
    for (const option of TONE_MAPPING_OPTIONS)
      expect(resolveViewerSettings({ toneMapping: option.value }).toneMapping).toBe(option.value);
    expect(resolveViewerSettings({ exposure: 0 }).exposure).toBe(0);
    expect(resolveViewerSettings({ exposure: 1000 }).exposure).toBe(1000);
    expect(TONE_MAPPING.agx).toBe(THREE.AgXToneMapping);
  });
  it.each([
    { wallDistance: 0 },
    { floorDistance: Infinity },
    { exposure: -1 },
    { exposure: NaN },
    { showWall: 'false' },
    { toneMapping: 'unknown' },
  ])('rejects invalid settings without changing defaults %j', (patch) => {
    expect(() => resolveViewerSettings(patch as never)).toThrow();
    expect(DEFAULT_VIEWER_SETTINGS.floorDistance).toBe(2);
  });
  it('moves receivers and light in meters, and applies visibility/exposure independently', () => {
    const objects = createLightScene({ ...DEFAULT_VIEWER_SETTINGS });
    try {
      const next = resolveViewerSettings({ wallDistance: 5, floorDistance: 4, showWall: false, exposure: 2 });
      applyLightSceneSettings(objects, next);
      expect(objects.wall.position.z).toBe(-5);
      expect(objects.fixture.position.y - objects.floor.position.y).toBe(4);
      expect(objects.wall.visible).toBe(false);
      expect(objects.uniforms.lightHeight.value).toBe(4);
      expect(objects.uniforms.exposure.value).toBe(2);
      expect(objects.scene.background).toEqual(new THREE.Color(0));
    } finally {
      disposeLightScene(objects);
    }
  });
  it('fits changed distances while retaining the user orbit direction and relative zoom', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100),
      target = new THREE.Vector3(0, 1, 0);
    camera.position.set(5, 4, 7);
    const original = camera.position.clone().sub(target),
      next = resolveViewerSettings({ floorDistance: 8 });
    fitDistanceChange(camera, target, { ...DEFAULT_VIEWER_SETTINGS }, next);
    expect(camera.position.clone().sub(target).normalize().distanceTo(original.clone().normalize())).toBeLessThan(
      1e-12,
    );
    expect(camera.position.distanceTo(target)).toBeCloseTo(original.length() * 4);
    expect(camera.far).toBe(400);
    fitDistanceChange(camera, target, next, { ...DEFAULT_VIEWER_SETTINGS });
    expect(camera.position.distanceTo(new THREE.Vector3(5, 4, 7))).toBeLessThan(1e-12);
  });
});
