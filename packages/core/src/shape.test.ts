import { describe, expect, it } from 'vitest';
import { luminousShape, projectedLuminousArea } from './index.js';

describe('luminousShape', () => {
  // LM-63 Table 1 rows (LM-63-2002 / LM-63-2019), then the two (0, -, -) extensions.
  it.each([
    [0, 0, 0, 'point', 'ellipsoid', 'y'],
    [0.3, 1.2, 0, 'rectangular', 'box', 'y'],
    [0.3, 1.2, 0.1, 'rectangular-luminous-sides', 'box', 'y'],
    [-0.2, -0.2, 0, 'circular', 'cylinder', 'y'],
    [-0.2, -0.4, 0, 'ellipse', 'cylinder', 'y'],
    [-0.2, -0.2, 0.3, 'vertical-cylinder', 'cylinder', 'y'],
    [-0.2, -0.4, 0.3, 'vertical-ellipsoidal-cylinder', 'cylinder', 'y'],
    [-0.1, 1.2, -0.1, 'horizontal-cylinder-along-length', 'cylinder', 'x'],
    [-0.1, 1.2, -0.2, 'horizontal-ellipsoidal-cylinder-along-length', 'cylinder', 'x'],
    [1.2, -0.1, -0.1, 'horizontal-cylinder-along-width', 'cylinder', 'z'],
    [1.2, -0.1, -0.2, 'horizontal-ellipsoidal-cylinder-along-width', 'cylinder', 'z'],
    [-0.1, -0.1, -0.1, 'sphere', 'ellipsoid', 'y'],
    [-0.1, -0.2, -0.1, 'ellipsoidal-spheroid', 'ellipsoid', 'y'],
    [-0.1, 0, -0.1, 'vertical-circle-facing-length', 'cylinder', 'x'],
    [-0.1, 0, -0.2, 'vertical-ellipse-facing-length', 'cylinder', 'x'],
    // Extensions, not in Table 1.
    [0, -0.1, -0.1, 'vertical-circle-facing-width', 'cylinder', 'z'],
    [0, -0.1, -0.2, 'vertical-ellipse-facing-width', 'cylinder', 'z'],
  ] as const)('classifies %f %f %f as %s', (width, length, height, kind, solid, axis) => {
    expect(luminousShape({ width, length, height })).toEqual({
      kind,
      solid,
      axis,
      width: Math.abs(width),
      length: Math.abs(length),
      height: Math.abs(height),
    });
  });

  it('reads legacy circles, converts feet and falls back to absolute boxes', () => {
    expect(luminousShape({ width: -0.5, length: 0, height: 0 }, 'feet')).toMatchObject({
      kind: 'circular',
      width: 0.5 * 0.3048,
      length: 0.5 * 0.3048,
    });
    expect(luminousShape({ width: 0, length: -0.2, height: 0.1 })).toMatchObject({
      kind: 'vertical-cylinder',
      width: 0.2,
      length: 0.2,
    });
    expect(luminousShape({ width: -0.2, length: 0.5, height: 0 })).toMatchObject({ kind: 'rectangular', width: 0.2 });
    expect(luminousShape({ width: 0.2, length: 0.5, height: -0.1 })).toMatchObject({
      kind: 'rectangular-luminous-sides',
      height: 0.1,
    });
    // Rounded equal dimensions are still circles.
    expect(luminousShape({ width: -0.3333, length: -0.3334, height: 0 }).kind).toBe('circular');
  });

  // Pre-2002 encodings from Radiance ies2rad makeiesshape (width, length, height).
  it.each([
    ['LM-63-1995', -0.1, 0, -0.1, 'sphere', 'ellipsoid', 'y', 0.1, 0.1, 0.1],
    ['LM-63-1995', -0.1, 0, -0.2, 'ellipsoidal-spheroid', 'ellipsoid', 'y', 0.1, 0.1, 0.2],
    ['LM-63-1995', 0, 1.2, -0.1, 'horizontal-cylinder-along-length', 'cylinder', 'x', 0.1, 1.2, 0.1],
    ['LM-63-1995', 1.2, 0, -0.1, 'horizontal-cylinder-along-width', 'cylinder', 'z', 1.2, 0.1, 0.1],
    ['LM-63-1995', -0.2, 0.4, 0.3, 'vertical-ellipsoidal-cylinder', 'cylinder', 'y', 0.2, 0.4, 0.3],
    ['LM-63-1995', 0.2, -0.4, 0.3, 'vertical-ellipsoidal-cylinder', 'cylinder', 'y', 0.2, 0.4, 0.3],
    ['LM-63-1995', -0.2, 0.4, -0.3, 'ellipsoidal-spheroid', 'ellipsoid', 'y', 0.2, 0.4, 0.3],
    ['LM-63-1995', 0.2, -0.4, -0.3, 'ellipsoidal-spheroid', 'ellipsoid', 'y', 0.2, 0.4, 0.3],
    ['LM-63-1995', -0.2, 0, 0.3, 'vertical-cylinder', 'cylinder', 'y', 0.2, 0.2, 0.3],
    ['LM-63-1995', 0.3, 1.2, 0, 'rectangular', 'box', 'y', 0.3, 1.2, 0],
    ['LM-63-1991', -0.2, 0.4, 0, 'ellipse', 'cylinder', 'y', 0.2, 0.4, 0],
    ['LM-63-1986', -0.2, 0.4, 0.3, 'ellipsoidal-spheroid', 'ellipsoid', 'y', 0.2, 0.4, 0.3],
    ['LM-63-1986', -0.2, 0, 0, 'circular', 'cylinder', 'y', 0.2, 0.2, 0],
    ['LM-63-1986', -0.1, 1.2, -0.1, 'horizontal-cylinder-along-length', 'cylinder', 'x', 0.1, 1.2, 0.1],
    ['LM-63-2002', -0.1, 0, -0.1, 'vertical-circle-facing-length', 'cylinder', 'x', 0.1, 0, 0.1],
  ] as const)('reads %s %f %f %f as %s', (version, w, l, h, kind, solid, axis, width, length, height) => {
    expect(luminousShape({ width: w, length: l, height: h }, 'meters', version)).toEqual({
      kind,
      solid,
      axis,
      width,
      length,
      height,
    });
  });
});

