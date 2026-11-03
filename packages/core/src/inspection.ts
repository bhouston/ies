import {
  detectPhotometricFormat,
  diagnoseIES,
  parseIES,
  parseLDT,
  summarizeIES,
  toPhotometricDocument,
  validateIES,
  LDTParseError,
  IESParseError,
  type IESDiagnostic,
  type IESProfile,
  type LDTProfile,
  type PhotometricLampSet,
} from './index.js';
import { profileRanges, type SourceField } from './source.js';

export type InputFormat = 'ies' | 'ldt';
export interface PhotometryDiagnostic extends Omit<IESDiagnostic, 'code'> {
  code: string;
}

/** Explicit hint wins, then conventional extension; extensionless sources use content detection. */
export function inputFormat(text: string, file = '', hint?: InputFormat): InputFormat {
  return hint ?? (/\.ies$/i.test(file) ? 'ies' : /\.ldt$/i.test(file) ? 'ldt' : detectPhotometricFormat(text));
}
export function ldtDiagnostics(profile: LDTProfile): PhotometryDiagnostic[] {
  const diagnostics: PhotometryDiagnostic[] = [];
  const ranges = profileRanges.get(profile);
  // Usability advisories, not invented EULUMDAT required-keyword rules.
  for (const field of ['identification', 'luminaireName'] as const) {
    if (!profile[field].trim())
      diagnostics.push({
        code: 'LDT_MISSING_DESCRIPTION',
        severity: 'warning',
        field,
        message: `The ${field} description is empty; adding it makes this file easier to identify`,
        ...(ranges?.[field] ? { range: ranges[field] } : {}),
      });
  }
  return diagnostics;
}

export function validatePhotometry(
  text: string,
  format: InputFormat,
  strict = false,
  lampSetIndex?: number,
): { valid: boolean; profile: IESProfile | LDTProfile | null; diagnostics: PhotometryDiagnostic[] } {
  if (format === 'ies') return validateIES(text, { strict });
  try {
    const profile = parseLDT(text);
    const diagnostics = ldtDiagnostics(profile);
    if (
      lampSetIndex !== undefined &&
      (!Number.isSafeInteger(lampSetIndex) || lampSetIndex < 0 || lampSetIndex >= profile.lampSets.length)
    ) {
      diagnostics.push({
        code: 'LDT_INVALID_LAMP_SET',
        severity: 'error',
        field: 'lampSetIndex',
        message: 'The selected lamp configuration is outside the available lamp sets',
        ...lampSetRange(profile),
      });
    }
    return {
      valid: !diagnostics.some((item) => item.severity === 'error' || (strict && item.severity === 'warning')),
      profile,
      diagnostics,
    };
  } catch (error) {
    if (!(error instanceof LDTParseError)) throw error;
    return {
      valid: false,
      profile: null,
      diagnostics: [parseErrorDiagnostic(error)],
    };
  }
}

function lampSetRange(profile: LDTProfile): Pick<PhotometryDiagnostic, 'range'> {
  const range = profileRanges.get(profile)?.lampSetCount;
  return range ? { range } : {};
}

function parseErrorDiagnostic(error: IESParseError | LDTParseError): PhotometryDiagnostic {
  return {
    code: error.code,
    severity: 'error',
    message: error.message,
    ...(error instanceof IESParseError && error.field ? { field: error.field } : {}),
    ...(error.range ? { range: error.range } : {}),
  };
}

export interface PhotometrySourceDescription {
  valid: boolean;
  profile: IESProfile | LDTProfile | null;
  diagnostics: PhotometryDiagnostic[];
  /** Described source tokens and lines in document order. Partial when the text is invalid. */
  fields: SourceField[];
}

/**
 * Validate source text and describe every header line, keyword, angle and intensity it contains, for
 * editor hover help and outlines. Never throws for malformed photometry: parse errors become diagnostics
 * and `fields` covers the text read before the error. Diagnostics carry source ranges.
 */
export function describePhotometrySource(
  text: string,
  format: InputFormat,
  strict = false,
): PhotometrySourceDescription {
  const fields: SourceField[] = [];
  try {
    const profile = format === 'ies' ? parseIES(text, fields) : parseLDT(text, fields);
    const diagnostics = format === 'ies' ? diagnoseIES(profile as IESProfile) : ldtDiagnostics(profile as LDTProfile);
    return {
      valid: !diagnostics.some((item) => item.severity === 'error' || (strict && item.severity === 'warning')),
      profile,
      diagnostics,
      fields,
    };
  } catch (error) {
    if (!(error instanceof IESParseError || error instanceof LDTParseError)) throw error;
    return { valid: false, profile: null, diagnostics: [parseErrorDiagnostic(error)], fields };
  }
}

