import { describe, expect, it } from 'vitest';
import { parseIES, type IESProfile } from '@ies-tools/core';
import {
  buildIntensityCurves,
  buildIntensityTopology,
  buildIsoluxGrid,
  extractContours,
  groundIlluminance,
  isoluxContourLevels,
  niceTicks,
  orientGraphPoint,
  type Point3,
} from './graphs.js';

function profile(
  options: { vertical?: number[]; horizontal?: number[]; values?: number[][]; tilt?: string } = {},
): IESProfile {
  const v = options.vertical ?? [0, 90, 180],
    h = options.horizontal ?? [0];
  return parseIES(
    `IESNA:LM-63-2002\n[TEST] Mathematical graph fixture\nTILT=${options.tilt ?? 'NONE'}\n1 -1 1 ${v.length} ${h.length} 1 2 0 0 0\n1 1 10\n${v.join(' ')}\n${h.join(' ')}\n${(options.values ?? h.map(() => v.map(() => 100))).flat().join(' ')}`,
  );
}

const cross = (a: Point3, b: Point3): Point3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const isotropic = profile();
describe('Complete photometric curves', () => {
  it('samples actual opposed C-planes on the two sides of nadir', () => {
    const asymmetric = profile({
      horizontal: [0, 90, 180, 270, 360],
      values: [
        [100, 100, 100],
        [50, 50, 50],
        [25, 25, 25],
        [10, 10, 10],
        [100, 100, 100],
      ],
    });
    const data = buildIntensityCurves(asymmetric, { principalPlanes: true, samples: 5 });
    expect(data.curves.map((curve) => [curve.plane, curve.oppositePlane])).toEqual([
      [0, 180],
      [90, 270],
    ]);
    expect(data.curves[0]!.points.find((point) => point.angle === -90)!.intensity).toBe(25);
    expect(data.curves[0]!.points.find((point) => point.angle === 90)!.intensity).toBe(100);
    expect(data.curves[1]!.points.find((point) => point.angle === -90)!.intensity).toBe(10);
    expect(data.curves[1]!.points.find((point) => point.angle === 90)!.intensity).toBe(50);
    expect(data.curves[0]!.label).toBe('C0°–C180°');
    expect(data.angleRange).toEqual([-180, 180]);
  });
  it('includes measured angle knots so narrow irregular peaks survive coarse display sampling', () => {
    const narrow = profile({ vertical: [0, 12.25, 12.5, 12.75, 90, 180], values: [[0, 0, 100, 0, 0, 0]] });
    const data = buildIntensityCurves(narrow, { samples: 3 });
    expect(data.maximum).toBe(100);
    expect(data.curves[0]!.points.find((point) => point.angle === 12.5)!.intensity).toBe(100);
    expect(data.curves[0]!.points.find((point) => point.angle === -12.5)!.intensity).toBe(100);
    const horizontal = profile({
      horizontal: [0, 45.25, 90],
      values: [
        [0, 0, 0],
        [100, 100, 100],
        [0, 0, 0],
      ],
    });
    const sweep = buildIntensityCurves(horizontal, { axis: 'horizontal', angle: 90, samples: 3 });
    expect(sweep.curves[0]!.points.find((point) => point.angle === 45.25)!.intensity).toBe(100);
    expect(sweep.curves[0]!.points.find((point) => point.angle === 134.75)!.intensity).toBe(100);
  });
  it('supports explicit overlays and preserves horizontal sweep and fixed-angle semantics', () => {
    const result = buildIntensityCurves(isotropic, { axis: 'horizontal', planes: [30, 60], angle: 90 });
    expect(result.curves).toHaveLength(2);
    expect(result.curves.map((curve) => curve.label)).toEqual(['γ 30°', 'γ 60°']);
    expect(result.angleTicks).toEqual([0, 90, 180, 270, 360]);
    expect(result.curves[0]!.points.at(-1)).toEqual({ angle: 360, intensity: 100 });
    expect(buildIntensityCurves(isotropic).curves).toHaveLength(1);
  });
  it('rounds axis scales while retaining zero and covering the data', () => {
    expect(niceTicks(113)).toEqual([0, 50, 100, 150]);
    expect(niceTicks(0)).toEqual([0, 0.5, 1]);
    expect(niceTicks(0.04)).toEqual([0, 0.01, 0.02, 0.03, 0.04]);
    expect(niceTicks(5e-324)).toEqual([0, 5e-324]);
    expect(niceTicks(Number.MAX_VALUE).every(Number.isFinite)).toBe(true);
  });
});