describe('projectedLuminousArea', () => {
  it('projects boxes, ellipsoids and cylinders', () => {
    const box = luminousShape({ width: 0.2, length: 0.6, height: 0.1 });
    expect(projectedLuminousArea(box, [0, -1, 0])).toBeCloseTo(0.12);
    expect(projectedLuminousArea(box, [1, 0, 0])).toBeCloseTo(0.02);
    expect(projectedLuminousArea(box, [0, 0, 1])).toBeCloseTo(0.06);
    const sphere = luminousShape({ width: -0.2, length: -0.2, height: -0.2 });
    for (const direction of [
      [0, 1, 0],
      [Math.SQRT1_2, 0, Math.SQRT1_2],
    ] as const)
      expect(projectedLuminousArea(sphere, [...direction])).toBeCloseTo(Math.PI * 0.01);
    const disk = luminousShape({ width: -0.2, length: -0.2, height: 0 });
    expect(projectedLuminousArea(disk, [0, -1, 0])).toBeCloseTo(Math.PI * 0.01);
    expect(projectedLuminousArea(disk, [1, 0, 0])).toBe(0);
    const tube = luminousShape({ width: -0.1, length: 1, height: -0.1 });
    expect(projectedLuminousArea(tube, [0, -1, 0])).toBeCloseTo(0.1);
    expect(projectedLuminousArea(tube, [1, 0, 0])).toBeCloseTo(Math.PI * 0.0025);
    const wide = luminousShape({ width: 1, length: -0.1, height: -0.2 });
    expect(projectedLuminousArea(wide, [1, 0, 0])).toBeCloseTo(0.2);
    expect(projectedLuminousArea(wide, [0, 1, 0])).toBeCloseTo(0.1);
    const vertical = luminousShape({ width: -0.2, length: -0.4, height: 0.5 });
    expect(projectedLuminousArea(vertical, [0, 0, 1])).toBeCloseTo(0.2);
  });
});
