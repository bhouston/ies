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
  /** Integrated flux below the horizontal (γ = 0…90°). */
  downwardFluxLumens: number | null;
  /** Integrated flux above the horizontal (γ = 90…180°). */
  upwardFluxLumens: number | null;
  /** Largest tabulated intensity after lamp tilt. Named apart from the summary's raw-table `peakCandela`. */
  peakIntensityCandela: number | null;
  /** First tabulated direction holding {@link PhotometricMetrics.peakIntensityCandela}. */
  peakDirection: { horizontalDegrees: number; verticalDegrees: number } | null;
  /** Intensity straight down (γ = 0). */
  nadirCandela: number | null;
  /** Light output ratio: integrated luminaire flux / declared lamp flux. Null without a lamp rating. */
  lightOutputRatio: number | null;
  /** Downward luminaire flux / declared lamp flux. */
  downwardLightOutputRatio: number | null;
  /** Upward luminaire flux / declared lamp flux. */
  upwardLightOutputRatio: number | null;
  /** Downward flux fraction (DFF): downward / total luminaire flux. */
  downwardFluxFraction: number | null;
  /**
   * CIE flux code N1–N5 as rounded percentages. N1–N3: flux within γ = 41.4°, 60°, 75.5° as % of
   * downward flux. N4, N5: downward and total flux as % of lamp flux (null without a lamp rating).
   */
  cieFluxCode: [number | null, number | null, number | null, number | null, number | null] | null;
  /** Integrated flux in standard polar zones. */
  zonalLumens: ZonalLumens[] | null;
}

export interface ZonalLumens {
  fromDegrees: number;
  toDegrees: number;
  lumens: number;
  /** Percentage of declared lamp flux; null without a lamp rating. */
  percentOfLamp: number | null;
  /** Percentage of integrated luminaire flux; null when the luminaire emits nothing. */
  percentOfLuminaire: number | null;
}

const zones: [number, number][] = [
  [0, 30],
  [0, 40],
  [0, 60],
  [0, 90],
  [90, 120],
  [90, 130],
  [90, 150],
  [90, 180],
  [0, 180],
];

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

export interface FluxBreakdown {
  total: number;
  /** Flux below the horizontal, γ = 0…90°. */
  downward: number;
  /** Flux above the horizontal, γ = 90…180°. */
  upward: number;
  /** cumulative[g] is the flux from γ = 0 to γ = g degrees, g = 0…180. */
  cumulative: number[];
}

/** Integral of a linear segment I(θ) from (a, ia) to (b, ib) times sin θ, in radians. */
function segmentIntegral(a: number, b: number, ia: number, ib: number): number {
  // Exact integral of linear intensity × sin θ. A midpoint form avoids cancellation
  // in cos(a)-cos(b) and sin(h)/h-cos(h) on very narrow measured intervals.
  const half = (b - a) / 2;
  const middle = (a + b) / 2;
  const square = half * half;
  const slopeWeight =
    Math.abs(half) < 1e-3
      ? square * (1 / 3 + square * (-1 / 30 + square / 840))
      : Math.sin(half) / half - Math.cos(half);
  return (ia * 0.5 + ib * 0.5) * 2 * Math.sin(middle) * Math.sin(half) + (ib - ia) * Math.cos(middle) * slopeWeight;
}

/**
 * Integrate Type C I(θ,φ) sin(θ) dθ dφ in lumens, exactly for the sampler's piecewise-bilinear model,
 * splitting measured intervals at whole degrees to also return the 1° cumulative zonal flux.
 * Uses each actual angular interval, mirrors axial/quadrant/bilateral data, and closes a missing
 * azimuth seam once. Duplicate 0°/360° rows are endpoints, never extra angular bins. Unmeasured
 * vertical ranges are dark. Multipliers already present in candelaValues are not applied again.
 */
export function calculateFluxBreakdown(profile: PhotometricGrid, tiltDegrees = 0): FluxBreakdown {
  if (profile.photometricType !== 1) throw new Error('Flux integration supports Type C photometry only (type 1)');
  const correction = tiltFactor(profile.tilt, tiltDegrees);
  // Azimuth integration is linear in each row's polar integral, so reduce it to one weight per row.
  const horizontal = profile.horizontalAngles;
  const weights = horizontal.map(() => 0);
  if (horizontal.length === 1) weights[0] = 2 * Math.PI;
  else {
    const span = horizontal.at(-1)! - horizontal[0]!;
    for (let h = 1; h < horizontal.length; h++) {
      const half = (horizontal[h]! - horizontal[h - 1]!) * 0.5 * radians;
      weights[h - 1]! += half;
      weights[h]! += half;
    }
    if (span <= 180) for (let h = 0; h < weights.length; h++) weights[h]! *= 360 / span;
    else if (span < 360) {
      const seam = (360 - span) * 0.5 * radians;
      weights[0]! += seam;
      weights[weights.length - 1]! += seam;
    }
  }
  // bins[k] holds the flux in (k-1°, k°].
  const bins = Array.from({ length: 181 }, () => 0);
  const vertical = profile.verticalAngles;
  profile.candelaValues.forEach((row, h) => {
    const weight = weights[h]! * correction;
    for (let v = 1; v < vertical.length; v++) {
      const a = vertical[v - 1]!;
      const b = vertical[v]!;
      const ia = row[v - 1]!;
      const ib = row[v]!;
      const at = (angle: number) => ia + ((ib - ia) * (angle - a)) / (b - a);
      let start = a;
      while (start < b) {
        const end = Math.min(b, Math.floor(start) + 1);
        // Clamp keeps out-of-range hand-built grids in the total, as before the zonal split.
        bins[Math.min(180, Math.max(0, Math.ceil(end)))]! +=
          weight * segmentIntegral(start * radians, end * radians, at(start), at(end));
        start = end;
      }
    }
  });
  const cumulative: number[] = [];
  let sum = 0;
  for (const bin of bins) cumulative.push((sum += bin));
  const total = cumulative[180]!;
  const downward = cumulative[90]!;
  return { total, downward, upward: total - downward, cumulative };
}

