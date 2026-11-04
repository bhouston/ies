import { computePhotometricMetrics } from './metrics.js';
import type { IESDiagnosticCode } from './diagnostics.js';
import { lineRange, profileRanges, TokenReader, type SourceField, type SourceRange } from './source.js';
import { IES_FORMAT_LINE, IES_HEADER, iesKeywordDescription, iesSecondFieldDescription } from './fieldDescriptions.js';

/** Embedded LM-63 lamp tilt correction. Angles are degrees; factors are dimensionless. */
export interface IESTilt {
  geometry: number;
  angles: number[];
  factors: number[];
}

export interface IESProfile {
  version: string;
  metadata: Record<string, string>;
  lampCount: number;
  lumensPerLamp: number;
  candelaMultiplier: number;
  photometricType: number;
  units: 'feet' | 'meters';
  dimensions: { width: number; length: number; height: number };
  ballastFactor: number;
  /** Raw second field: multiplier in 1986/1991, reserved in 1995/2002, generation code in 2019. */
  ballastLampPhotometricFactor: number;
  /** LM-63-2019 provenance code, not an intensity multiplier. Absent in earlier editions. */
  fileGenerationType?: number;
  inputWatts: number;
  verticalAngles: number[];
  horizontalAngles: number[];
  /** Horizontal-major values in candela, with candela and ballast multipliers applied. */
  candelaValues: number[][];
  tilt: IESTilt | null;
}

export class IESParseError extends Error {
  constructor(
    message: string,
    public readonly code: IESDiagnosticCode = 'IES_PARSE_ERROR',
    public readonly field?: string,
    /** Where the error was detected in the source text. */
    public readonly range?: SourceRange,
  ) {
    super(message);
    this.name = 'IESParseError';
  }
}

function fail(
  message: string,
  code: IESDiagnosticCode = 'IES_PARSE_ERROR',
  field?: string,
  range?: SourceRange,
): never {
  throw new IESParseError(message, code, field, range);
}

/**
 * Parse LM-63-1986, IESNA91, LM-63-1995, LM-63-2002 and LM-63-2019. External TILT files are rejected.
 * Errors carry the source range of the offending token or line.
 * @param fields Optional sink that receives a described {@link SourceField} for every header line and
 * token as it is read, including those read before an error. Prefer `describePhotometrySource`.
 */