describe('Reusable full intensity topology geometry', () => {
  it('preserves physical intensity radii, closes the azimuth seam and sorts filled faces by depth', () => {
    const mesh = buildIntensityTopology(isotropic, { horizontalSegments: 8, verticalSegments: 4 });
    expect(mesh.vertices).toHaveLength(45);
    expect(mesh.faces).toHaveLength(64);
    mesh.vertices.forEach((vertex) => expect(Math.hypot(...vertex.position)).toBeCloseTo(100));
    const first = mesh.vertices[9]!,
      last = mesh.vertices[17]!;
    first.position.forEach((value, i) => expect(value).toBeCloseTo(last.position[i]!));
    const depths = mesh.faces.map((face) => face.reduce((sum, index) => sum + mesh.vertices[index]!.depth, 0));
    expect(depths).toEqual(depths.toSorted((a, b) => a - b));
  });
  it('rotates the chosen axis upward without reflecting handedness', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      const actual = cross(orientGraphPoint([1, 0, 0], axis), orientGraphPoint([0, 1, 0], axis));
      const expected = orientGraphPoint([0, 0, 1], axis);
      actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i]!));
      expect(orientGraphPoint(axis === 'x' ? [1, 0, 0] : axis === 'z' ? [0, 0, 1] : [0, 1, 0], axis)[1]).toBe(1);
    }
  });
  it('supports orthographic and perspective projection with configurable camera angles', () => {
    const orthographic = buildIntensityTopology(isotropic, {
      azimuth: 0,
      elevation: 0,
      horizontalSegments: 8,
      verticalSegments: 2,
    });
    const perspective = buildIntensityTopology(isotropic, {
      projection: 'perspective',
      azimuth: 0,
      elevation: 0,
      horizontalSegments: 8,
      verticalSegments: 2,
    });
    expect(orthographic.vertices[10]!.projected[0]).toBeCloseTo(Math.SQRT1_2);
    expect(perspective.vertices[10]!.projected[0]).toBeGreaterThan(orthographic.vertices[10]!.projected[0]);
    const rotated = buildIntensityTopology(isotropic, {
      upAxis: 'x',
      azimuth: 0,
      elevation: 0,
      horizontalSegments: 4,
      verticalSegments: 2,
    });
    expect(rotated.vertices[5]!.projected[1]).toBeCloseTo(1);
    expect(
      buildIntensityTopology(profile({ values: [[0, 0, 0]] })).vertices.every((vertex) =>
        vertex.projected.every(Number.isFinite),
      ),
    ).toBe(true);
  });
});

