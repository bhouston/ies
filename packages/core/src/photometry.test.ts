import { describe, expect, it } from 'vitest';
import {
  parseIES,
  sampleIntensity,
  parseLDT,
  parsePhotometry,
  serializeIES,
  serializeLDT,
  toIESProfile,
  toPhotometricDocument,
  writeLDT,
  measuredCPlaneIndices,
  type LDTProfile,
} from './index.js';

function ies(
  options: {
    multiplier?: number;
    ballast?: number;
    reserved?: number;
    lumens?: number;
    type?: number;
    units?: number;
    dimensions?: string;
    vertical?: number[];
    horizontal?: number[];
    values?: number[];
    tilt?: string;
    header?: string;
  } = {},
) {
  const vertical = options.vertical ?? [0, 90, 180];
  const horizontal = options.horizontal ?? [0];
  const values = options.values ?? horizontal.flatMap(() => vertical.map(() => 100));
  return parseIES(
    `${options.header ?? 'IESNA:LM-63-2002'}\n[MANUFAC] Original Test\n[LAMP] Declared test lamp\n[_CUSTOM] Original metadata\nTILT=${options.tilt ?? 'NONE'}\n1 ${options.lumens ?? -1} ${options.multiplier ?? 1} ${vertical.length} ${horizontal.length} ${options.type ?? 1} ${options.units ?? 2} ${options.dimensions ?? '0.2 0.4 0.1'}\n${options.ballast ?? 1} ${options.reserved ?? 1} 10\n${vertical.join(' ')}\n${horizontal.join(' ')}\n${values.join(' ')}`,
  );
}
function ldt(symmetry: LDTProfile['symmetry'] = 0): LDTProfile {
  const value: LDTProfile = {
    format: 'ldt',
    identification: 'Original Test',
    typeIndicator: 3,
    symmetry,
    cPlaneSpacing: 90,
    gammaSpacing: 90,
    reportNumber: 'T1',
    luminaireName: 'Synthetic test',
    luminaireNumber: 'S1',
    fileName: '',
    dateUser: '',
    luminaire: { length: 400, width: 200, height: 100 },
    luminousArea: { length: 300, width: 150, heights: [10, 20, 30, 40] },
    downwardFluxFraction: 80,
    lightOutputRatio: 75,
    conversionFactor: 0.5,
    measurementTilt: 0,
    lampSets: [
      {
        lampCount: 2,
        description: 'Test lamp',
        totalLumens: 2000,
        colorTemperature: '3000K',
        colorRendering: '90',
        watts: 20,
      },
    ],
    directRatios: Array.from({ length: 10 }, () => 0),
    cAngles: [0, 90, 180, 270],
    gammaAngles: [0, 90, 180],
    intensities: [],
  };
  value.intensities = measuredCPlaneIndices(value).map((index) => [100 + index * 100, 50 + index * 50, 0]);
  return value;
}
function expectSameDistribution(a: ReturnType<typeof ies>, b: ReturnType<typeof ies>, tolerance = 8) {
  for (const v of [0, 15, 45, 89, 90, 120, 179, 180])
    for (const h of [0, 25, 45, 89, 90, 135, 180, 225, 270, 315, 359])
      expect(sampleIntensity(b, v, h)).toBeCloseTo(sampleIntensity(a, v, h), tolerance);
}

