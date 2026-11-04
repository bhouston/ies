import { parseIES, sampleIntensity, type IESProfile } from './index.js';
import {
  measuredCPlaneIndices,
  parseLDT,
  validateLDT,
  writeLDT,
  type LDTDimensions,
  type LDTLampSet,
  type LDTProfile,
} from './ldt.js';
import { calculateLuminousFlux } from './metrics.js';

export interface ConversionWarning {
  code: string;
  category: 'metadata' | 'geometry' | 'photometry';
  message: string;
}
export interface ConversionResult<T> {
  value: T;
  warnings: ConversionWarning[];
}
/** A common absolute-candela distribution plus original fields needed for honest interchange.
 * `profile` is directly compatible with all existing IESProfile sampling/viewer consumers.
 * Geometry here is meters; native source geometry remains in its original units.
 */
export interface PhotometricLampSet extends Omit<LDTLampSet, 'totalLumens'> {
  /** Null when absolute flux cannot be integrated in an unsupported coordinate system. */
  totalLumens: number | null;
}
export interface PhotometricDocument {
  sourceFormat: 'ies' | 'ldt';
  selectedLampSetIndex: number | null;
  profile: IESProfile;
  lampSets: PhotometricLampSet[];
  geometry: {
    luminaire: LDTDimensions | null;
    luminousOpening: LDTDimensions;
    luminousHeights: [number, number, number, number] | null;
  };
  /** Native fields are retained, including fields the target format cannot represent. */
  source: IESProfile | LDTProfile;
}
export type PhotometricInput = IESProfile | LDTProfile | PhotometricDocument;
export interface PhotometryOptions {
  /** Required for multiple LDT lamp configurations; alternatives are never implicitly summed. */
  lampSetIndex?: number;
}
/** A required or out-of-range selection among alternative EULUMDAT lamp configurations. */
export class LampSetSelectionError extends RangeError {
  readonly code: 'LDT_LAMP_SET_SELECTION_REQUIRED' | 'LDT_INVALID_LAMP_SET';
  constructor(
    readonly lampSetCount: number,
    readonly lampSetIndex?: number,
  ) {
    super(
      lampSetIndex === undefined
        ? `Multiple EULUMDAT lamp sets require an explicit lampSetIndex from 0 to ${lampSetCount - 1}; configurations are not summed`
        : `lampSetIndex is outside the available EULUMDAT lamp sets. Set it to an integer from 0 to ${lampSetCount - 1}.`,
    );
    this.name = 'LampSetSelectionError';
    this.code = lampSetIndex === undefined ? 'LDT_LAMP_SET_SELECTION_REQUIRED' : 'LDT_INVALID_LAMP_SET';
  }
}

export interface SerializeLDTOptions extends PhotometryOptions {
  /** Explicit normalization flux when the IES document does not supply usable lamp lumens. */
  luminousFlux?: number;
  /** Bake a fixed lamp-tilt correction; the full IES TILT curve cannot be represented in LDT. */
  tiltDegrees?: number;
}

