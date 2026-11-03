import { IESParseError, parseIES, type IESProfile } from './index.js';
import { profileRanges, type SourceRange } from './source.js';

export type IESDiagnosticCode =
  | 'IES_PARSE_ERROR'
  | 'IES_MISSING_TILT'
  | 'IES_UNSUPPORTED_HEADER'
  | 'IES_EXTERNAL_TILT'
  | 'IES_INVALID_NUMBER'
  | 'IES_INVALID_COUNT'
  | 'IES_TABLE_LIMIT'
  | 'IES_INVALID_RANGE'
  | 'IES_INVALID_ANGLES'
  | 'IES_INVALID_COVERAGE'
  | 'IES_NEGATIVE_CANDELA'
  | 'IES_SCALED_OVERFLOW'
  | 'IES_TRAILING_DATA'
  | 'IES_REQUIRED_METADATA'
  | 'IES_UNSUPPORTED_COORDINATES'
  | 'IES_PARTIAL_VERTICAL_COVERAGE'
  | 'IES_HORIZONTAL_SEAM_MISMATCH'
  | 'IES_RESERVED_FIELD'
  | 'IES_FILE_GENERATION_TYPE';

export interface IESDiagnostic {
  code: IESDiagnosticCode;
  severity: 'error' | 'warning' | 'info';
  message: string;
  field?: string;
  /** Source location, when the diagnostic came from parsing text (not from a profile built in memory). */
  range?: SourceRange;
}

export interface IESValidationOptions {
  /** Warnings make valid=false. Their original severity remains unchanged; info never fails validation. */
  strict?: boolean;
}

export interface IESValidationResult {
  valid: boolean;
  profile: IESProfile | null;
  diagnostics: IESDiagnostic[];
}

/** Policy/metadata diagnostics for an already parsed file. This is not a full LM-63 certification.
 * Profiles returned by `parseIES` get source ranges; metadata omissions point at the format line. */
export function diagnoseIES(profile: IESProfile): IESDiagnostic[] {
  const ranges = profileRanges.get(profile);
  const diagnostics = policyDiagnostics(profile);
  if (ranges)
    for (const diagnostic of diagnostics) {
      const range = diagnostic.code === 'IES_REQUIRED_METADATA' ? ranges.version : ranges[diagnostic.field ?? ''];
      if (range) diagnostic.range = range;
    }
  return diagnostics;
}

function policyDiagnostics(profile: IESProfile): IESDiagnostic[] {
  const diagnostics: IESDiagnostic[] = [];
  if (profile.version === 'LM-63-2002' || profile.version === 'LM-63-2019') {
    for (const keyword of ['TEST', 'TESTLAB', 'ISSUEDATE', 'MANUFAC']) {
      if (!profile.metadata[keyword]?.trim()) {
        diagnostics.push({
          code: 'IES_REQUIRED_METADATA',
          severity: 'warning',
          field: keyword,
          message: `${profile.version} requires a nonempty [${keyword}] keyword`,
        });
      }
    }
  }
  if (
    (profile.version === 'LM-63-1995' || profile.version === 'LM-63-2002') &&
    profile.ballastLampPhotometricFactor !== 1
  ) {
    diagnostics.push({
      code: 'IES_RESERVED_FIELD',
      severity: 'warning',
      field: 'ballastLampPhotometricFactor',
      message: 'The reserved second field should be 1; its value is preserved and is not an intensity multiplier',
    });
  }
  if (profile.version === 'LM-63-2019') {
    const value = profile.fileGenerationType ?? profile.ballastLampPhotometricFactor;
    // Preserve provenance without inferring test quality. Table 2 uses five binary-valued decimal places.
    const encoded = value.toFixed(5);
    if (!/^1\.[01]{5}$/.test(encoded) || Math.abs(Number(encoded) - value) > 1e-10) {
      diagnostics.push({
        code: 'IES_FILE_GENERATION_TYPE',
        severity: 'warning',
        field: 'fileGenerationType',
        message: 'Unrecognized LM-63-2019 file generation code; preserved as provenance, never applied to candela',
      });
    }
  }
  if (profile.photometricType !== 1) {
    diagnostics.push({
      code: 'IES_UNSUPPORTED_COORDINATES',
      severity: 'info',
      field: 'photometricType',
      message:
        'Type A/B data can be parsed and inspected; intensity sampling, flux metrics and rendering support Type C only',
    });
    return diagnostics;
  }
  const vertical = profile.verticalAngles;
  const first = vertical[0]!;
  const last = vertical.at(-1)!;
  if (!((first === 0 && (last === 90 || last === 180)) || (first === 90 && last === 180))) {
    diagnostics.push({
      code: 'IES_PARTIAL_VERTICAL_COVERAGE',
      severity: 'warning',
      field: 'verticalAngles',
      message: 'Vertical data do not cover a complete sphere or hemisphere; unmeasured angles are treated as dark',
    });
  }
  const horizontal = profile.horizontalAngles;
  const horizontalSpan = horizontal.at(-1)! - horizontal[0]!;
  if (horizontalSpan === 360) {
    const firstRow = profile.candelaValues[0]!;
    const lastRow = profile.candelaValues.at(-1)!;
    if (
      firstRow.some((value, index) => Math.abs(value - lastRow[index]!) > 1e-8 * Math.max(1, value, lastRow[index]!))
    ) {
      diagnostics.push({
        code: 'IES_HORIZONTAL_SEAM_MISMATCH',
        severity: 'warning',
        field: 'candelaValues',
        message: 'The duplicate 0°/360° horizontal endpoints disagree; the measured intervals are integrated once',
      });
    }
  }
  return diagnostics;
}

/** Nonthrowing parse + validation. Parse errors remain hard errors; metadata omissions are warnings. */
export function validateIES(text: string, options: IESValidationOptions = {}): IESValidationResult {
  try {
    const profile = parseIES(text);
    const diagnostics = diagnoseIES(profile);
    return {
      valid: !diagnostics.some(
        (diagnostic) => diagnostic.severity === 'error' || (options.strict && diagnostic.severity === 'warning'),
      ),
      profile,
      diagnostics,
    };
  } catch (error) {
    if (!(error instanceof IESParseError)) throw error;
    return {
      valid: false,
      profile: null,
      diagnostics: [
        {
          code: error.code,
          severity: 'error',
          message: error.message,
          ...(error.field ? { field: error.field } : {}),
          ...(error.range ? { range: error.range } : {}),
        },
      ],
    };
  }
}
