import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { parseIES } from '@ies-tools/core';
import { iesSource } from '../../core/test/iesSource.js';
import { DEFAULT_VIEWER_SETTINGS, resolveViewerSettings, TONE_MAPPING_OPTIONS } from './settings.js';
import {
  createLightScene,
  applyLightSceneSettings,
  disposeLightScene,
  fitDistanceChange,
  helperLines,
  cutoffAngle,
  displayedShape,
  fixtureGeometry,
  setLightSceneProfile,
  TONE_MAPPING,
} from './scene.js';
import { luminousShape } from '@ies-tools/core';
import { viewerSettingFromAttribute } from './settings.js';

const size = (geometry: THREE.BufferGeometry) => {
  geometry.computeBoundingBox();
  return geometry
    .boundingBox!.getSize(new THREE.Vector3())
    .toArray()
    .map((v) => +v.toFixed(3));
};

describe('physical scene settings', () => {
  it('computes cutoff for a valid half-degree grid without exceeding the argument limit', () => {
    const vertical = Array.from({ length: 361 }, (_, i) => i / 2);
    const horizontal = Array.from({ length: 721 }, (_, i) => i / 2);
    const values = horizontal.map(() => vertical.map((angle) => (angle <= 60 ? 100 : 0)));
    const profile = parseIES(iesSource({ vertical, horizontal, values }));
    expect(cutoffAngle(profile)).toBe(60);
  });
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
    { helper: 'false' },
    { photometricSolid: 1 },
    { toneMapping: 'unknown' },
    { viewMode: 'falsecolor' },
    { units: 'feet' },
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
      expect(objects.uniforms.lightPosition.value.toArray()).toEqual([0, 4, 0]);
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
  it('draws a ground cone for narrow beams and axis circles for wide ones', () => {
    const cone = helperLines(45, 2);
    // 200 circle segments plus 4 lines to the light, 2 vertices of 3 floats each.
    expect(cone).toHaveLength((200 + 4) * 6);
    expect(cone[0]).toBeCloseTo(2);
    expect(cone[1]).toBeCloseTo(0.02);
    expect(cone.slice(-6)).toEqual([0, 0.02, -2, 0, 2, 0].map((v, i) => (i === 2 ? expect.closeTo(v) : v)));
    const sphere = helperLines(180, 2);
    expect(sphere).toHaveLength((3 * 200 + 3) * 6);
    for (let i = 0; i < 3 * 200 * 6; i += 3)
      expect(Math.hypot(sphere[i]!, sphere[i + 1]! - 2, sphere[i + 2]!)).toBeCloseTo(1);
    const objects = createLightScene({ ...DEFAULT_VIEWER_SETTINGS });
    expect(objects.helper.visible).toBe(false);
    objects.cutoff = 30;
    applyLightSceneSettings(objects, DEFAULT_VIEWER_SETTINGS);
    expect(objects.helper.visible).toBe(true);
    applyLightSceneSettings(objects, { ...DEFAULT_VIEWER_SETTINGS, helper: false });
    expect(objects.helper.visible).toBe(false);
    disposeLightScene(objects);
  });
  it('reads the photometric-solid attribute', () => {
    expect(viewerSettingFromAttribute('photometric-solid', null)).toEqual({ photometricSolid: false });
    expect(viewerSettingFromAttribute('photometric-solid', '')).toEqual({ photometricSolid: true });
    expect(viewerSettingFromAttribute('helper', null)).toEqual({ helper: true });
  });
  it('sizes fixtures from the luminous opening with a visible minimum', () => {
    expect(displayedShape(luminousShape({ width: 0, length: 0, height: 0 }))).toMatchObject({
      solid: 'ellipsoid',
      width: 0.05,
      length: 0.05,
      height: 0.05,
    });
    expect(displayedShape(luminousShape({ width: 0.3, length: 0.6, height: 0 }))).toMatchObject({
      width: 0.3,
      length: 0.6,
      height: 0.01,
    });
    // A 1 cm LED grows to 5 cm across.
    expect(displayedShape(luminousShape({ width: -0.01, length: -0.01, height: 0 })).width).toBeCloseTo(0.05);
    const tube = displayedShape(luminousShape({ width: -0.1, length: 1.2, height: -0.1 }));
    expect(size(fixtureGeometry(tube))).toEqual([1.2, 0.1, 0.1]);
    const sideways = displayedShape(luminousShape({ width: 1.2, length: -0.1, height: -0.2 }));
    expect(size(fixtureGeometry(sideways))).toEqual([0.1, 0.2, 1.2]);
    expect(size(fixtureGeometry(displayedShape(luminousShape({ width: 0.2, length: 0.4, height: 0.1 }))))).toEqual([
      0.4, 0.1, 0.2,
    ]);
  });
  it('loads luminance, fixture and a peak-normalized photometric solid from a profile', () => {
    const objects = createLightScene({ ...DEFAULT_VIEWER_SETTINGS });
    try {
      // Uniform 100 cd from a 0.1 m × 0.1 m downward opening.
      const profile = parseIES(iesSource());
      setLightSceneProfile(objects, profile, { ...DEFAULT_VIEWER_SETTINGS, photometricSolid: true });
      expect(objects.solid.visible).toBe(true);
      expect(objects.solid.scale.x).toBe(1);
      const positions = objects.solid.geometry.getAttribute('position');
      let peak = 0;
      for (let i = 0; i < positions.count; i++)
        peak = Math.max(peak, Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i)));
      expect(peak).toBeCloseTo(1);
      const luminance = objects.fixtureUniforms.luminanceMap.value.image.data as Float32Array;
      const candela = objects.uniforms.distribution.value.image.data as Float32Array;
      // Looking straight up at nadir: I / (0.1 × 0.1 m²).
      expect(luminance[0]).toBeCloseTo(candela[0]! / 0.01);
      setLightSceneProfile(objects, undefined, DEFAULT_VIEWER_SETTINGS);
      expect(objects.solid.visible).toBe(false);
      expect(objects.cutoff).toBeUndefined();
    } finally {
      disposeLightScene(objects);
    }
  });
});
