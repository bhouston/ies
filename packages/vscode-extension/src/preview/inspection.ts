import {
  detectPhotometricFormat,
  inspectParsedPhotometry,
  validatePhotometry,
  type PhotometryInspection,
} from '@ies-tools/core';
import type { PhotometryValidation } from '@ies-tools/viewer/react';

export interface InspectionState {
  inspection: PhotometryInspection | null;
  validation: PhotometryValidation;
  inspectionError: string | null;
}
/** The preview and CLI share core validation/inspection. Parsed profiles avoid a second parse here. */
export function inspectPreview(
  text: string,
  format?: 'ies' | 'ldt',
  strict = false,
  lampSetIndex?: number,
): InspectionState {
  const validation = validatePhotometry(text, format ?? detectPhotometricFormat(text), strict, lampSetIndex);
  let inspection: PhotometryInspection | null = null;
  let inspectionError: string | null = null;
  if (validation.profile && !validation.diagnostics.some((item) => item.severity === 'error')) {
    try {
      inspection = inspectParsedPhotometry(validation.profile, lampSetIndex);
    } catch (error) {
      inspectionError = error instanceof Error ? error.message : String(error);
    }
  }
  return { inspection, validation: { valid: validation.valid, diagnostics: validation.diagnostics }, inspectionError };
}
