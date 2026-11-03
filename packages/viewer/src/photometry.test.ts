import { describe, expect, it } from 'vitest';
import { parseIES } from 'ies-core';
import { directionAngles, illuminance, intensitySamples } from './photometry.js';

const isotropic = () =>
  parseIES(`IESNA:LM-63-2002
[TEST] isotropic mathematical fixture
TILT=NONE
1 1256 1 3 1 1 2 0 0 0
1 1 10
0 90 180
0
100 100 100
`);

describe('Type C receiver photometry', () => {
  it('uses nadir as zero and wraps azimuth', () => {
    expect(directionAngles(0, -1, 0)[0]).toBe(0);
    expect(directionAngles(0, 1, 0)[0]).toBe(180);
    expect(directionAngles(0, 0, -1)).toEqual([90, 270]);
  });
  it('applies inverse square distance to completed receiver work', () => {
    const profile = isotropic();
    expect(illuminance(profile, [0, 0, 0], [0, 1, 0], 2)).toBeCloseTo(25);
    expect(illuminance(profile, [0, 0, 0], [0, 1, 0], 4)).toBeCloseTo(6.25);
  });
  it('illuminates a wall using its incidence angle and leaves backs dark', () => {
    const profile = isotropic();
    expect(illuminance(profile, [0, 2, -2], [0, 0, 1])).toBeCloseTo(25);
    expect(illuminance(profile, [0, 2, -2], [0, 0, -1])).toBe(0);
    expect(illuminance(profile, [0, 2, 0], [0, 1, 0])).toBe(0);
  });
  it('rejects degenerate graph sample counts', () => {
    expect(() => intensitySamples(isotropic(), 'vertical', 0, 1)).toThrow('at least two');
    expect(() => intensitySamples(isotropic(), 'vertical', 0, 2.5)).toThrow('integer');
  });
  it('samples a complete chosen horizontal or vertical plane', () => {
    const profile = isotropic();
    const vertical = intensitySamples(profile, 'vertical', 45);
    const horizontal = intensitySamples(profile, 'horizontal', 90);
    expect(vertical).toHaveLength(181);
    expect(vertical[0]).toEqual({ angle: 0, intensity: 100 });
    expect(vertical.at(-1)).toEqual({ angle: 180, intensity: 100 });
    expect(horizontal.at(-1)).toEqual({ angle: 360, intensity: 100 });
  });
});