/** Total luminous flux in lumens; see {@link calculateFluxBreakdown}. */
export function calculateLuminousFlux(profile: PhotometricGrid, tiltDegrees = 0): number {
  return calculateFluxBreakdown(profile, tiltDegrees).total;
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
  const width = (fraction: number): { angle: number | null; status: BeamAngleStatus } => {
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
    return { angle: right - left, status: 'ok' };
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
  };
}

export function computePhotometricMetrics(profile: IESProfile, tiltDegrees = 0): PhotometricMetrics {
  if (!Number.isFinite(tiltDegrees)) throw new RangeError('Tilt angle must be finite');
  const supported = profile.photometricType === 1;
  const lamp = profile.lumensPerLamp < 0 ? null : profile.lampCount * profile.lumensPerLamp;
  const breakdown = supported ? calculateFluxBreakdown(profile, tiltDegrees) : null;
  const flux = breakdown?.total ?? null;
  return {
    metricsSupported: supported,
    metricsUnsupportedReason: supported ? null : 'Flux and beam calculations support Type C photometry only (type 1)',
    declaredLampFluxLumens: lamp,
    integratedFluxLumens: flux,
    luminousEfficacyLumensPerWatt: flux !== null && profile.inputWatts > 0 ? flux / profile.inputWatts : null,
    beamAngles: supported ? [getBeamAngles(profile, 0, tiltDegrees), getBeamAngles(profile, 90, tiltDegrees)] : [],
    metricsTiltDegrees: tiltDegrees,
    ...(breakdown ? extendedMetrics(profile, tiltDegrees, breakdown, lamp) : unsupportedExtendedMetrics),
  };
}

type ExtendedMetrics = Omit<
  PhotometricMetrics,
  | 'metricsSupported'
  | 'metricsUnsupportedReason'
  | 'declaredLampFluxLumens'
  | 'integratedFluxLumens'
  | 'luminousEfficacyLumensPerWatt'
  | 'beamAngles'
  | 'metricsTiltDegrees'
>;

/** Extended metric fields for unsupported coordinate systems or unselected lamp configurations. */
export const unsupportedExtendedMetrics: ExtendedMetrics = {
  downwardFluxLumens: null,
  upwardFluxLumens: null,
  peakIntensityCandela: null,
  peakDirection: null,
  nadirCandela: null,
  lightOutputRatio: null,
  downwardLightOutputRatio: null,
  upwardLightOutputRatio: null,
  downwardFluxFraction: null,
  cieFluxCode: null,
  zonalLumens: null,
};

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);
const percent = (fraction: number | null) => (fraction === null ? null : Math.round(fraction * 100));

function extendedMetrics(
  profile: IESProfile,
  tiltDegrees: number,
  { total, downward, upward, cumulative }: FluxBreakdown,
  lamp: number | null,
): ExtendedMetrics {
  const ofLamp = (flux: number) => (lamp ? flux / lamp : null);
  const cumulativeAt = (degrees: number) => {
    const low = Math.floor(degrees);
    return cumulative[low]! + (cumulative[low + 1]! - cumulative[low]!) * (degrees - low);
  };
  let peak = { candela: -Infinity, horizontalDegrees: 0, verticalDegrees: 0 };
  profile.candelaValues.forEach((row, h) =>
    row.forEach((candela, v) => {
      if (candela > peak.candela)
        peak = {
          candela,
          horizontalDegrees: profile.horizontalAngles[h]!,
          verticalDegrees: profile.verticalAngles[v]!,
        };
    }),
  );
  return {
    downwardFluxLumens: downward,
    upwardFluxLumens: upward,
    peakIntensityCandela: peak.candela * tiltFactor(profile.tilt, tiltDegrees),
    peakDirection: { horizontalDegrees: peak.horizontalDegrees, verticalDegrees: peak.verticalDegrees },
    nadirCandela: sampleIntensity(profile, 0, 0, tiltDegrees),
    lightOutputRatio: ofLamp(total),
    downwardLightOutputRatio: ofLamp(downward),
    upwardLightOutputRatio: ofLamp(upward),
    downwardFluxFraction: ratio(downward, total),
    cieFluxCode: [
      percent(ratio(cumulativeAt(41.4), downward)),
      percent(ratio(cumulativeAt(60), downward)),
      percent(ratio(cumulativeAt(75.5), downward)),
      percent(ofLamp(downward)),
      percent(ofLamp(total)),
    ],
    zonalLumens: zones.map(([fromDegrees, toDegrees]) => {
      const lumens = cumulative[toDegrees]! - cumulative[fromDegrees]!;
      const ofLuminaire = ratio(lumens, total);
      return {
        fromDegrees,
        toDegrees,
        lumens,
        percentOfLamp: lamp ? (lumens / lamp) * 100 : null,
        percentOfLuminaire: ofLuminaire === null ? null : ofLuminaire * 100,
      };
    }),
  };
}