export function parseIES(text: string, fields?: SourceField[]): IESProfile {
  const lines = text.replace(/^﻿/, '').split(/\r\n?|\n/);
  const formatLine = lineRange(lines, 0);
  const tiltLine = lines.findIndex((line) => /^\s*TILT\s*=/i.test(line));
  const first = lines[0]!.trim();
  let version = 'LM-63-1986';
  if (/^IESNA91$/i.test(first)) version = 'LM-63-1991';
  else if (/^IESNA:LM-63-(1995|2002)$/i.test(first)) version = first.toUpperCase().slice(6);
  else if (/^IES:LM-63-2019$/i.test(first)) version = 'LM-63-2019';
  else if (/^IES/i.test(first))
    fail(`Unsupported IES header: ${first}`, 'IES_UNSUPPORTED_HEADER', 'version', formatLine);
  if (fields && version !== 'LM-63-1986')
    fields.push({ ...formatLine, name: 'Format line', description: IES_FORMAT_LINE[version]! });
  const metadata: Record<string, string> = Object.create(null);
  let lastKey = '';
  const metadataEnd = tiltLine < 0 ? lines.length : tiltLine;
  for (let index = version === 'LM-63-1986' ? 0 : 1; index < metadataEnd; index++) {
    const match = /^\s*\[([^\]]+)\]\s*(.*)$/.exec(lines[index]!);
    if (match) {
      const key = match[1]!.toUpperCase();
      if (fields)
        fields.push({ ...lineRange(lines, index), name: `[${key}]`, description: iesKeywordDescription(key) });
      if (key === 'MORE' && lastKey) metadata[lastKey] += `\n${match[2]}`;
      else {
        metadata[key] = metadata[key] ? `${metadata[key]}\n${match[2]}` : match[2]!;
        lastKey = key;
      }
    }
  }
  if (tiltLine < 0) fail('Missing TILT=NONE or TILT=INCLUDE declaration', 'IES_MISSING_TILT', 'TILT', formatLine);
  const tiltRange = lineRange(lines, tiltLine);
  if (fields) fields.push({ ...tiltRange, name: IES_HEADER.tilt[0], description: IES_HEADER.tilt[1] });
  const tiltMode = lines[tiltLine]!.replace(/^\s*TILT\s*=\s*/i, '')
    .trim()
    .toUpperCase();
  if (tiltMode !== 'NONE' && tiltMode !== 'INCLUDE') {
    fail(
      'External TILT files are unsupported; use TILT=NONE or embed the data with TILT=INCLUDE',
      'IES_EXTERNAL_TILT',
      'TILT',
      tiltRange,
    );
  }
  const reader = new TokenReader(lines, tiltLine + 1);
  const note = (name: string, description: string): void => {
    fields!.push({ ...reader.range(), name, description });
  };
  function number(label: string, describe?: readonly [string, string]): number {
    const token = reader.next();
    if (fields && describe && token !== undefined) note(describe[0], describe[1]);
    if (!token || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(token))
      fail(`Missing or invalid ${label}`, 'IES_INVALID_NUMBER', label, reader.range());
    const value = Number(token);
    if (!Number.isFinite(value)) fail(`Non-finite ${label}`, 'IES_INVALID_NUMBER', label, reader.range());
    return value;
  }
  function count(label: string, describe?: readonly [string, string], max = 100_000): number {
    const value = number(label, describe);
    if (!Number.isInteger(value) || value < 1 || value > max)
      fail(`${label} must be a positive integer <= ${max}`, 'IES_INVALID_COUNT', label, lineRange(lines, reader.line));
    return value;
  }
  function nonnegative(value: number, message: string, field: string): void {
    if (value < 0) fail(message, 'IES_INVALID_RANGE', field, reader.range());
  }
  let firstAngle: SourceRange | undefined;
  /** Reads strictly increasing angles, reporting the first one out of order or range. */
  function angles(
    length: number,
    label: string,
    numberLabel: string,
    [name, description]: readonly [string, string],
    min: number,
    max: number,
  ): number[] {
    const values: number[] = [];
    for (let i = 0; i < length; i++) {
      const value = number(numberLabel);
      if (i === 0) firstAngle = reader.range();
      if (fields) note(name, `${description} #${i + 1} (degrees)`);
      if (value < min || value > max || (i > 0 && value <= values[i - 1]!))
        fail(
          `${label} must be strictly increasing within ${min}..${max} degrees`,
          'IES_INVALID_ANGLES',
          label,
          reader.range(),
        );
      values.push(value);
    }
    return values;
  }
  let tilt: IESTilt | null = null;
  if (tiltMode === 'INCLUDE') {
    const geometry = count('tilt geometry', IES_HEADER.tiltGeometry, 3);
    const length = count('tilt angle count', IES_HEADER.tiltCount);
    const tiltAngles = angles(length, 'Tilt angles', 'tilt angle', IES_HEADER.tiltAngle, 0, 180);
    const factors = Array.from({ length }, (_, i) => {
      const factor = number('tilt factor');
      if (fields) note(IES_HEADER.tiltFactor[0], `${IES_HEADER.tiltFactor[1]} #${i + 1}`);
      nonnegative(factor, 'Tilt factors must be nonnegative', 'tilt factor');
      return factor;
    });
    tilt = { geometry, angles: tiltAngles, factors };
  }
  const lampCount = count('lamp count', IES_HEADER.lampCount);
  const lumensPerLamp = number('lumens per lamp', IES_HEADER.lumensPerLamp);
  if (lumensPerLamp < 0 && lumensPerLamp !== -1)
    fail(
      'Lumens per lamp must be nonnegative or -1 for absolute photometry',
      'IES_INVALID_RANGE',
      'lumens per lamp',
      reader.range(),
    );
  const multipliers = 'Multipliers and input watts must be nonnegative';
  const multiplierField = 'multipliers / input watts';
  const candelaMultiplier = number('candela multiplier', IES_HEADER.candelaMultiplier);
  nonnegative(candelaMultiplier, multipliers, multiplierField);
  const verticalCount = count('vertical angle count', IES_HEADER.verticalCount);
  const horizontalCount = count('horizontal angle count', IES_HEADER.horizontalCount);
  if (verticalCount * horizontalCount > 10_000_000)
    fail(
      'Photometric table exceeds 10 million samples',
      'IES_TABLE_LIMIT',
      'angle counts',
      lineRange(lines, reader.line),
    );
  const photometricType = count('photometric type', IES_HEADER.photometricType, 3);
  const ranges: Record<string, SourceRange> = { version: formatLine, photometricType: reader.range() };
  const unit = count('units', IES_HEADER.units, 2);
  const dimensions = {
    width: number('width', IES_HEADER.width),
    length: number('length', IES_HEADER.length),
    height: number('height', IES_HEADER.height),
  };
  const ballastFactor = number('ballast factor', IES_HEADER.ballastFactor);
  nonnegative(ballastFactor, multipliers, multiplierField);
  const ballastLampPhotometricFactor = number(
    'ballast lamp factor / reserved field / file generation type',
    iesSecondFieldDescription(version),
  );
  nonnegative(ballastLampPhotometricFactor, multipliers, multiplierField);
  ranges.ballastLampPhotometricFactor = ranges.fileGenerationType = reader.range();
  const inputWatts = number('input watts', IES_HEADER.inputWatts);
  nonnegative(inputWatts, multipliers, multiplierField);
  const typeC = photometricType === 1;
  const verticalAngles = angles(
    verticalCount,
    'Vertical angles',
    'vertical angle',
    IES_HEADER.verticalAngle,
    typeC ? 0 : -90,
    typeC ? 180 : 90,
  );
  ranges.verticalAngles = firstAngle!;
  const horizontalAngles = angles(
    horizontalCount,
    'Horizontal angles',
    'horizontal angle',
    IES_HEADER.horizontalAngle,
    typeC ? 0 : -90,
    typeC ? 360 : 90,
  );
  if (typeC) {
    const span = horizontalAngles.at(-1)! - horizontalAngles[0]!;
    if (
      horizontalCount === 1 ? horizontalAngles[0] !== 0 : span !== 90 && span !== 180 && !(span > 180 && span <= 360)
    ) {
      fail(
        'Type C horizontal coverage must be axial (0), quadrant (90), bilateral (180), or full (>180)',
        'IES_INVALID_COVERAGE',
        'horizontal angles',
        reader.range(),
      );
    }
  }
  // The ballast-lamp factor was replaced by a reserved field in 1995; 2019 repurposes it as provenance.
  const legacyFactor = version === 'LM-63-1986' || version === 'LM-63-1991' ? ballastLampPhotometricFactor : 1;
  const scale = candelaMultiplier * ballastFactor * legacyFactor;
  const [candelaName, candelaDescription] = IES_HEADER.candela;
  const candelaValues = Array.from({ length: horizontalCount }, (_row, h) =>
    Array.from({ length: verticalCount }, (_column, v) => {
      const value = number('candela value');
      if (h === 0 && v === 0) ranges.candelaValues = reader.range();
      if (fields)
        note(
          candelaName,
          `${candelaDescription} at horizontal ${horizontalAngles[h]}°, vertical ${verticalAngles[v]}° (before multiplier)`,
        );
      if (value < 0)
        fail('Candela values must be nonnegative', 'IES_NEGATIVE_CANDELA', 'candela values', reader.range());
      const scaled = value * scale;
      if (!Number.isFinite(scaled))
        fail('Scaled candela values must be finite', 'IES_SCALED_OVERFLOW', 'candela values', reader.range());
      return scaled;
    }),
  );
  if (reader.next() !== undefined) {
    const trailing = reader.range();
    let extra = 1;
    while (reader.next() !== undefined) extra++;
    fail(`Unexpected trailing data (${extra} tokens)`, 'IES_TRAILING_DATA', undefined, trailing);
  }
  const profile: IESProfile = {
    version,
    metadata,
    lampCount,
    lumensPerLamp,
    candelaMultiplier,
    photometricType,
    units: unit === 1 ? 'feet' : 'meters',
    dimensions,
    ballastFactor,
    ballastLampPhotometricFactor,
    ...(version === 'LM-63-2019' ? { fileGenerationType: ballastLampPhotometricFactor } : {}),
    inputWatts,
    verticalAngles,
    horizontalAngles,
    candelaValues,
    tilt,
  };
  profileRanges.set(profile, ranges);
  return profile;
}