describe('Physical ground illuminance', () => {
  it('matches an independently derived isotropic inverse-square and receiver-cosine solution', () => {
    expect(groundIlluminance(isotropic, 0, 0, { mountingHeight: 2 })).toBeCloseTo(100 / 4);
    expect(groundIlluminance(isotropic, 2, 0, { mountingHeight: 2 })).toBeCloseTo((100 * 2) / Math.sqrt(8) ** 3);
    expect(groundIlluminance(isotropic, 0, 0, { mountingHeight: 4 })).toBeCloseTo(100 / 16);
    expect(groundIlluminance(isotropic, 3, -1, { mountingHeight: 2, aimAngle: 70, azimuth: 123 })).toBeCloseTo(
      (100 * 2) / Math.sqrt(14) ** 3,
    );
  });
  it('inverts fixture aiming before sampling measured light and rotates azimuth consistently', () => {
    const downward = profile({ values: [[100, 0, 0]] });
    const unrotated = groundIlluminance(downward, 2, 0, { mountingHeight: 2 });
    const aimed = groundIlluminance(downward, 2, 0, { mountingHeight: 2, aimAngle: 45 });
    expect(aimed).toBeCloseTo(unrotated * 2);
    expect(groundIlluminance(downward, 0, 2, { mountingHeight: 2, aimAngle: 45, azimuth: 90 })).toBeCloseTo(aimed);
    expect(groundIlluminance(downward, 0, 0, { mountingHeight: 2, aimAngle: 45 })).toBeCloseTo(12.5);
  });
  it('orients asymmetric measured C-planes with the luminaire azimuth', () => {
    const asymmetric = profile({
      horizontal: [0, 90, 180],
      values: [
        [100, 100, 100],
        [50, 50, 50],
        [25, 25, 25],
      ],
    });
    expect(groundIlluminance(asymmetric, 2, 0)).toBeCloseTo(2 * groundIlluminance(asymmetric, 0, 2));
    expect(groundIlluminance(asymmetric, 2, 0, { azimuth: 90 })).toBeCloseTo(groundIlluminance(asymmetric, 0, 2));
  });
  it('keeps lamp-dependent TILT correction independent from geometric aiming', () => {
    const lamp = profile({ tilt: 'INCLUDE\n1 2\n0 90\n1 .5' });
    const baseline = groundIlluminance(lamp, 1, 2, { aimAngle: 30 });
    expect(groundIlluminance(lamp, 1, 2, { aimAngle: 30, lampTilt: 90 })).toBeCloseTo(baseline / 2);
    expect(groundIlluminance(lamp, 1, 2, { aimAngle: 60 })).toBeCloseTo(baseline);
  });
  it('builds a centered rectangular grid with real lux statistics', () => {
    const grid = buildIsoluxGrid(isotropic, { mountingHeight: 2, extent: [4, 6], resolution: [5, 3] });
    expect(grid.xs).toEqual([-2, -1, 0, 1, 2]);
    expect(grid.zs).toEqual([-3, 0, 3]);
    expect(grid.values[1]![2]).toBe(25);
    expect(grid.maximum).toBe(25);
    expect(grid.minimum).toBeCloseTo((100 * 2) / Math.sqrt(17) ** 3);
    expect(grid.average).toBeCloseTo(grid.values.flat().reduce((a, b) => a + b, 0) / 15);
    expect(grid.uniformity).toBeCloseTo(grid.minimum / grid.average);
  });
  it('reports zero uniformity for an unlit grid', () => {
    const dark = profile({ values: [[0, 0, 0]] });
    expect(buildIsoluxGrid(dark, { resolution: 3 }).uniformity).toBe(0);
  });
});

describe('Isolux contour levels', () => {
  it('builds a 1-2-5 series from 1 lx to the largest value below the maximum', () => {
    expect(isoluxContourLevels(352.8)).toEqual([1, 2, 5, 10, 20, 50, 100, 200]);
  });
  it('excludes a maximum that lands exactly on a 1-2-5 value', () => {
    expect(isoluxContourLevels(200)).toEqual([1, 2, 5, 10, 20, 50, 100]);
  });
  it('returns no levels below the floor', () => {
    expect(isoluxContourLevels(0.8)).toEqual([]);
    expect(isoluxContourLevels(0)).toEqual([]);
    expect(isoluxContourLevels(0.8, { minContour: 0.1 })).toEqual([0.1, 0.2, 0.5]);
  });
  it('starts at the next series value above a non-series floor', () => {
    expect(isoluxContourLevels(60, { minContour: 3 })).toEqual([5, 10, 20, 50]);
  });
  it('drops the lowest levels first beyond the cap', () => {
    const levels = isoluxContourLevels(1e6);
    expect(levels).toHaveLength(10);
    expect(levels[0]).toBe(500);
    expect(levels.at(-1)).toBe(500000);
    expect(isoluxContourLevels(1e6, { maxLevels: 3 })).toEqual([100000, 200000, 500000]);
  });
  it('rejects invalid inputs', () => {
    expect(() => isoluxContourLevels(Infinity)).toThrow('Maximum');
    expect(() => isoluxContourLevels(10, { minContour: 0 })).toThrow('Minimum contour');
    expect(() => isoluxContourLevels(10, { maxLevels: 0 })).toThrow('Contour level cap');
  });
});