function warning(code: string, category: ConversionWarning['category'], message: string): ConversionWarning {
  return { code, category, message };
}
function isDocument(value: PhotometricInput): value is PhotometricDocument {
  return 'sourceFormat' in value;
}
function isLDT(value: IESProfile | LDTProfile): value is LDTProfile {
  return 'format' in value && value.format === 'ldt';
}
function scaledDimensions(value: LDTDimensions, scale: number): LDTDimensions {
  return { width: value.width * scale, length: value.length * scale, height: value.height * scale };
}
function checkProfileAngles(angles: number[], name: string, min: number, max: number): void {
  if (
    !angles.length ||
    angles.some(
      (angle, i) => !Number.isFinite(angle) || angle < min || angle > max || (i > 0 && angle <= angles[i - 1]!),
    )
  )
    throw new Error(
      `Invalid compatible profile: ${name} must be finite, strictly increasing and within ${min}..${max}`,
    );
}
function validateCompatibleProfile(profile: IESProfile): void {
  checkProfileAngles(
    profile.verticalAngles,
    'vertical angles',
    profile.photometricType === 1 ? 0 : -90,
    profile.photometricType === 1 ? 180 : 90,
  );
  checkProfileAngles(
    profile.horizontalAngles,
    'horizontal angles',
    profile.photometricType === 1 ? 0 : -90,
    profile.photometricType === 1 ? 360 : 90,
  );
  if (
    profile.candelaValues.length !== profile.horizontalAngles.length ||
    profile.candelaValues.some(
      (row) =>
        row.length !== profile.verticalAngles.length || row.some((value) => !Number.isFinite(value) || value < 0),
    )
  )
    throw new Error('Invalid compatible profile: candela values must be finite, nonnegative and match the angle grid');
  if (profile.photometricType === 1 && profile.horizontalAngles.length > 1) {
    const span = profile.horizontalAngles.at(-1)! - profile.horizontalAngles[0]!;
    if (span !== 90 && span !== 180 && span <= 180)
      throw new Error('Invalid compatible profile: unsupported Type C horizontal coverage');
  }
}
function sourceType(profile: IESProfile): void {
  if (profile.photometricType !== 1)
    throw new Error(
      'Photometric conversion supports Type C only; Type A/B data requires an explicit validated coordinate transformation',
    );
}
function interpolate(angles: number[], rows: number[][], angle: number): number[] {
  if (angle <= angles[0]!) return rows[0]!.slice();
  for (let i = 1; i < angles.length; i++) {
    if (angle <= angles[i]!) {
      const t = (angle - angles[i - 1]!) / (angles[i]! - angles[i - 1]!);
      return rows[i - 1]!.map((value, v) => value + (rows[i]![v]! - value) * t);
    }
  }
  return rows.at(-1)!.slice();
}

function ldtToProfile(data: LDTProfile, lampSetIndex: number): IESProfile {
  validateLDT(data);
  const indices = measuredCPlaneIndices(data);
  const measuredAngles = indices.map((i) => data.cAngles[i]!);
  if (data.symmetry === 3)
    for (let i = 1; i < measuredAngles.length; i++)
      if (measuredAngles[i]! < measuredAngles[i - 1]!) measuredAngles[i]! += 360;
  const selectedLamp = data.lampSets[lampSetIndex]!;
  const totalLumens = selectedLamp.totalLumens;
  const scale = (totalLumens * data.conversionFactor) / 1000;
  const fullAngles = new Set([...data.cAngles, 360]);
  for (const angle of measuredAngles) {
    const h = ((angle % 360) + 360) % 360;
    if (data.symmetry === 2) fullAngles.add((360 - h) % 360);
    if (data.symmetry === 3) fullAngles.add((180 - h + 360) % 360);
    if (data.symmetry === 4) for (const mirrored of [h, 180 - h, 180 + h, 360 - h]) fullAngles.add(mirrored % 360);
  }
  const horizontalAngles = data.symmetry === 1 ? [0] : [...fullAngles].toSorted((a, b) => a - b);
  const candelaValues = horizontalAngles.map((angle) => {
    let mapped = angle;
    if (data.symmetry === 1) mapped = 0;
    else if (data.symmetry === 2) mapped = angle > 180 ? 360 - angle : angle;
    else if (data.symmetry === 3) {
      if (mapped > 90 && mapped < 270) mapped = (180 - mapped + 360) % 360;
      if (mapped < 270) mapped += 360;
    } else if (data.symmetry === 4) {
      mapped %= 180;
      if (mapped > 90) mapped = 180 - mapped;
    }
    const rows = data.intensities;
    let row: number[];
    if (data.symmetry === 0 && mapped > measuredAngles.at(-1)!) {
      const t = (mapped - measuredAngles.at(-1)!) / (360 - measuredAngles.at(-1)!);
      row = rows.at(-1)!.map((value, v) => value + (rows[0]![v]! - value) * t);
    } else row = interpolate(measuredAngles, rows, mapped);
    return row.map((value) => {
      const result = value * scale;
      if (!Number.isFinite(result)) throw new Error('EULUMDAT absolute intensity overflows the finite candela range');
      return result;
    });
  });
  const lamps = Math.abs(selectedLamp.lampCount);
  const absolute = selectedLamp.lampCount < 0;
  const maximumHeight = Math.max(...data.luminousArea.heights);
  return {
    version: 'EULUMDAT',
    metadata: {
      MANUFAC: data.identification,
      TEST: data.reportNumber,
      LUMINAIRE: data.luminaireName,
      LUMCAT: data.luminaireNumber,
      LAMP: selectedLamp.description,
    },
    lampCount: lamps,
    lumensPerLamp: absolute ? -1 : totalLumens / lamps,
    candelaMultiplier: 1,
    photometricType: 1,
    units: 'meters',
    dimensions: {
      width: data.luminousArea.width === 0 ? -data.luminousArea.length / 1000 : data.luminousArea.width / 1000,
      length: data.luminousArea.width === 0 ? 0 : data.luminousArea.length / 1000,
      height: maximumHeight / 1000,
    },
    ballastFactor: 1,
    ballastLampPhotometricFactor: 1,
    inputWatts: selectedLamp.watts,
    verticalAngles: data.gammaAngles.slice(),
    horizontalAngles,
    candelaValues,
    tilt: null,
  };
}