type CoreSummary = ReturnType<typeof summarizeIES>;
export interface PhotometryInspection extends Omit<
  CoreSummary,
  'lampCount' | 'lumensPerLamp' | 'inputWatts' | 'peakCandela'
> {
  sourceFormat: InputFormat;
  lampCount: number | null;
  lumensPerLamp: number | null;
  inputWatts: number | null;
  peakCandela: number | null;
  selectedLampSetIndex: number | null;
  lampSets: PhotometricLampSet[];
  declaredLuminaireFluxLumens: number | null;
  diagnostics: PhotometryDiagnostic[];
}

export function inspectPhotometry(text: string, format: InputFormat, lampSetIndex?: number): PhotometryInspection {
  return inspectParsedPhotometry(format === 'ies' ? parseIES(text) : parseLDT(text), lampSetIndex);
}

function isLDTProfile(profile: IESProfile | LDTProfile): profile is LDTProfile {
  return 'format' in profile && profile.format === 'ldt';
}

/** Inspect a validated native profile without parsing its source text again. */
export function inspectParsedPhotometry(profile: IESProfile | LDTProfile, lampSetIndex?: number): PhotometryInspection {
  if (!isLDTProfile(profile)) {
    const document = toPhotometricDocument(profile);
    return {
      ...summarizeIES(profile),
      sourceFormat: 'ies',
      selectedLampSetIndex: null,
      lampSets: document.lampSets,
      declaredLuminaireFluxLumens: null,
      diagnostics: diagnoseIES(profile),
    };
  }
  const native = profile;
  if (lampSetIndex !== undefined && lampSetIndex >= native.lampSets.length)
    throw new RangeError('The selected lamp configuration is outside the available lamp sets');
  const selected =
    native.lampSets.length === 1 || lampSetIndex !== undefined
      ? toPhotometricDocument(native, { lampSetIndex })
      : undefined;
  const diagnostics = ldtDiagnostics(native);
  if (!selected)
    diagnostics.push({
      code: 'LDT_LAMP_SET_SELECTION_REQUIRED',
      severity: 'info',
      field: 'lampSetIndex',
      message:
        'Lamp sets are alternative configurations; select a configuration to calculate intensity, flux and efficacy',
      ...lampSetRange(native),
    });
  const nativeLamp = selected ? native.lampSets[selected.selectedLampSetIndex ?? 0]! : undefined;
  const summary = selected
    ? summarizeIES(selected.profile)
    : {
        format: 'EULUMDAT LDT',
        version: 'EULUMDAT',
        metadata: {
          MANUFAC: native.identification,
          TEST: native.reportNumber,
          LUMINAIRE: native.luminaireName,
          LUMCAT: native.luminaireNumber,
        },
        photometricType: 1,
        photometricTypeName: 'C',
        photometry: 'unselected',
        lightSource: 'select a lamp configuration',
        lampCatalog: 'not specified',
        luminaire: native.luminaireName || 'not specified',
        manufacturer: native.identification || 'not specified',
        lampCount: null,
        lumensPerLamp: null,
        inputWatts: null,
        peakCandela: null,
        verticalAngles: native.gammaAngles.length,
        horizontalAngles: native.cAngles.length,
        units: 'meters' as const,
        dimensions: {
          width: native.luminousArea.width / 1000,
          length: native.luminousArea.length / 1000,
          height: Math.max(...native.luminousArea.heights) / 1000,
        },
        hasTilt: false,
        fileGenerationType: null,
        metricsSupported: false,
        metricsUnsupportedReason: 'Select an alternative lamp configuration before calculating metrics',
        declaredLampFluxLumens: null,
        integratedFluxLumens: null,
        luminousEfficacyLumensPerWatt: null,
        beamAngles: [],
        metricsTiltDegrees: 0,
      };
  return {
    ...summary,
    format: 'EULUMDAT LDT',
    sourceFormat: 'ldt',
    selectedLampSetIndex: selected?.selectedLampSetIndex ?? null,
    lampSets: native.lampSets,
    declaredLuminaireFluxLumens: nativeLamp && nativeLamp.lampCount < 0 ? nativeLamp.totalLumens : null,
    diagnostics,
  };
}