function bracket(angles: number[], angle: number): [number, number, number] {
  if (angles.length === 1 || angle <= angles[0]!) return [0, 0, 0];
  const last = angles.length - 1;
  if (angle >= angles[last]!) return [last, last, 0];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (angles[mid]! <= angle) lo = mid;
    else hi = mid;
  }
  return [lo, hi, (angle - angles[lo]!) / (angles[hi]! - angles[lo]!)];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Sample Type C luminous intensity in candela using bilinear interpolation and LM-63 symmetries.
 * Vertical 0° points down; horizontal angles wrap around the luminaire. Missing hemispheres are dark.
 * Tilt correction is applied at the supplied luminaire tilt angle (default 0°).
 */
export function sampleIntensity(
  profile: IESProfile,
  verticalDegrees: number,
  horizontalDegrees: number,
  tiltDegrees = 0,
): number {
  if (profile.photometricType !== 1) throw new Error('Intensity sampling supports Type C photometry only (type 1)');
  if (![verticalDegrees, horizontalDegrees, tiltDegrees].every(Number.isFinite))
    throw new RangeError('Sample angles must be finite');
  const va = profile.verticalAngles;
  if (verticalDegrees < va[0]! || verticalDegrees > va.at(-1)!) return 0;
  const ha = profile.horizontalAngles;
  const span = ha.at(-1)! - ha[0]!;
  let h = (((horizontalDegrees - ha[0]!) % 360) + 360) % 360;
  let h0: number, h1: number, ht: number;
  if (ha.length === 1) [h0, h1, ht] = [0, 0, 0];
  else if (span <= 180) {
    h %= 2 * span;
    if (h > span) h = 2 * span - h;
    [h0, h1, ht] = bracket(ha, h + ha[0]!);
  } else if (h > span) {
    // Some exporters omit the duplicate 360° plane; interpolate across that seam.
    [h0, h1, ht] = [ha.length - 1, 0, (h - span) / (360 - span)];
  } else [h0, h1, ht] = bracket(ha, h + ha[0]!);
  const [v0, v1, vt] = bracket(va, verticalDegrees);
  let value = lerp(
    lerp(profile.candelaValues[h0]![v0]!, profile.candelaValues[h0]![v1]!, vt),
    lerp(profile.candelaValues[h1]![v0]!, profile.candelaValues[h1]![v1]!, vt),
    ht,
  );
  if (profile.tilt) {
    const [a, b, t] = bracket(profile.tilt.angles, Math.abs(tiltDegrees));
    value *= lerp(profile.tilt.factors[a]!, profile.tilt.factors[b]!, t);
  }
  return value;
}