describe('format-neutral photometric documents', () => {
  it('detects IES and LDT and retains native metadata alongside compatible profiles', () => {
    const native = ldt();
    const document = parsePhotometry(writeLDT(native));
    expect(document.sourceFormat).toBe('ldt');
    expect(document.source).toEqual(native);
    expect(document.profile.horizontalAngles).toEqual([0, 90, 180, 270, 360]);
    expect(document.profile.candelaValues[0]![0]).toBe(100);
    expect(document.geometry.luminaire).toEqual({ length: 0.4, width: 0.2, height: 0.1 });
    expect(document.geometry.luminousHeights).toEqual([0.01, 0.02, 0.03, 0.04]);
    expect(document.lampSets[0]!.totalLumens).toBe(2000);
    const asIES = parsePhotometry(serializeIES(ies()).value);
    expect(asIES.sourceFormat).toBe('ies');
    expect(asIES.profile.metadata._CUSTOM).toBe('Original metadata');
  });
  it.each([0, 1, 2, 3, 4] as const)('expands LDT symmetry %i into the correct absolute distribution', (symmetry) => {
    const profile = toPhotometricDocument(ldt(symmetry)).profile;
    const expected: Record<number, number[]> = {
      0: [100, 200, 300, 400],
      1: [100, 100, 100, 100],
      2: [100, 200, 300, 200],
      3: [100, 200, 100, 400],
      4: [100, 200, 100, 200],
    };
    [0, 90, 180, 270].forEach((h, index) =>
      expect(sampleIntensity(profile, 0, h)).toBeCloseTo(expected[symmetry]![index]!),
    );
    expect(sampleIntensity(profile, 0, 45)).toBeCloseTo(symmetry === 1 ? 100 : 150);
    expectSameDistribution(profile, parseIES(serializeIES(toPhotometricDocument(ldt(symmetry))).value));
  });
  it.each([2, 3, 4] as const)('adds reflected knots for irregular LDT symmetry %i', (symmetry) => {
    const native = ldt(symmetry);
    native.cAngles = [0, 20, 90, 130, 180, 220, 270, 310];
    native.cPlaneSpacing = 0;
    native.intensities = measuredCPlaneIndices(native).map((_, i) => [100 + i * 73, 50 + i * 37, 0]);
    const profile = toPhotometricDocument(native).profile;
    for (const h of [10, 20, 40, 70, 110, 130, 160, 200, 230, 250, 290, 310, 340]) {
      const reflected = symmetry === 2 ? 360 - h : symmetry === 3 ? (180 - h + 360) % 360 : h < 180 ? 180 - h : 540 - h;
      expect(sampleIntensity(profile, 45, h)).toBeCloseTo(sampleIntensity(profile, 45, reflected), 8);
    }
  });
  it('preserves native upper-only LDT coverage when converting to IES', () => {
    const native = ldt(0);
    native.gammaAngles = [90, 135, 180];
    native.gammaSpacing = 0;
    const profile = toPhotometricDocument(native).profile;
    expect(sampleIntensity(profile, 45, 0)).toBe(0);
    const result = parseIES(serializeIES(native).value);
    expect(result.verticalAngles[0]).toBe(90);
    expect(sampleIntensity(result, 45, 0)).toBe(0);
    expectSameDistribution(profile, result);
  });
  it('does not infer bilateral symmetry from a sparse asymmetric LDT grid', () => {
    const native = ldt(0);
    native.cAngles = [0, 20, 90, 170];
    native.cPlaneSpacing = 0;
    const profile = toPhotometricDocument(native).profile;
    expect(profile.horizontalAngles.at(-1)).toBe(360);
    expect(sampleIntensity(profile, 0, 265)).toBeCloseTo(250);
    expect(sampleIntensity(profile, 0, 95)).not.toBeCloseTo(250);
  });
  it('keeps unsupported absolute Type A/B files inspectable with unknown flux', () => {
    for (const type of [2, 3]) {
      const profile = ies({ type, vertical: [-90, 0, 90] });
      const doc = toPhotometricDocument(profile);
      expect(doc.profile.photometricType).toBe(type);
      expect(doc.lampSets[0]!.totalLumens).toBeNull();
      expect(() => toIESProfile(doc)).toThrow('Type C only');
      expect(() => serializeLDT(doc)).toThrow('Type C only');
    }
  });
});