export function toPhotometricDocument(input: PhotometricInput, options: PhotometryOptions = {}): PhotometricDocument {
  if (isDocument(input)) {
    if (options.lampSetIndex !== undefined && options.lampSetIndex !== input.selectedLampSetIndex)
      return toPhotometricDocument(input.source, options);
    return input;
  }
  if (isLDT(input)) {
    if (input.lampSets.length > 1 && options.lampSetIndex === undefined)
      throw new LampSetSelectionError(input.lampSets.length);
    const index = options.lampSetIndex ?? 0;
    if (!Number.isSafeInteger(index) || index < 0 || index >= input.lampSets.length)
      throw new LampSetSelectionError(input.lampSets.length, index);
    return {
      sourceFormat: 'ldt',
      selectedLampSetIndex: index,
      profile: ldtToProfile(input, index),
      lampSets: input.lampSets.map((lamp) => ({ ...lamp })),
      geometry: {
        luminaire: scaledDimensions(input.luminaire, 0.001),
        luminousOpening: {
          width: input.luminousArea.width / 1000,
          length: input.luminousArea.length / 1000,
          height: Math.max(...input.luminousArea.heights) / 1000,
        },
        luminousHeights: input.luminousArea.heights.map((height) => height / 1000) as [number, number, number, number],
      },
      source: input,
    };
  }
  validateCompatibleProfile(input);
  const scale = input.units === 'feet' ? 0.3048 : 1;
  return {
    sourceFormat: 'ies',
    selectedLampSetIndex: null,
    profile: input,
    lampSets: [
      {
        lampCount: input.lumensPerLamp === -1 ? -input.lampCount : input.lampCount,
        description: input.metadata.LAMP ?? input.metadata.LAMPCAT ?? '',
        totalLumens:
          input.lumensPerLamp === -1
            ? input.photometricType === 1
              ? calculateLuminousFlux(input)
              : null
            : input.lampCount * input.lumensPerLamp,
        colorTemperature: input.metadata.COLORTEMP ?? '',
        colorRendering: input.metadata.CRI ?? '',
        watts: input.inputWatts,
      },
    ],
    geometry: { luminaire: null, luminousOpening: scaledDimensions(input.dimensions, scale), luminousHeights: null },
    source: input,
  };
}

/** Detect IES by its version/TILT declaration; otherwise choose line-oriented EULUMDAT. */
export function detectPhotometricFormat(text: string, format?: 'ies' | 'ldt'): 'ies' | 'ldt' {
  return (
    format ??
    (/^\s*IES(?:NA)?(?:91|:)/i.test(text.replace(/^\uFEFF/, '')) || /^\s*TILT\s*=/im.test(text) ? 'ies' : 'ldt')
  );
}
export function parsePhotometry(
  text: string,
  format?: 'ies' | 'ldt',
  options: PhotometryOptions = {},
): PhotometricDocument {
  return toPhotometricDocument(
    detectPhotometricFormat(text, format) === 'ies' ? parseIES(text) : parseLDT(text),
    options,
  );
}

