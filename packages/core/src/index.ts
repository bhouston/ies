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
  ballastLampPhotometricFactor: number;
  inputWatts: number;
  verticalAngles: number[];
  horizontalAngles: number[];
  /** Horizontal-major values in candela, with candela and ballast multipliers applied. */
  candelaValues: number[][];
  tilt: IESTilt | null;
}

export class IESParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IESParseError';
  }
}

function fail(message: string): never {
  throw new IESParseError(message);
}

function ascending(values: number[], label: string, min: number, max: number): void {
  for (let i = 0; i < values.length; i++) {
    const value = values[i]!;
    if (value < min || value > max || (i > 0 && value <= values[i - 1]!)) {
      fail(`${label} must be strictly increasing within ${min}..${max} degrees`);
    }
  }
}

/** Parse LM-63-1986, IESNA91, LM-63-1995 and LM-63-2002. External TILT files are rejected. */
export function parseIES(text: string): IESProfile {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n?|\n/);
  const tiltLine = lines.findIndex((line) => /^\s*TILT\s*=/i.test(line));
  if (tiltLine < 0) fail('Missing TILT=NONE or TILT=INCLUDE declaration');
  const first = lines[0]?.trim() ?? '';
  let version = 'LM-63-1986';
  if (/^IESNA91$/i.test(first)) version = 'LM-63-1991';
  else if (/^IESNA:LM-63-(1995|2002)$/i.test(first)) version = first.toUpperCase().slice(6);
  else if (/^IES/i.test(first)) fail(`Unsupported IES header: ${first}`);
  const metadata: Record<string, string> = Object.create(null);
  let lastKey = '';
  for (const line of lines.slice(version === 'LM-63-1986' ? 0 : 1, tiltLine)) {
    const match = /^\s*\[([^\]]+)\]\s*(.*)$/.exec(line);
    if (match) {
      const key = match[1]!.toUpperCase();
      if (key === 'MORE' && lastKey) metadata[lastKey] += `\n${match[2]}`;
      else {
        metadata[key] = metadata[key] ? `${metadata[key]}\n${match[2]}` : match[2]!;
        lastKey = key;
      }
    }
  }
  const tiltMode = lines[tiltLine]!.replace(/^\s*TILT\s*=\s*/i, '')
    .trim()
    .toUpperCase();
  if (tiltMode !== 'NONE' && tiltMode !== 'INCLUDE') {
    fail('External TILT files are unsupported; use TILT=NONE or embed the data with TILT=INCLUDE');
  }
  const raw = lines
    .slice(tiltLine + 1)
    .join(' ')
    .trim();
  const tokens = raw ? raw.split(/[\s,]+/) : [];
  let cursor = 0;
  function number(label: string): number {
    const token = tokens[cursor++];
    if (!token || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) fail(`Missing or invalid ${label}`);
    const value = Number(token);
    if (!Number.isFinite(value)) fail(`Non-finite ${label}`);
    return value;
  }
  function count(label: string, max = 100_000): number {
    const value = number(label);
    if (!Number.isInteger(value) || value < 1 || value > max) fail(`${label} must be a positive integer <= ${max}`);
    return value;
  }
  let tilt: IESTilt | null = null;
  if (tiltMode === 'INCLUDE') {
    const geometry = count('tilt geometry', 3);
    const length = count('tilt angle count');
    const angles = Array.from({ length }, () => number('tilt angle'));
    const factors = Array.from({ length }, () => number('tilt factor'));
    ascending(angles, 'Tilt angles', 0, 180);
    if (factors.some((factor) => factor < 0)) fail('Tilt factors must be nonnegative');
    tilt = { geometry, angles, factors };
  }
  const lampCount = count('lamp count');
  const lumensPerLamp = number('lumens per lamp');
  if (lumensPerLamp < 0 && lumensPerLamp !== -1)
    fail('Lumens per lamp must be nonnegative or -1 for absolute photometry');
  const candelaMultiplier = number('candela multiplier');
  const verticalCount = count('vertical angle count');
  const horizontalCount = count('horizontal angle count');
  if (verticalCount * horizontalCount > 10_000_000) fail('Photometric table exceeds 10 million samples');
  const photometricType = count('photometric type', 3);
  const unit = count('units', 2);
  const dimensions = { width: number('width'), length: number('length'), height: number('height') };
  const ballastFactor = number('ballast factor');
  const ballastLampPhotometricFactor = number('ballast lamp factor / reserved field');
  const inputWatts = number('input watts');
  if (candelaMultiplier < 0 || ballastFactor < 0 || ballastLampPhotometricFactor < 0 || inputWatts < 0)
    fail('Multipliers and input watts must be nonnegative');
  const verticalAngles = Array.from({ length: verticalCount }, () => number('vertical angle'));
  const horizontalAngles = Array.from({ length: horizontalCount }, () => number('horizontal angle'));
  ascending(verticalAngles, 'Vertical angles', photometricType === 1 ? 0 : -90, photometricType === 1 ? 180 : 90);
  ascending(horizontalAngles, 'Horizontal angles', photometricType === 1 ? 0 : -90, photometricType === 1 ? 360 : 90);
  if (photometricType === 1) {
    const span = horizontalAngles.at(-1)! - horizontalAngles[0]!;
    if (
      horizontalCount === 1 ? horizontalAngles[0] !== 0 : span !== 90 && span !== 180 && !(span > 180 && span <= 360)
    ) {
      fail('Type C horizontal coverage must be axial (0), quadrant (90), bilateral (180), or full (>180)');
    }
  }
  const scale = candelaMultiplier * ballastFactor * (version === 'LM-63-2002' ? 1 : ballastLampPhotometricFactor);
  const candelaValues = Array.from({ length: horizontalCount }, () =>
    Array.from({ length: verticalCount }, () => {
      const value = number('candela value');
      if (value < 0) fail('Candela values must be nonnegative');
      const scaled = value * scale;
      if (!Number.isFinite(scaled)) fail('Scaled candela values must be finite');
      return scaled;
    }),
  );
  if (cursor !== tokens.length) fail(`Unexpected trailing data (${tokens.length - cursor} tokens)`);
  return {
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
    inputWatts,
    verticalAngles,
    horizontalAngles,
    candelaValues,
    tilt,
  };
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
  };
}
