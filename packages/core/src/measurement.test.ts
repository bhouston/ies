import { describe, expect, it } from 'vitest';
import { groundIlluminance, parseIES } from './index.js';
import { iesSource } from '../test/iesSource.js';
import {
  illuminanceInUnits,
  illuminanceLegend,
  illuminanceRampRgb,
  lengthFromUnits,
  lengthInUnits,
  peakReceiverIlluminance,
} from './measurement.js';

describe('measurement units', () => {
  it('converts lux to footcandles and metres to feet', () => {
    expect(illuminanceInUnits(10.7639, 'imperial')).toBeCloseTo(1, 4);
    expect(illuminanceInUnits(50, 'metric')).toBe(50);
    expect(lengthInUnits(0.3048, 'imperial')).toBeCloseTo(1, 12);
    expect(lengthInUnits(2, 'metric')).toBe(2);
    expect(lengthFromUnits(10, 'imperial')).toBeCloseTo(3.048, 12);
    expect(lengthFromUnits(3, 'metric')).toBe(3);
  });
});

describe('illuminance legend', () => {
  it('spans three decades below the peak with 1-2-5 levels in the display unit', () => {
    const metric = illuminanceLegend(250, 'metric');
    expect(metric.unit).toBe('lx');
    expect(metric.levels.map((level) => level.value)).toEqual([0.5, 1, 2, 5, 10, 20, 50, 100, 200]);
    expect(metric.levels.every((level) => level.lux === level.value)).toBe(true);
    const imperial = illuminanceLegend(250, 'imperial');
    expect(imperial.unit).toBe('fc');
    expect(imperial.levels.map((level) => level.value)).toEqual([0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20]);
    expect(imperial.levels.at(-1)!.lux).toBeCloseTo(215.278, 2);
    expect(imperial.peakValue).toBeCloseTo(23.226, 3);
    expect(illuminanceLegend(0, 'metric').levels).toEqual([]);
  });
  it('matches the isolux chart colour ramp at its ends and midpoint', () => {
    expect(illuminanceRampRgb(0)).toEqual([8, 13, 69]);
    expect(illuminanceRampRgb(0.5)).toEqual([20, 184, 68]);
    expect(illuminanceRampRgb(1)).toEqual([237, 190, 94]);
  });
});

describe('peak receiver illuminance', () => {
  it('finds the nadir peak of an isotropic source on the floor', () => {
    const profile = parseIES(iesSource());
    expect(peakReceiverIlluminance(profile, 2)).toBeCloseTo(groundIlluminance(profile, 0, 0), 9);
    expect(peakReceiverIlluminance(profile, 4)).toBeCloseTo(100 / 16, 9);
  });
  it('includes a closer wall and ignores directions that reach the floor first', () => {
    const profile = parseIES(iesSource());
    // Isotropic 100 cd: the nearest wall point at 1 m receives 100 lx, the floor at 2 m 25 lx.
    expect(peakReceiverIlluminance(profile, 2, 1)).toBeCloseTo(100, 9);
    expect(peakReceiverIlluminance(profile, 2, 4)).toBeCloseTo(25, 9);
    const sideways = parseIES(iesSource({ vertical: [0, 89, 90, 180], values: [[0, 0, 100, 0]] }));
    expect(peakReceiverIlluminance(sideways, 2)).toBeCloseTo(0, 9);
    expect(peakReceiverIlluminance(sideways, 2, 1)).toBeCloseTo(100, 9);
  });
});