describe('Marching-squares contours', () => {
  it('interpolates a known linear field in physical coordinates', () => {
    const result = extractContours(
      {
        xs: [0, 1],
        zs: [0, 1],
        values: [
          [0, 1],
          [1, 2],
        ],
      },
      [1],
    );
    expect(result).toEqual([
      {
        level: 1,
        segments: [
          [
            [1, 0],
            [0, 1],
          ],
        ],
      },
    ]);
  });
  it('handles saddle cases, flat fields and exact-corner degeneracies deterministically', () => {
    const grid = {
      xs: [0, 2],
      zs: [0, 2],
      values: [
        [2, 0],
        [0, 2],
      ],
    };
    expect(extractContours(grid, [1])[0]!.segments).toHaveLength(2);
    expect(extractContours(grid, [1])).toEqual(extractContours(grid, [1]));
    // Center (1) below the level: the saddle splits around the two high corners instead.
    expect(extractContours(grid, [1.5])[0]!.segments).toEqual([
      [
        [0.5, 0],
        [0, 0.5],
      ],
      [
        [2, 1.5],
        [1.5, 2],
      ],
    ]);
    expect(
      extractContours(
        {
          ...grid,
          values: [
            [1, 1],
            [1, 1],
          ],
        },
        [1],
      )[0]!.segments,
    ).toEqual([]);
    expect(
      extractContours(
        {
          ...grid,
          values: [
            [1, 0],
            [0, 0],
          ],
        },
        [1],
      )[0]!.segments,
    ).toEqual([]);
  });
  it('recovers a circular isolux footprint at the analytic radius', () => {
    const grid = buildIsoluxGrid(isotropic, { mountingHeight: 2, extent: 8, resolution: 101 });
    const level = (100 * 2) / Math.sqrt(8) ** 3;
    const contour = extractContours(grid, [level])[0]!;
    expect(contour.segments.length).toBeGreaterThan(100);
    contour.segments.flat().forEach(([x, z]) => expect(Math.abs(Math.hypot(x, z) - 2)).toBeLessThan(0.003));
  });
});

describe('Graph input validation', () => {
  it('rejects unsupported A/B coordinates across all graph entry points', () => {
    const unsupported = { ...isotropic, photometricType: 2 };
    for (const call of [
      () => buildIntensityCurves(unsupported),
      () => buildIntensityTopology(unsupported),
      () => buildIsoluxGrid(unsupported),
      () => groundIlluminance(unsupported, 0, 0),
    ])
      expect(call).toThrow('Type C');
  });
  it('bounds sampling, grids, dimensions and angular options with clear errors', () => {
    expect(() => buildIntensityCurves(isotropic, { planes: [] })).toThrow('Plane count');
    expect(() => buildIntensityCurves(isotropic, { samples: 100 })).toThrow('odd');
    expect(() => buildIntensityCurves(isotropic, { angle: Infinity })).toThrow('Fixed angle');
    expect(() => buildIntensityCurves(isotropic, { axis: 'horizontal', planes: [181] })).toThrow('Plane angle');
    expect(() => buildIntensityTopology(isotropic, { verticalSegments: 100000 })).toThrow('Vertical segments');
    expect(() => buildIntensityTopology(isotropic, { elevation: 100 })).toThrow('View elevation');
    expect(() => buildIsoluxGrid(isotropic, { resolution: 100000 })).toThrow('Grid columns');
    expect(() => buildIsoluxGrid(isotropic, { mountingHeight: 0 })).toThrow('Mounting height');
    expect(() => buildIsoluxGrid(isotropic, { extent: -1 })).toThrow('Ground width');
    expect(() => buildIsoluxGrid(isotropic, { aimAngle: -1 })).toThrow('Fixture aim');
    expect(() => buildIsoluxGrid(isotropic, { extent: [1, 2, 3] as unknown as [number, number] })).toThrow(
      'two dimensions',
    );
    expect(() => buildIsoluxGrid(isotropic, { resolution: [5] as unknown as [number, number] })).toThrow(
      'two dimensions',
    );
    expect(() => groundIlluminance(isotropic, NaN, 0)).toThrow('Ground X');
    expect(() => niceTicks(-1)).toThrow('Maximum');
  });
  it('rejects ragged/unsorted contour grids and invalid levels', () => {
    const grid = {
      xs: [0, 1],
      zs: [0, 1],
      values: [
        [1, 2],
        [3, 4],
      ],
    };
    expect(() => extractContours({ ...grid, values: [[1], [2]] }, [1])).toThrow('rectangular');
    expect(() => extractContours({ ...grid, xs: [0, 0] }, [1])).toThrow('strictly increasing');
    expect(() => extractContours(grid, [2, 1])).toThrow('levels');
    expect(() => extractContours(grid, [Infinity])).toThrow('Contour level');
  });
});