function ldtMetadataLosses(data: LDTProfile): ConversionWarning[] {
  const warnings = [
    warning(
      'LDT_GEOMETRY_REDUCED',
      'geometry',
      'IES has one luminous-opening shape, not separate luminaire dimensions and four per-plane luminous heights. The native LDT geometry remains in the source document.',
    ),
  ];
  if (data.lampSets.length > 1)
    warnings.push(
      warning(
        'LAMP_SET_SELECTED',
        'metadata',
        'Only the explicitly selected LDT lamp configuration is exported; alternative lamp sets remain in the native source document.',
      ),
    );
  if (data.lampSets.some((lamp) => lamp.colorTemperature || lamp.colorRendering))
    warnings.push(
      warning(
        'LAMP_COLOR_METADATA_REDUCED',
        'metadata',
        'LDT lamp-set color temperature/rendering values have no equivalent per-set IES fields.',
      ),
    );
  if (
    data.directRatios.some((value) => value !== 0) ||
    data.downwardFluxFraction !== 0 ||
    data.lightOutputRatio !== 100
  )
    warnings.push(
      warning(
        'LDT_DERIVED_FIELDS_OMITTED',
        'metadata',
        'LDT direct ratios, downward flux fraction and light-output ratio are not native IES fields.',
      ),
    );
  if (data.measurementTilt !== 0)
    warnings.push(
      warning(
        'MEASUREMENT_TILT_OMITTED',
        'metadata',
        'The LDT measurement tilt is retained in the source document but is not an IES lamp TILT correction curve. Distribution angles are preserved without re-aiming.',
      ),
    );
  if (data.fileName || data.dateUser)
    warnings.push(
      warning(
        'LDT_IDENTIFICATION_REDUCED',
        'metadata',
        'LDT file-name/date-user fields have no unambiguous standard IES keyword equivalents.',
      ),
    );
  return warnings;
}

/** Obtain an IES-compatible profile. Unsupported coordinate transformations throw rather than relabeling data. */
export function toIESProfile(input: PhotometricInput, options: PhotometryOptions = {}): ConversionResult<IESProfile> {
  const document = toPhotometricDocument(input, options);
  sourceType(document.profile);
  validateCompatibleProfile(document.profile);
  return {
    value: document.profile,
    warnings: document.sourceFormat === 'ldt' ? ldtMetadataLosses(document.source as LDTProfile) : [],
  };
}

