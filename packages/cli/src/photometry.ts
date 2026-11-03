import {
  detectPhotometricFormat,
  diagnoseIES,
  parseIES,
  parseLDT,
  summarizeIES,
  toPhotometricDocument,
  validateIES,
  LDTParseError,
  type IESDiagnostic,
  type IESProfile,
  type LDTProfile,
  type PhotometricLampSet,
} from 'ies-core';

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
  // Usability advisories, not invented EULUMDAT required-keyword rules.
  for (const field of ['identification', 'luminaireName'] as const) {
    if (!profile[field].trim())
      diagnostics.push({
        code: 'LDT_MISSING_DESCRIPTION',
        severity: 'warning',
        field,
        message: `The ${field} description is empty; adding it makes this file easier to identify`,
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
    if (lampSetIndex !== undefined && lampSetIndex >= profile.lampSets.length) {
      diagnostics.push({
        code: 'LDT_INVALID_LAMP_SET',
        severity: 'error',
        field: 'lampSetIndex',
        message: 'The selected lamp configuration is outside the available lamp sets',
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
      diagnostics: [{ code: error.code, severity: 'error' as const, message: error.message }],
    };
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
  if (format === 'ies') {
    const profile = parseIES(text);
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
  const native = parseLDT(text);
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
        'Lamp sets are alternative configurations; select one with --lamp-set to calculate intensity, flux and efficacy',
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
        metricsUnsupportedReason: 'Select an alternative lamp configuration with --lamp-set before calculating metrics',
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
