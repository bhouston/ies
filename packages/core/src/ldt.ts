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
  constructor(message: string) {
    super(`Invalid EULUMDAT: ${message}`);
    this.name = 'LDTParseError';
  }
}
function error(message: string): never {
  throw new LDTParseError(message);
}
function finite(value: number, name: string): void {
  if (!Number.isFinite(value)) error(`${name} must be finite`);
}
function nonnegative(value: number, name: string): void {
  finite(value, name);
  if (value < 0) error(`${name} must be nonnegative`);
}
function increasing(values: number[], name: string, maximum: number): void {
  if (values.length < 1) error(`${name} cannot be empty`);
  for (let i = 0; i < values.length; i++) {
    finite(values[i]!, name);
    if (values[i]! < 0 || values[i]! > maximum || (i > 0 && values[i]! <= values[i - 1]!))
      error(`${name} must be strictly increasing within 0..${maximum}`);
  }
}
/** Indices of the measured planes. Isym=3 wraps C270→C0→C90, as specified by DIAL. */
export function measuredCPlaneIndices(profile: Pick<LDTProfile, 'symmetry' | 'cAngles'>): number[] {
  const count = profile.cAngles.length;
  if (profile.symmetry === 1) return [0];
  if (profile.symmetry === 0) return Array.from({ length: count }, (_, i) => i);
  if (profile.symmetry === 2) {
    if (count % 2 !== 0 || profile.cAngles[count / 2] !== 180)
      error('C0–C180 symmetry requires an even C grid with its middle plane at 180°');
    return Array.from({ length: count / 2 + 1 }, (_, i) => i);
  }
  if (count % 4 !== 0 || profile.cAngles[count / 4] !== 90 || profile.cAngles[(count * 3) / 4] !== 270)
    error('C90–C270 and quadrant symmetries require a C grid divisible by four with 90° and 270° boundaries');
  if (profile.symmetry === 4) return Array.from({ length: count / 4 + 1 }, (_, i) => i);
  return Array.from({ length: count / 2 + 1 }, (_, i) => ((count * 3) / 4 + i) % count);
}

export function validateLDT(profile: LDTProfile): void {
  if (![1, 2, 3].includes(profile.typeIndicator)) error('type indicator must be 1, 2 or 3');
  if (![0, 1, 2, 3, 4].includes(profile.symmetry)) error('symmetry must be 0..4');
  increasing(profile.cAngles, 'C angles', 360);
  increasing(profile.gammaAngles, 'Gamma angles', 180);
  if (profile.cAngles[0] !== 0 || profile.cAngles.at(-1)! >= 360)
    error('C angles must start at 0° and exclude the duplicate 360° plane');
  // Preserve real-world upper-only datasets; a nonzero gamma start is structurally usable,
  // although DIAL's interchange description recommends starting at zero.
  nonnegative(profile.cPlaneSpacing, 'C spacing');
  nonnegative(profile.gammaSpacing, 'Gamma spacing');
  for (const [angles, spacing, name] of [
    [profile.cAngles, profile.cPlaneSpacing, 'C'],
    [profile.gammaAngles, profile.gammaSpacing, 'Gamma'],
  ] as const) {
    if (spacing > 0 && angles.some((angle, index) => Math.abs(angle - angles[0]! - index * spacing) > 1e-6))
      error(`${name} spacing does not match the listed angles; use zero for irregular grids`);
  }
  for (const [name, dimension] of Object.entries(profile.luminaire)) nonnegative(dimension, `luminaire ${name}`);
  nonnegative(profile.luminousArea.width, 'luminous width');
  nonnegative(profile.luminousArea.length, 'luminous length');
  for (const height of profile.luminousArea.heights) nonnegative(height, 'luminous height');
  if (profile.luminousArea.heights.length !== 4) error('four luminous-area heights are required');
  for (const [name, value] of [
    ['downward flux fraction', profile.downwardFluxFraction],
    ['light output ratio', profile.lightOutputRatio],
  ] as const) {
    nonnegative(value, name);
    if (value > 100) error(`${name} must not exceed 100%`);
  }
  nonnegative(profile.conversionFactor, 'conversion factor');
  finite(profile.measurementTilt, 'measurement tilt');
  if (profile.lampSets.length < 1 || profile.lampSets.length > 20) error('one to twenty lamp sets are required');
  const absolute = profile.lampSets.some((lamp) => lamp.lampCount < 0);
  if (absolute && (profile.lampSets.length !== 1 || profile.lampSets[0]!.lampCount >= 0))
    error('absolute photometry must have exactly one negative-count lamp set');
  for (const lamp of profile.lampSets) {
    if (!Number.isSafeInteger(lamp.lampCount) || lamp.lampCount === 0) error('lamp counts must be nonzero integers');
    nonnegative(lamp.totalLumens, 'lamp-set lumens');
    nonnegative(lamp.watts, 'lamp-set watts');
  }
  if (profile.directRatios.length !== 10) error('ten direct ratios are required');
  for (const ratio of profile.directRatios) {
    nonnegative(ratio, 'direct ratio');
    if (ratio > 1) error('direct ratios must not exceed one');
  }
  const indices = measuredCPlaneIndices(profile);
  if (
    profile.intensities.length !== indices.length ||
    profile.intensities.some((row) => row.length !== profile.gammaAngles.length)
  )
    error('intensity table dimensions do not match the symmetry and angle counts');
  for (const row of profile.intensities) for (const value of row) nonnegative(value, 'intensity');
}