function packed(values: number[]): string {
  const lines: string[] = [];
  let line = '';
  for (const value of values) {
    const token = String(value);
    if (line && line.length + token.length + 1 > 120) {
      lines.push(line);
      line = token;
    } else line += `${line ? ' ' : ''}${token}`;
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

/** Serialize to LM-63-2002, with all candela/ballast multipliers folded into values exactly once. */
export function serializeIES(input: PhotometricInput, options: PhotometryOptions = {}): ConversionResult<string> {
  const document = toPhotometricDocument(input, options);
  const { value: profile, warnings } = toIESProfile(document);
  // Revalidate user-supplied profiles through the ordinary parser after writing.
  const metadata = Object.entries(profile.metadata).flatMap(([key, value]) => {
    if (!/^[\w -]+$/.test(key)) throw new Error(`Invalid IES metadata keyword: ${key}`);
    const parts = value.replace(/\r\n?/g, '\n').split('\n');
    return [`[${key}] ${parts[0]}`, ...parts.slice(1).map((part) => `[MORE] ${part}`)];
  });
  const numericLines: string[] = [];

  if (profile.tilt)
    numericLines.push(
      String(profile.tilt.geometry),
      String(profile.tilt.angles.length),
      packed(profile.tilt.angles),
      packed(profile.tilt.factors),
    );
  numericLines.push(
    `${profile.lampCount} ${profile.lumensPerLamp} 1 ${profile.verticalAngles.length} ${profile.horizontalAngles.length} ${profile.photometricType} ${profile.units === 'feet' ? 1 : 2} ${profile.dimensions.width} ${profile.dimensions.length} ${profile.dimensions.height}`,
    `1 1 ${profile.inputWatts}`,
    packed(profile.verticalAngles),
    packed(profile.horizontalAngles),
    ...profile.candelaValues.map(packed),
  );
  const value = [
    'IESNA:LM-63-2002',
    ...metadata,
    `TILT=${profile.tilt ? 'INCLUDE' : 'NONE'}`,
    ...numericLines,
    '',
  ].join('\n');
  parseIES(value);
  if (profile.fileGenerationType !== undefined)
    warnings.push(
      warning(
        'IES_GENERATION_TYPE_OMITTED',
        'metadata',
        'The LM-63-2019 numeric file-generation provenance field is not represented in LM-63-2002; its value remains in the source document.',
      ),
    );
  if (document.sourceFormat === 'ies' && profile.version !== 'LM-63-2002')
    warnings.push(
      warning(
        'IES_VERSION_CHANGED',
        'metadata',
        `Written as LM-63-2002 rather than ${profile.version}; the original version remains in the source document.`,
      ),
    );
  return { value, warnings };
}

function flat(text: string): string {
  return text.replace(/[\r\n]+/g, ' ');
}

function spacing(angles: number[]): number {
  const step = angles.length > 1 ? angles[1]! - angles[0]! : 0;
  return angles.every((angle, i) => Math.abs(angle - i * step) < 1e-7) ? step : 0;
}

/** Serialize native LDT unchanged, or convert IES absolute candela into LDT cd/klm with explicit loss warnings. */
export function serializeLDT(input: PhotometricInput, options: SerializeLDTOptions = {}): ConversionResult<string> {
  if (!isDocument(input) && isLDT(input) && options.luminousFlux === undefined && options.tiltDegrees === undefined)
    return { value: writeLDT(input), warnings: [] };
  const document = toPhotometricDocument(input, options);
  sourceType(document.profile);
  validateCompatibleProfile(document.profile);
  if (document.sourceFormat === 'ldt' && options.luminousFlux === undefined && options.tiltDegrees === undefined) {
    const original = toPhotometricDocument(document.source, {
      lampSetIndex: document.selectedLampSetIndex ?? undefined,
    });
    const snapshot = (value: PhotometricDocument) => JSON.stringify([value.profile, value.lampSets, value.geometry]);
    if (snapshot(document) === snapshot(original))
      return { value: writeLDT(document.source as LDTProfile), warnings: [] };
  }
  const profile = document.profile;
  const warnings: ConversionWarning[] = [];
  if (document.sourceFormat === 'ldt') {
    warnings.push(
      warning(
        'LDT_NATIVE_FIELDS_REBUILT',
        'metadata',
        'The edited or explicitly renormalized document is rebuilt from its compatible profile and geometry. Native derived fields are defaulted; edit LDTProfile fields and call writeLDT for native metadata editing.',
      ),
    );
    if ((document.source as LDTProfile).lampSets.length > 1)
      warnings.push(
        warning(
          'LDT_ALTERNATIVES_OMITTED',
          'metadata',
          'Only the selected lamp configuration is retained when rebuilding from an edited profile; other native configurations remain in source.',
        ),
      );
  }
  const tilt = options.tiltDegrees ?? 0;
  if (!Number.isFinite(tilt)) throw new Error('Tilt must be finite');
  if (options.luminousFlux !== undefined && (!Number.isFinite(options.luminousFlux) || options.luminousFlux < 0))
    throw new Error('Normalization luminous flux must be finite and nonnegative');
  const absolute = profile.lumensPerLamp === -1;
  const flux =
    options.luminousFlux ??
    (absolute ? calculateLuminousFlux(profile, tilt) : profile.lampCount * profile.lumensPerLamp);
  if (options.luminousFlux !== undefined)
    warnings.push(
      warning(
        'NORMALIZATION_FLUX_OVERRIDDEN',
        'photometry',
        'The explicitly supplied luminous flux is used for LDT intensity normalization.',
      ),
    );
  const sourceAngles = profile.horizontalAngles;
  const offset = sourceAngles[0]!;
  const span = sourceAngles.at(-1)! - offset;
  let cAngles: number[];
  if (sourceAngles.length === 1) cAngles = [0];
  else if (span <= 180) {
    const expanded = new Set<number>([0]);
    for (let base = 0; base < 360; base += 2 * span)
      for (const angle of sourceAngles) {
        const relative = angle - offset;
        expanded.add((((offset + base + relative) % 360) + 360) % 360);
        expanded.add((((offset + base + 2 * span - relative) % 360) + 360) % 360);
      }
    cAngles = [...expanded].toSorted((a, b) => a - b);
  } else
    cAngles = [...new Set([0, ...sourceAngles.map((angle) => ((angle % 360) + 360) % 360)])].toSorted((a, b) => a - b);
  const gammaAngles =
    profile.verticalAngles[0] === 0
      ? profile.verticalAngles.slice()
      : [
          0,
          ...(profile.verticalAngles[0]! > 1e-6 ? [profile.verticalAngles[0]! - 1e-6] : []),
          ...profile.verticalAngles,
        ];
  if (gammaAngles[0] !== profile.verticalAngles[0])
    warnings.push(
      warning(
        'MISSING_HEMISPHERE_ZERO_FILLED',
        'photometry',
        'A missing downward hemisphere is zero-filled. A 0.000001° transition below its first measured angle approximates the discontinuous boundary required by the LDT grid.',
      ),
    );
  const candela = cAngles.map((angle) => gammaAngles.map((gamma) => sampleIntensity(profile, gamma, angle, tilt)));
  if (flux === 0 && candela.some((row) => row.some((value) => value !== 0)))
    throw new Error(
      'Cannot normalize nonzero candela to LDT with zero luminous flux; supply a positive luminousFlux option',
    );
  if (profile.tilt)
    warnings.push(
      warning(
        'TILT_CURVE_BAKED',
        'photometry',
        `IES lamp TILT correction is baked at ${tilt}°. LDT cannot retain the full correction curve.`,
      ),
    );
  if (
    Object.keys(profile.metadata).some(
      (key) => !['MANUFAC', 'TEST', 'LUMINAIRE', 'LUMCAT', 'LAMP', 'LAMPCAT', 'COLORTEMP', 'CRI'].includes(key),
    )
  )
    warnings.push(
      warning(
        'IES_KEYWORDS_OMITTED',
        'metadata',
        'IES keywords without native EULUMDAT equivalents are retained in the source document only.',
      ),
    );
  warnings.push(
    warning(
      'LDT_FIELDS_DEFAULTED',
      'metadata',
      'LDT type indicator, direct ratios and measurement tilt are defaulted; luminous-output statistics are derived from the distribution where possible.',
    ),
  );
  if (profile.metadata.LAMP && profile.metadata.LAMPCAT && profile.metadata.LAMP !== profile.metadata.LAMPCAT)
    warnings.push(
      warning(
        'LAMP_CATALOG_OMITTED',
        'metadata',
        'The separate IES lamp catalog is retained in the source document; LDT has one lamp description per set.',
      ),
    );
  warnings.push(
    warning(
      'IES_VERSION_OMITTED',
      'metadata',
      'The IES version and original keyword layout are retained in the source document, not encoded as EULUMDAT fields.',
    ),
  );
  const dimensions = document.geometry.luminousOpening;
  const circular = dimensions.width < 0 && dimensions.length === 0 && dimensions.height >= 0;
  const shape = !circular && Object.values(dimensions).some((value) => value < 0);
  if (shape)
    warnings.push(
      warning(
        'IES_SHAPE_APPROXIMATED',
        'geometry',
        'Signed IES shape dimensions are approximated by their absolute extents; EULUMDAT uses different luminous-area shape encodings.',
      ),
    );
  if (!document.geometry.luminaire)
    warnings.push(
      warning(
        'LUMINAIRE_GEOMETRY_UNKNOWN',
        'geometry',
        'IES specifies luminous-opening geometry, not the luminaire body; body dimensions are written as zero.',
      ),
    );
  const body = document.geometry.luminaire ?? { width: 0, length: 0, height: 0 };
  const totalOutput = calculateLuminousFlux(profile, tilt);
  const downAngles = profile.verticalAngles.filter((angle) => angle <= 90);
  if (profile.verticalAngles[0]! < 90 && profile.verticalAngles.at(-1)! > 90 && !downAngles.includes(90))
    downAngles.push(90);
  const downProfile: IESProfile = {
    ...profile,
    verticalAngles: downAngles,
    candelaValues: profile.horizontalAngles.map((angle) =>
      downAngles.map((gamma) => sampleIntensity(profile, gamma, angle, tilt)),
    ),
    tilt: null,
  };
  const downOutput = downAngles.length > 1 ? calculateLuminousFlux(downProfile) : 0;
  const native: LDTProfile = {
    format: 'ldt',
    identification: profile.metadata.MANUFAC ?? '',
    typeIndicator: cAngles.length === 1 ? 1 : 3,
    symmetry: cAngles.length === 1 ? 1 : 0,
    cPlaneSpacing: spacing(cAngles),
    gammaSpacing: spacing(gammaAngles),
    reportNumber: profile.metadata.TEST ?? '',
    luminaireName: profile.metadata.LUMINAIRE ?? '',
    luminaireNumber: profile.metadata.LUMCAT ?? '',
    fileName: '',
    dateUser: '',
    luminaire: scaledDimensions(body, 1000),
    luminousArea: {
      width: circular ? 0 : Math.abs(dimensions.width) * 1000,
      length: Math.abs(circular ? dimensions.width : dimensions.length) * 1000,
      heights: [
        Math.abs(dimensions.height) * 1000,
        Math.abs(dimensions.height) * 1000,
        Math.abs(dimensions.height) * 1000,
        Math.abs(dimensions.height) * 1000,
      ],
    },
    downwardFluxFraction: totalOutput > 0 ? Math.min(100, Math.max(0, (downOutput / totalOutput) * 100)) : 0,
    lightOutputRatio: absolute ? 100 : flux > 0 ? Math.min(100, (totalOutput / flux) * 100) : 0,
    conversionFactor: 1,
    measurementTilt: 0,
    lampSets: [
      {
        lampCount: absolute ? -profile.lampCount : profile.lampCount,
        description: profile.metadata.LAMP || profile.metadata.LAMPCAT || '',
        totalLumens: flux,
        colorTemperature: profile.metadata.COLORTEMP ?? '',
        colorRendering: profile.metadata.CRI ?? '',
        watts: profile.inputWatts,
      },
    ],
    directRatios: Array.from({ length: 10 }, () => 0),
    cAngles,
    gammaAngles,
    intensities: candela.map((row) => row.map((value) => (flux > 0 ? (value * 1000) / flux : 0))),
  };
  // Preserve multi-line native values in the document, but flatten fields in this line-oriented format.

  if (
    [
      native.identification,
      native.reportNumber,
      native.luminaireName,
      native.luminaireNumber,
      native.lampSets[0]!.description,
    ].some((text) => /[\r\n]/.test(text))
  )
    warnings.push(
      warning(
        'MULTILINE_METADATA_FLATTENED',
        'metadata',
        'Multi-line IES metadata is flattened to single-line EULUMDAT text.',
      ),
    );
  native.identification = flat(native.identification);
  native.reportNumber = flat(native.reportNumber);
  native.luminaireName = flat(native.luminaireName);
  native.luminaireNumber = flat(native.luminaireNumber);
  native.lampSets[0]!.description = flat(native.lampSets[0]!.description);
  return { value: writeLDT(native), warnings };
}
