import { describe, expect, it } from 'vitest';
import { measuredCPlaneIndices, parseLDT, validateLDT, writeLDT, type LDTProfile } from './ldt.js';

export function fixture(symmetry: LDTProfile['symmetry'] = 0): LDTProfile {
  const cAngles = [0, 90, 180, 270];
  const native: LDTProfile = {
    format: 'ldt',
    identification: 'Original test manufacturer',
    typeIndicator: 3,
    symmetry,
    cPlaneSpacing: 90,
    gammaSpacing: 90,
    reportNumber: 'Original synthetic photometry',
    luminaireName: 'Test luminaire',
    luminaireNumber: 'TEST1',
    fileName: 'TEST.LDT',
    dateUser: '2026-11-03 / Test',
    luminaire: { length: 400, width: 200, height: 100 },
    luminousArea: { length: 300, width: 150, heights: [10, 20, 30, 40] },
    downwardFluxFraction: 80,
    lightOutputRatio: 75,
    conversionFactor: 0.5,
    measurementTilt: 15,
    lampSets: [
      {
        lampCount: 2,
        description: 'Synthetic lamp',
        totalLumens: 2000,
        colorTemperature: '3000K',
        colorRendering: '90',
        watts: 30,
      },
    ],
    directRatios: Array.from({ length: 10 }, (_, i) => i / 10),
    cAngles,
    gammaAngles: [0, 90, 180],
    intensities: [],
  };
  native.intensities = measuredCPlaneIndices(native).map((index) => [100 + index * 100, 50 + index * 50, 0]);
  return native;
}

describe('independent EULUMDAT native parser/writer', () => {
  it.each([0, 1, 2, 3, 4] as const)('round trips every native field for symmetry %i', (symmetry) => {
    const profile = fixture(symmetry);
    expect(parseLDT(writeLDT(profile))).toEqual(profile);
  });
  it('follows the special C270→C0→C90 intensity order for Isym 3', () => {
    const profile = fixture(3);
    expect(measuredCPlaneIndices(profile)).toEqual([3, 0, 1]);
    expect(profile.intensities.map((row) => row[0])).toEqual([400, 100, 200]);
  });
  it('accepts decimal commas in scalar and packed numeric fields', () => {
    const text = writeLDT(fixture()).replace('0.5\n', '0,5\n');
    expect(parseLDT(text).conversionFactor).toBe(0.5);
  });
  it('retains separate body and per-plane luminous geometry and multiple lamp sets', () => {
    const profile = fixture();
    profile.lampSets.push({
      lampCount: 1,
      description: 'Second lamp',
      totalLumens: 500,
      colorTemperature: '4000K',
      colorRendering: '80',
      watts: 5,
    });
    expect(parseLDT(writeLDT(profile))).toEqual(profile);
  });
  it('preserves uneven angle grids when spacing is zero', () => {
    const profile = fixture();
    profile.cAngles = [0, 25, 110, 270];
    profile.cPlaneSpacing = 0;
    profile.gammaAngles = [0, 12, 180];
    profile.gammaSpacing = 0;
    expect(parseLDT(writeLDT(profile))).toEqual(profile);
  });
  it('rejects counts and scalar corruption before allocating tables', () => {
    expect(() => parseLDT('Manufacturer\n3\n0\n-3\n')).toThrow('C-plane count');
    expect(() => parseLDT(writeLDT(fixture()).replace('2000\n', 'Infinity\n'))).toThrow('invalid lamp-set lumens');
    expect(() => parseLDT(writeLDT(fixture()) + '2\n')).toThrow('intensity values');
    expect(() => parseLDT(writeLDT(fixture()).split('\n').slice(0, -3).join('\n'))).toThrow('intensity values');
  });
  it('rejects invalid symmetry grids, inconsistent spacing and missing data', () => {
    const invalid = fixture(3);
    invalid.cAngles = [0, 80, 180, 270];
    invalid.cPlaneSpacing = 0;
    expect(() => validateLDT(invalid)).toThrow('boundaries');
    const spacing = fixture();
    spacing.cPlaneSpacing = 30;
    expect(() => validateLDT(spacing)).toThrow('spacing');
    const short = fixture();
    short.intensities.pop();
    expect(() => validateLDT(short)).toThrow('table dimensions');
  });
  it('requires the absolute-photometry convention to use one negative-count lamp set', () => {
    const absolute = fixture();
    absolute.lampSets[0]!.lampCount = -2;
    expect(parseLDT(writeLDT(absolute)).lampSets[0]!.lampCount).toBe(-2);
    absolute.lampSets.push({ ...absolute.lampSets[0]! });
    expect(() => validateLDT(absolute)).toThrow('exactly one');
  });
  it('rejects multiline metadata rather than corrupting line positions', () => {
    const data = fixture();
    data.luminaireName = 'line one\nline two';
    expect(() => writeLDT(data)).toThrow('single lines');
  });
});
