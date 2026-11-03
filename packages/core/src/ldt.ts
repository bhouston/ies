import { endRange, lineRange, profileRanges, TokenReader, type SourceField, type SourceRange } from './source.js';
import { LDT_LAMP_SET_LINES, LDT_LINES, LDT_ROOM_INDICES } from './fieldDescriptions.js';
/** EULUMDAT fields follow DIAL's published format description, independently implemented here. */
export interface LDTLampSet {
  /** Negative for absolute photometry; positive for relative photometry. */
  lampCount: number;
  description: string;
  totalLumens: number;
  colorTemperature: string;
  colorRendering: string;
  watts: number;
}
export interface LDTDimensions {
  width: number;
  length: number;
  height: number;
}
export interface LDTProfile {
  format: 'ldt';
  identification: string;
  typeIndicator: 1 | 2 | 3;
  symmetry: 0 | 1 | 2 | 3 | 4;
  cPlaneSpacing: number;
  gammaSpacing: number;
  reportNumber: string;
  luminaireName: string;
  luminaireNumber: string;
  fileName: string;
  dateUser: string;
  /** Native millimeters; the luminous area is distinct from the luminaire body. */
  luminaire: LDTDimensions;
  luminousArea: { width: number; length: number; heights: [number, number, number, number] };
  downwardFluxFraction: number;
  lightOutputRatio: number;
  conversionFactor: number;
  measurementTilt: number;
  lampSets: LDTLampSet[];
  directRatios: number[];
  /** Full C grid, including angles whose intensities are reconstructed using symmetry. */
  cAngles: number[];
  gammaAngles: number[];
  /** Native cd/klm, measured planes only, in the order specified by Isym. */
  intensities: number[][];
}

export class LDTParseError extends Error {
  readonly code = 'LDT_PARSE_ERROR';
  constructor(
    message: string,
    /** Where the error was detected in the source text, when parsing. */
    public readonly range?: SourceRange,
  ) {
    super(`Invalid EULUMDAT: ${message}`);
    this.name = 'LDTParseError';
  }
}
function error(message: string, range?: SourceRange): never {
  throw new LDTParseError(message, range);
}
/** Source range of a profile field, keyed like `luminaire.width` or `cAngles` plus an index. */
type Locate = (key: string, index?: number) => SourceRange | undefined;

/** Indices of the measured planes. Isym=3 wraps C270→C0→C90, as specified by DIAL. */
export function measuredCPlaneIndices(
  profile: Pick<LDTProfile, 'symmetry' | 'cAngles'>,
  /** Range attached to errors, such as the Isym line. */
  range?: SourceRange,
): number[] {
  const count = profile.cAngles.length;
  if (profile.symmetry === 1) return [0];
  if (profile.symmetry === 0) return Array.from({ length: count }, (_, i) => i);
  if (profile.symmetry === 2) {
    if (count % 2 !== 0 || profile.cAngles[count / 2] !== 180)
      error('C0–C180 symmetry requires an even C grid with its middle plane at 180°', range);
    return Array.from({ length: count / 2 + 1 }, (_, i) => i);
  }
  if (count % 4 !== 0 || profile.cAngles[count / 4] !== 90 || profile.cAngles[(count * 3) / 4] !== 270)
    error('C90–C270 and quadrant symmetries require a C grid divisible by four with 90° and 270° boundaries', range);
  if (profile.symmetry === 4) return Array.from({ length: count / 4 + 1 }, (_, i) => i);
  return Array.from({ length: count / 2 + 1 }, (_, i) => ((count * 3) / 4 + i) % count);
}

