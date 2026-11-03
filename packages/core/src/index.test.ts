import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IESParseError, parseIES, sampleIntensity, summarizeIES } from './index.js';

function source(
  options: {
    header?: string;
    horizontal?: number[];
    vertical?: number[];
    values?: number[];
    multiplier?: number;
    type?: number;
    tilt?: string;
  } = {},
) {
  const horizontal = options.horizontal ?? [0];
  const vertical = options.vertical ?? [0, 90, 180];
  const values = options.values ?? horizontal.flatMap(() => [100, 50, 0]);
  return `${options.header ?? 'IESNA:LM-63-2002'}\n[MANUFAC] Example\n[LUMINAIRE] Unit\n[MORE] continuation\nTILT=${options.tilt ?? 'NONE'}\n1 -1 ${options.multiplier ?? 1} ${vertical.length} ${horizontal.length} ${options.type ?? 1} 2 0.1 0.2 0.3\n1 1 10\n${vertical.join(' ')}\n${horizontal.join(' ')}\n${values.join(' ')}`;
}

describe('parseIES', () => {
  it.each(readdirSync(new URL('../../../fixtures/', import.meta.url)).filter((name) => name.endsWith('.ies')))(
    'parses real fixture %s without normalizing candela',
    (name) => {
      const profile = parseIES(readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url), 'utf8'));
      expect(profile.photometricType).toBe(1);
      expect(profile.candelaValues).toHaveLength(profile.horizontalAngles.length);
      expect(profile.candelaValues.every((row) => row.length === profile.verticalAngles.length)).toBe(true);
      expect(summarizeIES(profile).peakCandela).toBeGreaterThan(1);
      expect(sampleIntensity(profile, 0, 0)).toBeGreaterThanOrEqual(0);
    },
  );
  it.each(['IESNA:LM-63-1995', 'IESNA:LM-63-2002', 'IESNA91', '[TEST] Legacy test'])(
    'accepts %s headers and whitespace / comma-separated numbers',
    (header) => {
      const profile = parseIES(
        `\uFEFF${source({ header })
          .split('\n')
          .map((line) => (/^[0-9+-]/.test(line) ? line.replaceAll(' ', ',') : line))
          .join('\r\n')}`,
      );
      expect(profile.lumensPerLamp).toBe(-1);
      expect(profile.units).toBe('meters');
      expect(profile.metadata.LUMINAIRE).toBe('Unit\ncontinuation');
    },
  );
  it('summarizes format and declared light source without guessing a technology', () => {
    const profile = parseIES(source());
    expect(summarizeIES(profile)).toMatchObject({
      format: 'IES LM-63',
      version: 'LM-63-2002',
      photometricType: 1,
      photometricTypeName: 'C',
      photometry: 'absolute',
      manufacturer: 'Example',
      luminaire: 'Unit\ncontinuation',
      lightSource: 'not specified',
      lampCatalog: 'not specified',
    });
    const declared = parseIES(source().replace('[MANUFAC] Example', '[LAMP] LED module\n[LAMPCAT] LM123'));
    expect(summarizeIES(declared)).toMatchObject({
      manufacturer: 'not specified',
      lightSource: 'LED module',
      lampCatalog: 'LM123',
    });
    delete declared.metadata.LAMP;
    expect(summarizeIES(declared).lightSource).toBe('LM123');
  });
  it('identifies relative photometry and Type A/B names in summaries', () => {
    const typeB = parseIES(source({ type: 2, vertical: [-90, 0, 90] }).replace('1 -1 1', '1 800 1'));
    expect(summarizeIES(typeB)).toMatchObject({
      photometry: 'relative',
      lumensPerLamp: 800,
      photometricType: 2,
      photometricTypeName: 'B',
    });
    const typeA = parseIES(source({ type: 3, vertical: [-90, 0, 90] }));
    expect(summarizeIES(typeA).photometricTypeName).toBe('A');
  });
  it('applies candela multiplier without peak normalization', () => {
    const profile = parseIES(source({ multiplier: 2 }));
    expect(profile.candelaValues).toEqual([[200, 100, 0]]);
    expect(summarizeIES(profile).peakCandela).toBe(200);
  });
  it('preserves embedded tilt data and interpolates correction explicitly', () => {
    const profile = parseIES(source({ tilt: 'INCLUDE\n1\n3\n0 45 90\n1 0.8 0.6' }));
    expect(profile.tilt?.geometry).toBe(1);
    expect(sampleIntensity(profile, 0, 0)).toBe(100);
    expect(sampleIntensity(profile, 0, 0, 22.5)).toBe(90);
  });
  it.each([
    '',
    'garbage',
    source({ header: 'IESNA:LM-63-2050' }),
    source({ tilt: 'other.tlt' }),
    source().replace('1 -1 1 3 1', '1 -1 1 3.5 1'),
    source().replace('1 -1 1 3 1', '1 -1 1 300000 1'),
    source({ vertical: [0, 90, 90] }),
    source({ horizontal: [0, 75], values: [1, 2, 3, 4, 5, 6] }),
    source({ values: [1, -2, 3] }),
    source({ values: [1, 2] }),
    `${source()} 123`,
    source().replace('0.1', 'NaN'),
    source({ values: [1, Infinity, 2] }),
  ])('rejects malformed data promptly (%#)', (text) => expect(() => parseIES(text)).toThrow(IESParseError));
});

describe('sampleIntensity', () => {
  it('interpolates vertical angles and makes missing hemispheres dark', () => {
    const profile = parseIES(source({ vertical: [0, 90], values: [100, 0] }));
    expect(sampleIntensity(profile, 45, 123)).toBe(50);
    expect(sampleIntensity(profile, 91, 0)).toBe(0);
    expect(sampleIntensity(profile, -1, 0)).toBe(0);
  });
  it('interpolates both axes and mirrors quadrants', () => {
    const profile = parseIES(source({ horizontal: [0, 90], values: [100, 50, 0, 200, 100, 0] }));
    expect(sampleIntensity(profile, 45, 45)).toBe(112.5);
    expect(sampleIntensity(profile, 0, 135)).toBe(150);
    expect(sampleIntensity(profile, 0, 225)).toBe(150);
    expect(sampleIntensity(profile, 0, -45)).toBe(150);
  });
  it('mirrors bilateral photometry with its original horizontal orientation', () => {
    const profile = parseIES(source({ horizontal: [90, 180, 270], values: [10, 10, 10, 20, 20, 20, 30, 30, 30] }));
    expect(sampleIntensity(profile, 0, 0)).toBe(20);
    expect(sampleIntensity(profile, 0, 90)).toBe(10);
    expect(sampleIntensity(profile, 0, 270)).toBe(30);
  });
  it('interpolates the asymmetric wrap seam when the exporter omits 360°', () => {
    const profile = parseIES(
      source({ horizontal: [0, 90, 180, 270], values: [100, 100, 100, 200, 200, 200, 300, 300, 300, 400, 400, 400] }),
    );
    expect(sampleIntensity(profile, 0, 315)).toBe(250);
    expect(sampleIntensity(profile, 0, 360)).toBe(100);
    expect(sampleIntensity(profile, 0, -45)).toBe(250);
  });
  it('parses Type B metadata but rejects sampling unsupported coordinate systems', () => {
    const profile = parseIES(source({ type: 2, vertical: [-90, 0, 90] }));
    expect(() => sampleIntensity(profile, 0, 0)).toThrow('Type C');
  });
  it('rejects non-finite sample angles', () =>
    expect(() => sampleIntensity(parseIES(source()), NaN, 0)).toThrow(RangeError));
});