describe('IES serialization', () => {
  it.each([0.4597, 2.5])('folds a multiplier of %s into absolute values exactly once', (multiplier) => {
    const profile = ies({ multiplier, ballast: 0.5 });
    const back = parseIES(serializeIES(profile).value);
    expect(back.candelaMultiplier).toBe(1);
    expect(back.ballastFactor).toBe(1);
    expectSameDistribution(profile, back);
    expect(back.metadata).toEqual(profile.metadata);
  });
  it('retains embedded TILT and legacy ballast correction without repeated application', () => {
    const profile = ies({
      header: 'IESNA91',
      multiplier: 2,
      ballast: 0.5,
      reserved: 0.25,
      tilt: 'INCLUDE\n1\n2\n0 90\n0.5 0.8',
    });
    const result = serializeIES(profile),
      back = parseIES(result.value);
    expect(back.tilt).toEqual(profile.tilt);
    expectSameDistribution(profile, back);
    expect(sampleIntensity(back, 0, 0, 90)).toBeCloseTo(20);
    expect(result.warnings.map((w) => w.code)).toContain('IES_VERSION_CHANGED');
  });
  it('reports loss of numeric LM-63-2019 generation provenance during 2002 export', () => {
    const profile = ies({ header: 'IES:LM-63-2019', reserved: 2.1 });
    const result = serializeIES(profile);
    expect(result.warnings.map((w) => w.code)).toContain('IES_GENERATION_TYPE_OMITTED');
    expectSameDistribution(profile, parseIES(result.value));
  });
  it('wraps large numeric tables without changing angle or value order', () => {
    const profile = ies({ vertical: Array.from({ length: 181 }, (_, i) => i) });
    const result = serializeIES(profile);
    expect(
      result.value
        .split('\n')
        .filter((line) => /^[-\d]/.test(line))
        .every((line) => line.length <= 132),
    ).toBe(true);
    expectSameDistribution(profile, parseIES(result.value));
  });
});

