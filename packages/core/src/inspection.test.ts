import { describe, expect, it } from 'vitest';
import {
  computePhotometricMetrics,
  inputFormat,
  inspectPhotometry,
  inspectParsedPhotometry,
  parseIES,
  parseLDT,
  summarizeIES,
  toPhotometricDocument,
  validatePhotometry,
} from './index.js';
import { inspectPhotometry as cliInspection, validatePhotometry as cliValidation } from '../../cli/src/photometry.js';
import { iesSource } from '../test/iesSource.js';
import { ldtSource } from '../../viewer/test/photometryFixtures.js';

describe('shared inspection and validation models', () => {
  it('returns identical inspection and validation models through CLI re-exports', () => {
    for (const [text, format] of [
      [iesSource(), 'ies'],
      [ldtSource(), 'ldt'],
    ] as const) {
      expect(cliInspection(text, format)).toEqual(inspectPhotometry(text, format));
      expect(cliValidation(text, format)).toEqual(validatePhotometry(text, format));
    }
  });
  it('derives the same IES statistics from parsed and textual sources', () => {
    const text = iesSource();
    const profile = parseIES(text);
    expect(inspectParsedPhotometry(profile)).toEqual(inspectPhotometry(text, 'ies'));
    expect(inspectPhotometry(text, 'ies')).toMatchObject(summarizeIES(profile));
  });
  it('preserves native LDT alternatives until a selection is made', () => {
    const text = ldtSource({ alternatives: true });
    const unselected = inspectPhotometry(text, 'ldt');
    expect(unselected.lampSets).toHaveLength(2);
    expect(unselected.integratedFluxLumens).toBeNull();
    expect(unselected.diagnostics[0]?.code).toBe('LDT_LAMP_SET_SELECTION_REQUIRED');
    const selected = inspectParsedPhotometry(parseLDT(text), 1);
    expect(selected.selectedLampSetIndex).toBe(1);
    expect(selected.peakCandela).toBe(25);
    expect(selected.inputWatts).toBe(5);
  });
  it('reports invalid selections and malformed edits as diagnostics', () => {
    expect(validatePhotometry(ldtSource(), 'ldt', false, -1)).toMatchObject({
      valid: false,
      diagnostics: [{ code: 'LDT_INVALID_LAMP_SET' }],
    });
    expect(validatePhotometry('bad input', 'ies')).toMatchObject({
      valid: false,
      profile: null,
      diagnostics: [{ code: 'IES_MISSING_TILT', severity: 'error' }],
    });
  });
  it('can inspect unsupported rendering coordinates with unavailable metrics', () => {
    const text = iesSource({ type: 2, vertical: [-90, 0, 90], horizontal: [-90, 0, 90] });
    expect(inspectPhotometry(text, 'ies')).toMatchObject({ photometricTypeName: 'B', integratedFluxLumens: null });
  });
});

describe('extended metrics through LDT inspection', () => {
  const extended = [
    'downwardFluxLumens',
    'upwardFluxLumens',
    'peakIntensityCandela',
    'peakDirection',
    'nadirCandela',
    'lightOutputRatio',
    'downwardLightOutputRatio',
    'upwardLightOutputRatio',
    'downwardFluxFraction',
    'cieFluxCode',
    'zonalLumens',
  ] as const;
  it('leaves every extended metric null until an alternative lamp set is selected', () => {
    const unselected = inspectPhotometry(ldtSource({ alternatives: true, emptyDescriptions: true }), 'ldt');
    for (const field of extended) expect(unselected[field]).toBeNull();
    expect(unselected).toMatchObject({
      metricsSupported: false,
      luminaire: 'not specified',
      manufacturer: 'not specified',
      declaredLuminaireFluxLumens: null,
    });
  });
  it('computes extended metrics from the selected lamp set, matching the converted IES profile', () => {
    const text = ldtSource({ alternatives: true });
    const selected = inspectPhotometry(text, 'ldt', 1);
    const { profile } = toPhotometricDocument(parseLDT(text), { lampSetIndex: 1 });
    expect(selected).toMatchObject(computePhotometricMetrics(profile));
    // Isotropic 25 cd against the 500 lm second configuration.
    expect(selected.integratedFluxLumens).toBeCloseTo(4 * Math.PI * 25, 10);
    expect(selected.lightOutputRatio).toBeCloseTo((4 * Math.PI * 25) / 500, 10);
    expect(selected.downwardFluxFraction).toBeCloseTo(0.5, 12);
    expect(selected.cieFluxCode).toEqual([25, 50, 75, 31, 63]);
    expect(selected.nadirCandela).toBeCloseTo(25, 10);
    expect(selected.zonalLumens!.at(-1)!.percentOfLamp).toBeCloseTo((4 * Math.PI * 25) / 5, 10);
    // The first set renormalizes the same relative table to its own 2000 lm rating.
    expect(inspectPhotometry(text, 'ldt', 0).peakIntensityCandela).toBeCloseTo(100, 10);
    expect(() => inspectPhotometry(text, 'ldt', 2)).toThrow(RangeError);
  });
  it('treats a single-set file as selected and absolute LDT as having no lamp-relative ratios', () => {
    const relative = inspectPhotometry(ldtSource(), 'ldt');
    expect(relative.selectedLampSetIndex).toBe(0);
    expect(relative.lightOutputRatio).toBeCloseTo((4 * Math.PI * 100) / 2000, 10);
    const absolute = inspectPhotometry(ldtSource({ absolute: true }), 'ldt');
    expect(absolute.declaredLuminaireFluxLumens).toBe(2000);
    expect(absolute).toMatchObject({
      lightOutputRatio: null,
      downwardLightOutputRatio: null,
      upwardLightOutputRatio: null,
    });
    expect(absolute.cieFluxCode!.slice(3)).toEqual([null, null]);
    expect(absolute.zonalLumens!.every((zone) => zone.percentOfLamp === null)).toBe(true);
    expect(absolute.downwardFluxLumens).toBeCloseTo(2 * Math.PI * 100, 10);
  });
  it('detects formats, fails strict LDT validation on warnings and rethrows unexpected errors', () => {
    expect(inputFormat(iesSource(), 'x.ldt', 'ies')).toBe('ies');
    expect(inputFormat(ldtSource(), 'x.IES')).toBe('ies');
    expect(inputFormat(iesSource(), 'x.LDT')).toBe('ldt');
    expect(inputFormat(ldtSource())).toBe('ldt');
    const empty = ldtSource({ emptyDescriptions: true });
    expect(validatePhotometry(empty, 'ldt').valid).toBe(true);
    expect(validatePhotometry(empty, 'ldt', true)).toMatchObject({
      valid: false,
      diagnostics: [{ code: 'LDT_MISSING_DESCRIPTION' }, { code: 'LDT_MISSING_DESCRIPTION' }],
    });
    expect(validatePhotometry(ldtSource(), 'ldt', false, 0.5).valid).toBe(false);
    expect(validatePhotometry('not an ldt', 'ldt')).toMatchObject({ valid: false, profile: null });
    expect(() => validatePhotometry(null as unknown as string, 'ldt')).toThrow(TypeError);
  });
});
