import { sampleIntensity, type IESProfile, type IESTilt } from './index.js';

/** Absolute candela on a horizontal-major angular grid. No metadata or lamp rating is required. */
export type PhotometricGrid = Pick<
  IESProfile,
  'photometricType' | 'verticalAngles' | 'horizontalAngles' | 'candelaValues'
> & { tilt?: IESTilt | null };

export type BeamAngleStatus = 'ok' | 'no-light' | 'no-crossing' | 'multiple-lobes';

export interface BeamAngles {
  /** Opposed-plane cut C-h / C-(h+180); full angle around the cut's peak, in degrees. */
  horizontalDegrees: number;
  peakDirectionDegrees: number;
  peakCandela: number;
  /** Nearest measured 50%-peak crossings bracketing the dominant lobe; null if not both present. */
  beamAngleDegrees: number | null;
  /** Nearest measured 10%-peak crossings bracketing the dominant lobe; null if not both present. */
  fieldAngleDegrees: number | null;
  beamAngleStatus: BeamAngleStatus;
  fieldAngleStatus: BeamAngleStatus;
  /** Signed vertical angle of the 50% crossing before the peak; negative is in the C+180 plane. Set when the beam status is ok. */
  beamLeftDegrees?: number;
  /** Signed vertical angle of the 50% crossing after the peak. Set when the beam status is ok. */
  beamRightDegrees?: number;
  /** Signed vertical angle of the 10% crossing before the peak; negative is in the C+180 plane. Set when the field status is ok. */
  fieldLeftDegrees?: number;
  /** Signed vertical angle of the 10% crossing after the peak. Set when the field status is ok. */
  fieldRightDegrees?: number;
}

export interface PhotometricMetrics {
  metricsSupported: boolean;
  metricsUnsupportedReason: string | null;
  /** Lamp rating × lamp count, not measured luminaire output. Null for absolute photometry. */
  declaredLampFluxLumens: number | null;
  /** Estimated luminaire output integrated from the angular intensity table. */
  integratedFluxLumens: number | null;
  /** Integrated luminaire flux / declared input watts. Null for zero power or unsupported type. */
  luminousEfficacyLumensPerWatt: number | null;
  /** Principal-plane estimates, not a certification of nominal beam axis or global extrema. */
  beamAngles: BeamAngles[];
  /** Lamp tilt applied to the intensity table when computing metrics (default 0°). */
  metricsTiltDegrees: number;
}

const radians = Math.PI / 180;

function tiltFactor(tilt: IESTilt | null | undefined, tiltDegrees: number): number {
  if (!Number.isFinite(tiltDegrees)) throw new RangeError('Tilt angle must be finite');
  if (!tilt) return 1;
  const angle = Math.abs(tiltDegrees);
  if (angle <= tilt.angles[0]!) return tilt.factors[0]!;
  for (let i = 1; i < tilt.angles.length; i++) {
    if (angle <= tilt.angles[i]!) {
      const fraction = (angle - tilt.angles[i - 1]!) / (tilt.angles[i]! - tilt.angles[i - 1]!);
      return tilt.factors[i - 1]! + fraction * (tilt.factors[i]! - tilt.factors[i - 1]!);
    }
  }
  return tilt.factors.at(-1)!;
}

/**
 * Integrate Type C I(θ,φ) sin(θ) dθ dφ in lumens, exactly for the sampler's piecewise-bilinear model.
 * Uses each actual angular interval, mirrors axial/quadrant/bilateral data, and closes a missing
 * azimuth seam once. Duplicate 0°/360° rows are endpoints, never extra angular bins. Unmeasured
 * vertical ranges are dark. Multipliers already present in candelaValues are not applied again.
 */
export function calculateLuminousFlux(profile: PhotometricGrid, tiltDegrees = 0): number {
  if (profile.photometricType !== 1) throw new Error('Flux integration supports Type C photometry only (type 1)');
  const correction = tiltFactor(profile.tilt, tiltDegrees);
  const rowFluxes = profile.candelaValues.map((row) => {
    let integral = 0;
    for (let v = 1; v < profile.verticalAngles.length; v++) {
      const a = profile.verticalAngles[v - 1]! * radians;
      const b = profile.verticalAngles[v]! * radians;
      const width = b - a;
      // Exact integral of linear intensity × sin θ. A midpoint form avoids cancellation
      // in cos(a)-cos(b) and sin(h)/h-cos(h) on very narrow measured intervals.
      const half = width / 2;
      const middle = (a + b) / 2;
      const square = half * half;
      const slopeWeight =
        Math.abs(half) < 1e-3
          ? square * (1 / 3 + square * (-1 / 30 + square / 840))
          : Math.sin(half) / half - Math.cos(half);
      const average = row[v - 1]! * 0.5 + row[v]! * 0.5;
      integral +=
        average * 2 * Math.sin(middle) * Math.sin(half) + (row[v]! - row[v - 1]!) * Math.cos(middle) * slopeWeight;
    }
    return integral;
  });
  if (profile.horizontalAngles.length === 1) return rowFluxes[0]! * 2 * Math.PI * correction;
  let integral = 0;
  const horizontal = profile.horizontalAngles;
  const span = horizontal.at(-1)! - horizontal[0]!;
  for (let h = 1; h < horizontal.length; h++) {
    integral += (rowFluxes[h - 1]! + rowFluxes[h]!) * 0.5 * (horizontal[h]! - horizontal[h - 1]!) * radians;
  }
  if (span <= 180) integral *= 360 / span;
  else if (span < 360) integral += (rowFluxes.at(-1)! + rowFluxes[0]!) * 0.5 * (360 - span) * radians;
  return integral * correction;
}

