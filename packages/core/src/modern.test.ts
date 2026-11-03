import { describe, expect, it } from 'vitest';
import { IESParseError, diagnoseIES, parseIES, sampleIntensity, validateIES } from './index.js';

import { iesSource } from '../test/iesSource.js';

describe('modern LM-63 and structured validation', () => {
  it('accepts the standard 2019 header and preserves the generation field without scaling candela', () => {
    const profile = parseIES(iesSource({ factors: '0.8 1.10100 20' }));
    expect(profile.version).toBe('LM-63-2019');
    expect(profile.fileGenerationType).toBe(1.101);
    expect(profile.ballastLampPhotometricFactor).toBe(1.101);
    expect(profile.candelaValues).toEqual([[80, 80, 80]]);
    expect(sampleIntensity(profile, 45, 0)).toBe(80);
    expect(validateIES(iesSource({ factors: '0.8 1.10100 20' }), { strict: true }).valid).toBe(true);
  });
  it.each([1, 1.1, 1.00001, 1.0001, 1.101, 1.11])('preserves decimal generation code %s', (code) => {
    const result = validateIES(iesSource({ factors: `1 ${code} 10` }), { strict: true });
    expect(result.valid).toBe(true);
    expect(result.profile?.fileGenerationType).toBe(code);
  });
  it('preserves unknown generation values as a warning, never as a multiplier', () => {
    const result = validateIES(iesSource({ factors: '1 2.23456 10' }));
    expect(result.profile?.candelaValues[0]?.[0]).toBe(100);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'IES_FILE_GENERATION_TYPE', severity: 'warning' }),
    );
    expect(validateIES(iesSource({ factors: '1 2.23456 10' }), { strict: true }).valid).toBe(false);
  });
  it.each(['IESNA:LM-63-1995', 'IESNA:LM-63-2002'])(
    'ignores %s reserved values, warning when they are not unity',
    (header) => {
      const profile = parseIES(iesSource({ header, factors: '0.5 0.25 10' }));
      expect(profile.candelaValues[0]).toEqual([50, 50, 50]);
      expect(profile.fileGenerationType).toBeUndefined();
      expect(diagnoseIES(profile)).toContainEqual(
        expect.objectContaining({ code: 'IES_RESERVED_FIELD', severity: 'warning' }),
      );
      expect(parseIES(iesSource({ header, factors: '1 0 10' })).candelaValues[0]?.[0]).toBe(100);
    },
  );
  it.each(['IESNA91', '[TEST] Legacy'])('retains %s ballast-lamp multiplication', (header) => {
    expect(parseIES(iesSource({ header, factors: '0.5 0.25 10' })).candelaValues[0]).toEqual([12.5, 12.5, 12.5]);
  });
  it.each(['IESNA:LM-63-2002', 'IES:LM-63-2019'])(
    'reports required keywords as version-aware warnings for %s',
    (header) => {
      const text = iesSource({ header, metadata: '[TEST] \n[MANUFAC] Example', factors: '1 1 10' });
      const result = validateIES(text);
      expect(result.valid).toBe(true);
      expect(result.profile).not.toBeNull();
      expect(result.diagnostics.map((diagnostic) => diagnostic.field)).toEqual(['TEST', 'TESTLAB', 'ISSUEDATE']);
      expect(result.diagnostics.every((diagnostic) => diagnostic.severity === 'warning')).toBe(true);
      const strict = validateIES(text, { strict: true });
      expect(strict.valid).toBe(false);
      expect(strict.profile).not.toBeNull();
      expect(strict.diagnostics).toEqual(result.diagnostics);
      expect(() => parseIES(text)).not.toThrow();
    },
  );
  it.each(['[TEST] Legacy', 'IESNA91', 'IESNA:LM-63-1995'])(
    'does not impose newer metadata requirements on %s',
    (header) => {
      expect(validateIES(iesSource({ header, metadata: '', factors: '1 1 10' }), { strict: true }).valid).toBe(true);
    },
  );
  it.each([
    ['', 'IES_MISSING_TILT'],
    [iesSource({ header: 'IESNA:LM-63-2019' }), 'IES_UNSUPPORTED_HEADER'],
    [iesSource({ header: 'IES:LM-63-2025' }), 'IES_UNSUPPORTED_HEADER'],
    [iesSource({ tilt: 'external.tlt' }), 'IES_EXTERNAL_TILT'],
    [iesSource().replace('1 -1 1 3 1', '1 -1 1 3.5 1'), 'IES_INVALID_COUNT'],
    [iesSource().replace('1 -1 1 3 1', '1 -1 1 100001 1'), 'IES_INVALID_COUNT'],
    [iesSource().replace('1 -1 1 3 1', '1 -1 1 10000 10000'), 'IES_TABLE_LIMIT'],
    [iesSource({ vertical: [0, 90, 181] }), 'IES_INVALID_ANGLES'],
    [iesSource({ vertical: [0, 90, 90] }), 'IES_INVALID_ANGLES'],
    [iesSource({ horizontal: [0, 45] }), 'IES_INVALID_COVERAGE'],
    [iesSource({ values: [[100, -1, 0]] }), 'IES_NEGATIVE_CANDELA'],
    [iesSource({ factors: '1 1 -10' }), 'IES_INVALID_RANGE'],
    [iesSource({ factors: '1e999 1 10' }), 'IES_INVALID_NUMBER'],
    [iesSource({ factors: 'NaN 1 10' }), 'IES_INVALID_NUMBER'],
    [iesSource({ values: [[1e308, 1e308, 1e308]] }).replace('1 -1 1 3 1', '1 -1 10 3 1'), 'IES_SCALED_OVERFLOW'],
    [`${iesSource()} 12`, 'IES_TRAILING_DATA'],
  ])('reports stable structured parse diagnostics (%#)', (text, code) => {
    const result = validateIES(text);
    expect(result.valid).toBe(false);
    expect(result.profile).toBeNull();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code, severity: 'error', message: expect.any(String) }),
    ]);
    try {
      parseIES(text);
    } catch (error) {
      expect(error).toBeInstanceOf(IESParseError);
      expect((error as IESParseError).code).toBe(code);
    }
  });
  it('warns about partial coverage and inconsistent duplicate seam endpoints', () => {
    const profile = parseIES(
      iesSource({
        vertical: [10, 45, 80],
        horizontal: [0, 180, 360],
        values: [
          [1, 2, 3],
          [4, 5, 6],
          [9, 9, 9],
        ],
      }),
    );
    expect(diagnoseIES(profile).map((diagnostic) => diagnostic.code)).toEqual([
      'IES_PARTIAL_VERTICAL_COVERAGE',
      'IES_HORIZONTAL_SEAM_MISMATCH',
    ]);
  });
  it('keeps unsupported sampling coordinates informational when inspecting valid A/B files', () => {
    const result = validateIES(iesSource({ type: 2, vertical: [-90, 0, 90] }), { strict: true });
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'IES_UNSUPPORTED_COORDINATES', severity: 'info' }),
    ]);
  });
});
