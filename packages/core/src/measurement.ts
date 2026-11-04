// Illuminance measurement helpers for false-colour receivers: units, auto-ranged legend and colour ramp.
import { sampleIntensity, type IESProfile } from './index.js';
import { LOG_DECADES, logTicks } from './charts.js';

export type MeasurementUnits = 'metric' | 'imperial';
/** One footcandle is one lumen per square foot. */
export const LUX_PER_FOOTCANDLE = 1 / 0.3048 ** 2;
export const METERS_PER_FOOT = 0.3048;

export const illuminanceUnit = (units: MeasurementUnits) => (units === 'imperial' ? 'fc' : 'lx');
export const lengthUnit = (units: MeasurementUnits) => (units === 'imperial' ? 'ft' : 'm');
/** Lux to lux (metric) or footcandles (imperial). */
export const illuminanceInUnits = (lux: number, units: MeasurementUnits) =>
  units === 'imperial' ? lux / LUX_PER_FOOTCANDLE : lux;
/** Metres to metres (metric) or feet (imperial). */
export const lengthInUnits = (meters: number, units: MeasurementUnits) =>
  units === 'imperial' ? meters / METERS_PER_FOOT : meters;
/** Metres (metric) or feet (imperial) back to metres. */
export const lengthFromUnits = (value: number, units: MeasurementUnits) =>
  units === 'imperial' ? value * METERS_PER_FOOT : value;

/**
 * Peak illuminance in lux on the floor `floorDistance` below a Type C luminaire and, when `wallDistance`
 * is given, on a facing wall that distance away along −Z. Each 1° direction lights whichever surface it
 * reaches first, matching the viewer's candela texture.
 */
export function peakReceiverIlluminance(profile: IESProfile, floorDistance: number, wallDistance?: number): number {
  let peak = 0;
  for (let v = 0; v <= 180; v++) {
    const theta = (v * Math.PI) / 180;
    const down = Math.cos(theta);
    for (let h = 0; h < 360; h++) {
      const towardWall = -Math.sin(theta) * Math.sin((h * Math.PI) / 180);
      const toFloor = down > 0 ? floorDistance / down : Infinity;
      const toWall = wallDistance !== undefined && towardWall > 0 ? wallDistance / towardWall : Infinity;
      if (toFloor === Infinity && toWall === Infinity) continue;
      // E = I cos(incidence) / r², with cos(incidence) = surface distance / r.
      const lux =
        toFloor <= toWall
          ? (sampleIntensity(profile, v, h) * down ** 3) / floorDistance ** 2
          : (sampleIntensity(profile, v, h) * towardWall ** 3) / wallDistance! ** 2;
      peak = Math.max(peak, lux);
    }
  }
  return peak;
}

export interface IlluminanceLegend {
  unit: 'lx' | 'fc';
  /** Peak illuminance in lux; the ramp spans `peak / 10^decades` to `peak` on a log scale. */
  peak: number;
  /** Peak illuminance in the display unit. */
  peakValue: number;
  decades: number;
  /** Contour levels: 1-2-5 values in the display unit, with their lux equivalents. */
  levels: { lux: number; value: number }[];
}
/** Log-scale legend from the peak down `decades`, with 1-2-5 contour levels in lux or footcandles. */
export function illuminanceLegend(peak: number, units: MeasurementUnits, decades = LOG_DECADES): IlluminanceLegend {
  const scale = units === 'imperial' ? LUX_PER_FOOTCANDLE : 1;
  return {
    unit: illuminanceUnit(units),
    peak,
    peakValue: peak / scale,
    decades,
    levels: logTicks(peak / scale, decades).map((value) => ({ lux: value * scale, value })),
  };
}

/** The isolux chart's perceptual blue-to-yellow ramp, hsl(235 − 195t, 80%, 15 + 50t%), as sRGB bytes. */
export function illuminanceRampRgb(t: number): [number, number, number] {
  const h = 235 - t * 195,
    l = (15 + t * 50) / 100,
    a = 0.8 * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/** A length such as "2.00 m" or "6.56 ft". */
export const formatLength = (meters: number, units: MeasurementUnits, digits = 2) =>
  `${lengthInUnits(meters, units).toFixed(digits)} ${lengthUnit(units)}`;

export interface RulerTick {
  /** Signed position along the ruler in metres. */
  meters: number;
  /** Distance label such as "2 m", "0" at the origin; absent on unlabelled ticks. */
  label?: string;
}
/**
 * Ruler ticks from `min` to `max` metres (min ≤ 0 ≤ max) every 1 m or 1 ft. Labels use the smallest
 * 1-2-5 step that leaves at most `maxLabels` labels on the longer side; past 5 units, ticks thin to a fifth of it.
 */
export function rulerTicks(min: number, max: number, units: MeasurementUnits, maxLabels = 5): RulerTick[] {
  const from = lengthInUnits(min, units);
  const to = lengthInUnits(max, units);
  const span = Math.max(-from, to);
  let major = 1;
  for (let i = 1; span / major > maxLabels; i++) major = [1, 2, 5][i % 3]! * 10 ** Math.floor(i / 3);
  const minor = major <= 5 ? 1 : major / 5;
  const ticks: RulerTick[] = [];
  for (let i = Math.ceil(from / minor); i <= Math.floor(to / minor); i++) {
    const value = i * minor;
    ticks.push({
      meters: lengthFromUnits(value, units),
      label: value % major ? undefined : value ? `${Math.abs(value)} ${lengthUnit(units)}` : '0',
    });
  }
  return ticks;
}