/** Throws {@link LDTParseError}. `locate` is supplied by the parser so errors point into the source. */
export function validateLDT(
  profile: LDTProfile,
  /** Maps a field key and index to its source range; supplied by the parser. */
  locate?: (key: string, index?: number) => SourceRange | undefined,
): void {
  const fail = (message: string, key: string, index?: number): never => error(message, locate?.(key, index));
  const finite = (value: number, name: string, key: string, index?: number): void => {
    if (!Number.isFinite(value)) fail(`${name} must be finite`, key, index);
  };
  const nonnegative = (value: number, name: string, key: string, index?: number): void => {
    finite(value, name, key, index);
    if (value < 0) fail(`${name} must be nonnegative`, key, index);
  };
  const increasing = (values: number[], name: string, maximum: number, key: string): void => {
    if (values.length < 1) fail(`${name} cannot be empty`, key, 0);
    for (let i = 0; i < values.length; i++) {
      finite(values[i]!, name, key, i);
      if (values[i]! < 0 || values[i]! > maximum || (i > 0 && values[i]! <= values[i - 1]!))
        fail(`${name} must be strictly increasing within 0..${maximum}`, key, i);
    }
  };
  if (![1, 2, 3].includes(profile.typeIndicator)) fail('type indicator must be 1, 2 or 3', 'typeIndicator');
  if (![0, 1, 2, 3, 4].includes(profile.symmetry)) fail('symmetry must be 0..4', 'symmetry');
  increasing(profile.cAngles, 'C angles', 360, 'cAngles');
  increasing(profile.gammaAngles, 'Gamma angles', 180, 'gammaAngles');
  if (profile.cAngles[0] !== 0 || profile.cAngles.at(-1)! >= 360)
    fail('C angles must start at 0° and exclude the duplicate 360° plane', 'cAngles', 0);
  // Preserve real-world upper-only datasets; a nonzero gamma start is structurally usable,
  // although DIAL's interchange description recommends starting at zero.
  nonnegative(profile.cPlaneSpacing, 'C spacing', 'cPlaneSpacing');
  nonnegative(profile.gammaSpacing, 'Gamma spacing', 'gammaSpacing');
  for (const [angles, spacing, name, key] of [
    [profile.cAngles, profile.cPlaneSpacing, 'C', 'cPlaneSpacing'],
    [profile.gammaAngles, profile.gammaSpacing, 'Gamma', 'gammaSpacing'],
  ] as const) {
    if (spacing > 0 && angles.some((angle, index) => Math.abs(angle - angles[0]! - index * spacing) > 1e-6))
      fail(`${name} spacing does not match the listed angles; use zero for irregular grids`, key);
  }
  for (const [name, dimension] of Object.entries(profile.luminaire))
    nonnegative(dimension, `luminaire ${name}`, `luminaire.${name}`);
  nonnegative(profile.luminousArea.width, 'luminous width', 'luminousArea.width');
  nonnegative(profile.luminousArea.length, 'luminous length', 'luminousArea.length');
  for (const [index, height] of profile.luminousArea.heights.entries())
    nonnegative(height, 'luminous height', `luminousArea.heights.${index}`);
  if (profile.luminousArea.heights.length !== 4)
    fail('four luminous-area heights are required', 'luminousArea.heights', 0);
  for (const [name, value, key] of [
    ['downward flux fraction', profile.downwardFluxFraction, 'downwardFluxFraction'],
    ['light output ratio', profile.lightOutputRatio, 'lightOutputRatio'],
  ] as const) {
    nonnegative(value, name, key);
    if (value > 100) fail(`${name} must not exceed 100%`, key);
  }
  nonnegative(profile.conversionFactor, 'conversion factor', 'conversionFactor');
  finite(profile.measurementTilt, 'measurement tilt', 'measurementTilt');
  if (profile.lampSets.length < 1 || profile.lampSets.length > 20)
    fail('one to twenty lamp sets are required', 'lampSetCount');
  const absolute = profile.lampSets.some((lamp) => lamp.lampCount < 0);
  if (absolute && (profile.lampSets.length !== 1 || profile.lampSets[0]!.lampCount >= 0))
    fail('absolute photometry must have exactly one negative-count lamp set', 'lampSetCount');
  for (const [index, lamp] of profile.lampSets.entries()) {
    if (!Number.isSafeInteger(lamp.lampCount) || lamp.lampCount === 0)
      fail('lamp counts must be nonzero integers', `lampSets.${index}.lampCount`);
    nonnegative(lamp.totalLumens, 'lamp-set lumens', `lampSets.${index}.totalLumens`);
    nonnegative(lamp.watts, 'lamp-set watts', `lampSets.${index}.watts`);
  }
  if (profile.directRatios.length !== 10) fail('ten direct ratios are required', 'directRatios', 0);
  for (const [index, ratio] of profile.directRatios.entries()) {
    nonnegative(ratio, 'direct ratio', 'directRatios', index);
    if (ratio > 1) fail('direct ratios must not exceed one', 'directRatios', index);
  }
  const indices = measuredCPlaneIndices(profile, locate?.('symmetry'));
  if (
    profile.intensities.length !== indices.length ||
    profile.intensities.some((row) => row.length !== profile.gammaAngles.length)
  )
    fail('intensity table dimensions do not match the symmetry and angle counts', 'intensities', 0);
  const gammaCount = profile.gammaAngles.length;
  for (const [row, values] of profile.intensities.entries())
    for (const [column, value] of values.entries())
      nonnegative(value, 'intensity', 'intensities', row * gammaCount + column);
}

