import { describe, expect, it } from 'vitest';
import {
  inspectPhotometry,
  inspectParsedPhotometry,
  parseIES,
  parseLDT,
  summarizeIES,
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