/** Estimate widths of the dominant lobe in a complete opposed-plane cut, using measured knots. */
export function getBeamAngles(profile: IESProfile, horizontalDegrees = 0, tiltDegrees = 0): BeamAngles {
  if (profile.photometricType !== 1) throw new Error('Beam estimates support Type C photometry only (type 1)');
  if (![horizontalDegrees, tiltDegrees].every(Number.isFinite)) throw new RangeError('Beam angles must be finite');
  // Signed vertical directions traverse the two opposite meridians. Do not insert extrapolated
  // zero samples at a missing hemisphere boundary: that would invent a threshold crossing.
  const directions = [...profile.verticalAngles.toReversed().map((v) => -v), ...profile.verticalAngles].filter(
    (value, index, values) => index === 0 || value !== values[index - 1],
  );
  const intensities = directions.map((v) =>
    sampleIntensity(profile, Math.abs(v), horizontalDegrees + (v < 0 ? 180 : 0), tiltDegrees),
  );
  let peakIndex = 0;
  for (let i = 1; i < intensities.length; i++) if (intensities[i]! > intensities[peakIndex]!) peakIndex = i;
  const peak = intensities[peakIndex] ?? 0;
  const width = (
    fraction: number,
  ): { angle: number | null; status: BeamAngleStatus; left?: number; right?: number } => {
    if (peak <= 0) return { angle: null, status: 'no-light' };
    const threshold = peak * fraction;
    const crossing = (direction: -1 | 1): number | null => {
      for (let i = peakIndex + direction; i >= 0 && i < intensities.length; i += direction) {
        const previous = i - direction;
        // Positive and negative sides have a gap if the measured range excludes nadir.
        if (directions[previous]! * directions[i]! < 0 && profile.verticalAngles[0] !== 0) return null;
        if (intensities[i]! <= threshold) {
          const t = (threshold - intensities[previous]!) / (intensities[i]! - intensities[previous]!);
          return directions[previous]! + t * (directions[i]! - directions[previous]!);
        }
      }
      return null;
    };
    const left = crossing(-1);
    const right = crossing(1);
    if (left === null || right === null) return { angle: null, status: 'no-crossing' };
    if (
      intensities.some((value, index) => value > threshold && (directions[index]! < left || directions[index]! > right))
    ) {
      return { angle: null, status: 'multiple-lobes' };
    }
    return { angle: right - left, status: 'ok', left, right };
  };
  const beam = width(0.5);
  const field = width(0.1);
  return {
    horizontalDegrees: ((horizontalDegrees % 360) + 360) % 360,
    peakDirectionDegrees: directions[peakIndex] || 0,
    peakCandela: peak,
    beamAngleDegrees: beam.angle,
    fieldAngleDegrees: field.angle,
    beamAngleStatus: beam.status,
    fieldAngleStatus: field.status,
    ...(beam.status === 'ok' && { beamLeftDegrees: beam.left, beamRightDegrees: beam.right }),
    ...(field.status === 'ok' && { fieldLeftDegrees: field.left, fieldRightDegrees: field.right }),
  };
}

export function computePhotometricMetrics(profile: IESProfile, tiltDegrees = 0): PhotometricMetrics {
  if (!Number.isFinite(tiltDegrees)) throw new RangeError('Tilt angle must be finite');
  const supported = profile.photometricType === 1;
  const flux = supported ? calculateLuminousFlux(profile, tiltDegrees) : null;
  return {
    metricsSupported: supported,
    metricsUnsupportedReason: supported ? null : 'Flux and beam calculations support Type C photometry only (type 1)',
    declaredLampFluxLumens: profile.lumensPerLamp < 0 ? null : profile.lampCount * profile.lumensPerLamp,
    integratedFluxLumens: flux,
    luminousEfficacyLumensPerWatt: flux !== null && profile.inputWatts > 0 ? flux / profile.inputWatts : null,
    beamAngles: supported ? [getBeamAngles(profile, 0, tiltDegrees), getBeamAngles(profile, 90, tiltDegrees)] : [],
    metricsTiltDegrees: tiltDegrees,
  };
}