export function summarizeIES(profile: IESProfile) {
  let peakCandela = 0;
  for (const row of profile.candelaValues) for (const value of row) peakCandela = Math.max(peakCandela, value);
  return {
    format: 'IES LM-63',
    version: profile.version,
    metadata: profile.metadata,
    photometricType: profile.photometricType,
    photometricTypeName: profile.photometricType === 1 ? 'C' : profile.photometricType === 2 ? 'B' : 'A',
    photometry: profile.lumensPerLamp === -1 ? 'absolute' : 'relative',
    lightSource: profile.metadata.LAMP?.trim() || profile.metadata.LAMPCAT?.trim() || 'not specified',
    lampCatalog: profile.metadata.LAMPCAT?.trim() || 'not specified',
    luminaire: profile.metadata.LUMINAIRE?.trim() || 'not specified',
    manufacturer: profile.metadata.MANUFAC?.trim() || 'not specified',
    lampCount: profile.lampCount,
    lumensPerLamp: profile.lumensPerLamp,
    inputWatts: profile.inputWatts,
    peakCandela,
    verticalAngles: profile.verticalAngles.length,
    horizontalAngles: profile.horizontalAngles.length,
    units: profile.units,
    dimensions: profile.dimensions,
    hasTilt: profile.tilt !== null,
    fileGenerationType: profile.fileGenerationType ?? null,
    ...computePhotometricMetrics(profile),
  };
}