const LINE_INFO = new Map(LDT_LINES.map(([key, name, description]) => [key, [name, description] as const]));

/**
 * Parse the line-oriented EULUMDAT format. The numeric angle/intensity tail may also use packed rows.
 * Errors carry the source range of the offending line or token.
 * @param fields Optional sink that receives a described {@link SourceField} for every line field and
 * tail token as it is read, including those read before an error. Prefer `describePhotometrySource`.
 */
export function parseLDT(text: string, fields?: SourceField[]): LDTProfile {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const ranges: Record<string, SourceRange> = {};
  let cursor = 0;
  let last = endRange(lines);
  const next = (name: string, key: string, info = LINE_INFO.get(key)!): string => {
    const line = lines[cursor];
    if (line === undefined) error(`missing ${name}`, endRange(lines));
    last = ranges[key] = lineRange(lines, cursor++);
    fields?.push({ ...last, name: info[0], description: info[1] });
    return line.trim();
  };
  const numeric = (token: string, name: string, range: SourceRange): number => {
    // Decimal commas occur in European exports; comma-separated numeric lists are not LDT.
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(token.replace(',', '.')))
      error(`invalid ${name}: ${token}`, range);
    const value = Number(token.replace(',', '.'));
    if (!Number.isFinite(value)) error(`${name} must be finite`, range);
    return value;
  };
  const number = (name: string, key: string, info?: readonly [string, string]) =>
    numeric(next(name, key, info), name, last);
  const integer = (name: string, key: string, maximum: number): number => {
    const value = number(name, key);
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
      error(`${name} must be an integer within 1..${maximum}`, last);
    return value;
  };
  const identification = next('identification', 'identification');
  const typeIndicator = integer('type indicator', 'typeIndicator', 3) as LDTProfile['typeIndicator'];
  const symmetry = number('symmetry', 'symmetry') as LDTProfile['symmetry'];
  const cCount = integer('C-plane count', 'cCount', 100_000);
  const cPlaneSpacing = number('C-plane spacing', 'cPlaneSpacing');
  const gammaCount = integer('gamma-angle count', 'gammaCount', 100_000);
  if (cCount * gammaCount > 10_000_000) error('table exceeds ten million angular samples', last);
  const gammaSpacing = number('gamma spacing', 'gammaSpacing');
  const reportNumber = next('report number', 'reportNumber'),
    luminaireName = next('luminaire name', 'luminaireName'),
    luminaireNumber = next('luminaire number', 'luminaireNumber'),
    fileName = next('file name', 'fileName'),
    dateUser = next('date/user', 'dateUser');
  const luminaire = {
    length: number('luminaire length', 'luminaire.length'),
    width: number('luminaire width', 'luminaire.width'),
    height: number('luminaire height', 'luminaire.height'),
  };
  const luminousArea = {
    length: number('luminous length', 'luminousArea.length'),
    width: number('luminous width', 'luminousArea.width'),
    heights: [
      number('C0 luminous height', 'luminousArea.heights.0'),
      number('C90 luminous height', 'luminousArea.heights.1'),
      number('C180 luminous height', 'luminousArea.heights.2'),
      number('C270 luminous height', 'luminousArea.heights.3'),
    ] as [number, number, number, number],
  };
  const downwardFluxFraction = number('downward flux fraction', 'downwardFluxFraction'),
    lightOutputRatio = number('light output ratio', 'lightOutputRatio'),
    conversionFactor = number('conversion factor', 'conversionFactor'),
    measurementTilt = number('measurement tilt', 'measurementTilt');
  const lampCount = integer('lamp-set count', 'lampSetCount', 20);
  const lampSets = Array.from({ length: lampCount }, (_, set) => {
    const line = (index: number): [string, readonly [string, string]] => {
      const [key, name, description] = LDT_LAMP_SET_LINES[index]!;
      return [`lampSets.${set}.${key}`, [`Lamp set ${set + 1} ${name}`, description]];
    };
    return {
      lampCount: number('lamp count', ...line(0)),
      description: next('lamp description', ...line(1)),
      totalLumens: number('lamp-set lumens', ...line(2)),
      colorTemperature: next('lamp color temperature', ...line(3)),
      colorRendering: next('lamp color rendering', ...line(4)),
      watts: number('lamp-set watts', ...line(5)),
    };
  });
  const directRatios = LDT_ROOM_INDICES.map((k, index) =>
    number('direct ratio', `directRatios.${index}`, ['Direct ratios', `Direct ratio for room index k = ${k}`]),
  );
  const tailLine = cursor;
  const reader = new TokenReader(lines, tailLine, /\S+/g);
  const values: number[] = [];
  let planes: number[] | undefined;
  const describe = (index: number): Pick<SourceField, 'name' | 'description'> => {
    if (index < cCount) return { name: 'C angles', description: `C-plane angle #${index + 1} (degrees)` };
    if (index < cCount + gammaCount)
      return { name: 'γ angles', description: `γ angle #${index - cCount + 1} (degrees)` };
    const sample = index - cCount - gammaCount;
    try {
      planes ??= measuredCPlaneIndices({ symmetry, cAngles: values.slice(0, cCount) });
    } catch {
      planes = [];
    }
    const c = values[planes[Math.floor(sample / gammaCount)]!];
    const gamma = values[cCount + (sample % gammaCount)];
    return {
      name: 'Luminous intensities',
      description:
        c === undefined || gamma === undefined
          ? `Luminous intensity #${sample + 1} (cd/klm)`
          : `Luminous intensity at C ${c}°, γ ${gamma}° (cd/klm)`,
    };
  };
  for (let token = reader.next(); token !== undefined; token = reader.next()) {
    if (fields) fields.push({ ...reader.range(), ...describe(values.length) });
    values.push(numeric(token, 'angle or intensity', reader.range()));
  }
  const tailRange = (index: number): SourceRange => {
    const scan = new TokenReader(lines, tailLine, /\S+/g);
    for (let i = 0; i <= index; i++) scan.next();
    return scan.range();
  };
  const locate: Locate = (key, index) => {
    if (index === undefined) return ranges[key];
    const offset = { cAngles: 0, gammaAngles: cCount, intensities: cCount + gammaCount }[key];
    return ranges[`${key}.${index}`] ?? (offset === undefined ? undefined : tailRange(offset + index));
  };
  let offset = 0;
  const cAngles = values.slice(offset, (offset += cCount));
  const gammaAngles = values.slice(offset, (offset += gammaCount));
  if (cAngles.length !== cCount || gammaAngles.length !== gammaCount)
    error('insufficient angle values', endRange(lines));
  const profile: LDTProfile = {
    format: 'ldt',
    identification,
    typeIndicator,
    symmetry,
    cPlaneSpacing,
    gammaSpacing,
    reportNumber,
    luminaireName,
    luminaireNumber,
    fileName,
    dateUser,
    luminaire,
    luminousArea,
    downwardFluxFraction,
    lightOutputRatio,
    conversionFactor,
    measurementTilt,
    lampSets,
    directRatios,
    cAngles,
    gammaAngles,
    intensities: [],
  };
  const rowCount = measuredCPlaneIndices(profile, ranges.symmetry).length;
  const expected = rowCount * gammaCount;
  if (values.length - offset !== expected)
    error(
      `expected ${expected} intensity values, found ${values.length - offset}`,
      values.length - offset < expected ? endRange(lines) : tailRange(offset + expected),
    );
  profile.intensities = Array.from({ length: rowCount }, () => values.slice(offset, (offset += gammaCount)));
  validateLDT(profile, locate);
  profileRanges.set(profile, ranges);
  return profile;
}