/** Parse the line-oriented EULUMDAT format. The numeric angle/intensity tail may also use packed rows. */
export function parseLDT(text: string): LDTProfile {
  const lines = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  let cursor = 0;
  const next = (name: string): string => {
    const line = lines[cursor++];
    if (line === undefined) error(`missing ${name}`);
    return line.trim();
  };
  const numeric = (token: string, name: string): number => {
    // Decimal commas occur in European exports; comma-separated numeric lists are not LDT.
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(token.replace(',', '.')))
      error(`invalid ${name}: ${token}`);
    const value = Number(token.replace(',', '.'));
    finite(value, name);
    return value;
  };
  const number = (name: string) => numeric(next(name), name);
  const integer = (name: string, maximum: number): number => {
    const value = number(name);
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
      error(`${name} must be an integer within 1..${maximum}`);
    return value;
  };
  const identification = next('identification');
  const typeIndicator = integer('type indicator', 3) as LDTProfile['typeIndicator'];
  const symmetry = number('symmetry') as LDTProfile['symmetry'];
  const cCount = integer('C-plane count', 100_000);
  const cPlaneSpacing = number('C-plane spacing');
  const gammaCount = integer('gamma-angle count', 100_000);
  if (cCount * gammaCount > 10_000_000) error('table exceeds ten million angular samples');
  const gammaSpacing = number('gamma spacing');
  const reportNumber = next('report number'),
    luminaireName = next('luminaire name'),
    luminaireNumber = next('luminaire number'),
    fileName = next('file name'),
    dateUser = next('date/user');
  const luminaire = {
    length: number('luminaire length'),
    width: number('luminaire width'),
    height: number('luminaire height'),
  };
  const luminousArea = {
    length: number('luminous length'),
    width: number('luminous width'),
    heights: [
      number('C0 luminous height'),
      number('C90 luminous height'),
      number('C180 luminous height'),
      number('C270 luminous height'),
    ] as [number, number, number, number],
  };
  const downwardFluxFraction = number('downward flux fraction'),
    lightOutputRatio = number('light output ratio'),
    conversionFactor = number('conversion factor'),
    measurementTilt = number('measurement tilt');
  const lampCount = integer('lamp-set count', 20);
  const lampSets = Array.from({ length: lampCount }, () => ({
    lampCount: number('lamp count'),
    description: next('lamp description'),
    totalLumens: number('lamp-set lumens'),
    colorTemperature: next('lamp color temperature'),
    colorRendering: next('lamp color rendering'),
    watts: number('lamp-set watts'),
  }));
  const directRatios = Array.from({ length: 10 }, () => number('direct ratio'));
  const tail = lines.slice(cursor).join(' ').trim();
  const values = tail ? tail.split(/\s+/).map((token) => numeric(token, 'angle or intensity')) : [];
  let offset = 0;
  const cAngles = values.slice(offset, (offset += cCount));
  const gammaAngles = values.slice(offset, (offset += gammaCount));
  if (cAngles.length !== cCount || gammaAngles.length !== gammaCount) error('insufficient angle values');
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
  const rowCount = measuredCPlaneIndices(profile).length;
  const expected = rowCount * gammaCount;
  if (values.length - offset !== expected)
    error(`expected ${expected} intensity values, found ${values.length - offset}`);
  profile.intensities = Array.from({ length: rowCount }, () => values.slice(offset, (offset += gammaCount)));
  validateLDT(profile);
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