export { validateIES, diagnoseIES } from './diagnostics.js';
export type { IESDiagnostic, IESDiagnosticCode, IESValidationOptions, IESValidationResult } from './diagnostics.js';
export { calculateFluxBreakdown, calculateLuminousFlux, computePhotometricMetrics, getBeamAngles } from './metrics.js';
export type {
  PhotometricGrid,
  PhotometricMetrics,
  BeamAngles,
  BeamAngleStatus,
  FluxBreakdown,
  ZonalLumens,
} from './metrics.js';
export { LDTParseError, parseLDT, validateLDT, measuredCPlaneIndices, writeLDT } from './ldt.js';
export type { LDTProfile, LDTLampSet, LDTDimensions } from './ldt.js';
export {
  LampSetSelectionError,
  detectPhotometricFormat,
  parsePhotometry,
  toPhotometricDocument,
  toIESProfile,
  serializeIES,
  serializeLDT,
} from './photometry.js';
export type {
  PhotometricDocument,
  PhotometricLampSet,
  PhotometryOptions,
  PhotometricInput,
  ConversionResult,
  ConversionWarning,
  SerializeLDTOptions,
} from './photometry.js';

export {
  inputFormat,
  ldtDiagnostics,
  validatePhotometry,
  inspectPhotometry,
  inspectParsedPhotometry,
  describePhotometrySource,
} from './inspection.js';
export type {
  InputFormat,
  PhotometryDiagnostic,
  PhotometryInspection,
  PhotometrySourceDescription,
} from './inspection.js';
export type { SourceRange, SourceField } from './source.js';
export * from './fieldDescriptions.js';
export {
  LOG_DECADES,
  buildConeDiagram,
  buildIntensityCurves,
  buildIntensityTable,
  buildIntensityTopology,
  buildIsoluxGrid,
  buildLuminanceTable,
  extractContours,
  formatGraphValue,
  groundIlluminance,
  isoluxContourLevels,
  logRadius,
  logTicks,
  niceTicks,
  orientGraphPoint,
} from './charts.js';
export type {
  ConeDiagram,
  ConeOptions,
  ConePlane,
  ConeRow,
  Contour,
  ContourGrid,
  ContourLevelOptions,
  GraphAxis,
  IntensityCurve,
  IntensityCurveOptions,
  IntensityCurves,
  IntensityTable,
  IntensityTableOptions,
  IntensityTopology,
  IsoluxGrid,
  IsoluxOptions,
  LuminanceTable,
  LuminanceTableOptions,
  Point2,
  Point3,
  TopologyOptions,
  TopologyVertex,
  UpAxis,
} from './charts.js';
export {
  LUX_PER_FOOTCANDLE,
  METERS_PER_FOOT,
  formatIlluminance,
  formatLength,
  illuminanceInUnits,
  illuminanceLegend,
  illuminanceRampRgb,
  illuminanceUnit,
  lengthFromUnits,
  lengthInUnits,
  lengthUnit,
  peakReceiverIlluminance,
  peakReceiverLuminance,
  rulerTicks,
  saturationLuminance,
  autoExposureValue,
  AUTO_EXPOSURE_PEAK,
} from './measurement.js';
export type { IlluminanceLegend, MeasurementUnits, RulerTick } from './measurement.js';
export { luminousShape, projectedLuminousArea } from './shape.js';
export type { LuminousShape, LuminousShapeKind } from './shape.js';