describe('IES/EULUMDAT conversion', () => {
  it.each([-1, 2000])('preserves absolute candela and %s lamp photometry through LDT', (lumens) => {
    const profile = ies({ lumens, multiplier: 0.4597 });
    const result = serializeLDT(profile),
      native = parseLDT(result.value),
      back = parsePhotometry(result.value).profile;
    expect(native.conversionFactor).toBe(1);
    expect(native.lampSets[0]!.lampCount < 0).toBe(lumens === -1);
    expect(back.lumensPerLamp).toBe(lumens);
    expectSameDistribution(profile, back);
    expect(result.warnings.some((w) => w.code === 'IES_KEYWORDS_OMITTED')).toBe(true);
    expect(result.warnings.some((w) => w.category === 'geometry')).toBe(true);
  });
  it('converts feet to native LDT millimeters and back to meters without inventing body dimensions', () => {
    const profile = ies({ units: 1, dimensions: '1 2 3' });
    const native = parseLDT(serializeLDT(profile).value);
    expect(native.luminousArea).toEqual({
      width: 304.8,
      length: 609.6,
      heights: [914.4000000000001, 914.4000000000001, 914.4000000000001, 914.4000000000001],
    });
    expect(native.luminaire).toEqual({ width: 0, length: 0, height: 0 });
    expect(parsePhotometry(writeLDT(native)).profile.dimensions.width).toBeCloseTo(0.3048);
  });
  it('maps the circular luminous-opening encodings rather than exchanging diameter and width', () => {
    const native = parseLDT(serializeLDT(ies({ dimensions: '-0.4 0 0' })).value);
    expect(native.luminousArea.width).toBe(0);
    expect(native.luminousArea.length).toBe(400);
    expect(toPhotometricDocument(native).profile.dimensions).toEqual({ width: -0.4, length: 0, height: 0 });
  });
  it('preserves irregular grids and directional asymmetry', () => {
    const profile = ies({
      vertical: [0, 25, 77, 90, 180],
      horizontal: [0, 20, 70, 130, 270, 360],
      values: [1, 2, 3, 4, 0, 4, 6, 8, 9, 0, 8, 16, 20, 12, 0, 3, 7, 9, 4, 0, 2, 8, 3, 1, 0, 1, 2, 3, 4, 0],
    });
    const native = parseLDT(serializeLDT(profile).value);
    expect(native.cPlaneSpacing).toBe(0);
    expect(native.gammaSpacing).toBe(0);
    expectSameDistribution(profile, toPhotometricDocument(native).profile);
  });
  it('expands mirrored offset IES planes without losing azimuth orientation', () => {
    const profile = ies({ horizontal: [90, 180, 270], values: [100, 50, 0, 200, 100, 0, 300, 150, 0] });
    expectSameDistribution(profile, parsePhotometry(serializeLDT(profile).value).profile);
  });
  it('keeps an unmeasured downward hemisphere dark using an explicit boundary approximation', () => {
    const profile = ies({ vertical: [90, 135, 180], values: [100, 50, 0] });
    const result = serializeLDT(profile),
      back = parsePhotometry(result.value).profile;
    expect(sampleIntensity(profile, 45, 0)).toBe(0);
    expect(sampleIntensity(back, 45, 0)).toBe(0);
    expect(sampleIntensity(back, 89.99, 0)).toBe(0);
    expect(sampleIntensity(back, 90, 0)).toBeCloseTo(100);
    expect(parseLDT(result.value).downwardFluxFraction).toBe(0);
    expect(
      result.warnings.some((w) => w.code === 'MISSING_HEMISPHERE_ZERO_FILLED' && w.category === 'photometry'),
    ).toBe(true);
  });
  it('bakes a chosen tilt once and reports loss of the full correction curve', () => {
    const profile = ies({ tilt: 'INCLUDE\n1\n2\n0 90\n0.5 0.8' });
    const result = serializeLDT(profile, { tiltDegrees: 90 });
    expect(sampleIntensity(parsePhotometry(result.value).profile, 0, 0)).toBeCloseTo(80);
    expect(result.warnings.some((w) => w.code === 'TILT_CURVE_BAKED')).toBe(true);
  });
  it('handles zero light without NaN and rejects impossible zero-flux normalization', () => {
    const zero = ies({ values: [0, 0, 0] });
    const native = parseLDT(serializeLDT(zero).value);
    expect(native.lampSets[0]!.totalLumens).toBe(0);
    expect(native.intensities.flat()).toEqual([0, 0, 0]);
    expect(() => serializeLDT(ies({ lumens: 0 }))).toThrow('zero luminous flux');
    const override = serializeLDT(ies({ lumens: 0 }), { luminousFlux: 1000 });
    expectSameDistribution(ies({ lumens: 0 }), parsePhotometry(override.value).profile);
    expect(override.warnings.some((w) => w.code === 'NORMALIZATION_FLUX_OVERRIDDEN')).toBe(true);
  });
  it('preserves all native LDT metadata on same-format round trips and reports IES losses', () => {
    const native = ldt();
    native.lampSets.push({
      lampCount: 1,
      description: 'Other lamp',
      totalLumens: 500,
      colorTemperature: '4000K',
      colorRendering: '80',
      watts: 5,
    });
    native.measurementTilt = 20;
    expect(() => parsePhotometry(writeLDT(native))).toThrow('lampSetIndex');
    const document = parsePhotometry(writeLDT(native), 'ldt', { lampSetIndex: 0 });
    const same = serializeLDT(document);
    expect(same.warnings).toEqual([]);
    expect(parseLDT(same.value)).toEqual(native);
    const result = serializeIES(document);
    expectSameDistribution(document.profile, parseIES(result.value));
    expect(result.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining([
        'LAMP_SET_SELECTED',
        'LAMP_COLOR_METADATA_REDUCED',
        'LDT_GEOMETRY_REDUCED',
        'LDT_DERIVED_FIELDS_OMITTED',
        'MEASUREMENT_TILT_OMITTED',
      ]),
    );
  });
  it('selects alternative lamp configurations explicitly rather than summing their brightness', () => {
    const native = ldt();
    native.lampSets.push({
      lampCount: 1,
      description: 'Alternative',
      totalLumens: 4000,
      colorTemperature: '4000K',
      colorRendering: '80',
      watts: 35,
    });
    expect(() => toPhotometricDocument(native)).toThrow('lampSetIndex');
    const first = toPhotometricDocument(native, { lampSetIndex: 0 }),
      second = toPhotometricDocument(native, { lampSetIndex: 1 });
    expect(first.profile.candelaValues[0]![0]).toBe(100);
    expect(second.profile.candelaValues[0]![0]).toBe(200);
    expect(second.profile.inputWatts).toBe(35);
    expect(second.profile.lumensPerLamp).toBe(4000);
    expect(second.profile.metadata.LAMP).toBe('Alternative');
    expectSameDistribution(second.profile, parseIES(serializeIES(native, { lampSetIndex: 1 }).value));
    expect(parseLDT(serializeLDT(native).value)).toEqual(native);
    expect(() => toPhotometricDocument(native, { lampSetIndex: 2 })).toThrow('outside');
  });
  it('does not silently discard edits to a document profile', () => {
    const document = toPhotometricDocument(ldt());
    document.profile.candelaValues = document.profile.candelaValues.map((row) => row.map((value) => value * 2));
    const back = parsePhotometry(serializeLDT(document).value);
    expectSameDistribution(document.profile, back.profile);
  });
});