/** Write native fields without normalization. The conversion layer handles absolute-candela inputs. */
export function writeLDT(profile: LDTProfile): string {
  validateLDT(profile);
  const lines: (string | number)[] = [
    profile.identification,
    profile.typeIndicator,
    profile.symmetry,
    profile.cAngles.length,
    profile.cPlaneSpacing,
    profile.gammaAngles.length,
    profile.gammaSpacing,
    profile.reportNumber,
    profile.luminaireName,
    profile.luminaireNumber,
    profile.fileName,
    profile.dateUser,
    profile.luminaire.length,
    profile.luminaire.width,
    profile.luminaire.height,
    profile.luminousArea.length,
    profile.luminousArea.width,
    ...profile.luminousArea.heights,
    profile.downwardFluxFraction,
    profile.lightOutputRatio,
    profile.conversionFactor,
    profile.measurementTilt,
    profile.lampSets.length,
  ];
  for (const lamp of profile.lampSets)
    lines.push(
      lamp.lampCount,
      lamp.description,
      lamp.totalLumens,
      lamp.colorTemperature,
      lamp.colorRendering,
      lamp.watts,
    );
  lines.push(...profile.directRatios, ...profile.cAngles, ...profile.gammaAngles);
  for (const row of profile.intensities) lines.push(...row);
  return `${lines
    .map((value) => {
      if (typeof value === 'string' && /[\r\n]/.test(value))
        throw new Error('EULUMDAT text fields must be single lines');
      return String(value);
    })
    .join('\n')}\n`;
}
