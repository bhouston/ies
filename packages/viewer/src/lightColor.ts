import { Color } from 'three';
import type { PhotometricDocument } from '@ies-tools/core';
import { declaredColorTemperatures } from './colorMetadata.js';

export const DEFAULT_COLOR_TEMPERATURE = 6500;
const MIN_TEMPERATURE = 1667;
const MAX_TEMPERATURE = 25000;

function supported(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_TEMPERATURE && value <= MAX_TEMPERATURE;
}
function parseTemperature(text: string): number | undefined {
  const match = /^\s*(?:CCT\s*[:=]?\s*)?(\d+(?:\.\d+)?)\s*(?:°?K|kelvin)?\s*$/i.exec(text);
  const value = match ? Number(match[1]) : NaN;
  return supported(value) ? value : undefined;
}
function uniqueTemperature(values: (number | undefined)[]): number {
  return values.every((value) => value !== undefined && value === values[0]) ? values[0]! : DEFAULT_COLOR_TEMPERATURE;
}

/** One uniform CCT per selected configuration. Unknown or ambiguous colors use 6500 K. */
export function documentColorTemperature(document: PhotometricDocument): number {
  if (document.sourceFormat === 'ldt') {
    const lamp = document.lampSets[document.selectedLampSetIndex ?? 0];
    if (lamp?.colorTemperature.trim()) return parseTemperature(lamp.colorTemperature) ?? DEFAULT_COLOR_TEMPERATURE;
  }
  const metadata = document.profile.metadata;
  const declared = declaredColorTemperatures(metadata);
  if (declared.length) return uniqueTemperature(declared.map((value) => parseTemperature(value)));

  // Only explicit Kelvin units in descriptions: never infer temperature from catalog codes or watts.
  const description =
    document.sourceFormat === 'ldt'
      ? [document.lampSets[document.selectedLampSetIndex ?? 0]?.description, metadata.LUMINAIRE].join(' ')
      : [metadata.LAMP, metadata.LUMINAIRE].join(' ');
  // Reject selectable ranges, including forms such as 2700/3000K and 2700K–6500K.
  if (/\d\s*(?:K\s*)?[-–—/]\s*\d+(?:\.\d+)?\s*°?K\b|\d\s*°?K\s*[-–—/]\s*\d/i.test(description))
    return DEFAULT_COLOR_TEMPERATURE;
  const matches = [...description.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)\s*(?:°?K|kelvin)\b/gi)];
  return matches.length
    ? uniqueTemperature(matches.map((match) => parseTemperature(match[0])))
    : DEFAULT_COLOR_TEMPERATURE;
}

/** Planckian-locus approximation, converted from CIE xy to linear sRGB at unit luminance.
 * Kang et al. (2002), valid from 1667 to 25000 K:
 * https://colour.readthedocs.io/en/develop/_modules/colour/temperature/kang2002.html
 * This approximates white-light appearance; it does not model spectra, Duv, or CRI.
 */
export function temperatureColor(kelvin: number): Color {
  const t = supported(kelvin) ? kelvin : DEFAULT_COLOR_TEMPERATURE;
  const x =
    t <= 4000
      ? -0.2661239e9 / t ** 3 - 0.2343589e6 / t ** 2 + 0.8776956e3 / t + 0.17991
      : -3.0258469e9 / t ** 3 + 2.1070379e6 / t ** 2 + 0.2226347e3 / t + 0.24039;
  const y =
    t <= 2222
      ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
      : t <= 4000
        ? -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
        : 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  const X = x / y;
  const Z = (1 - x - y) / y;
  // XYZ (Y=1) to linear sRGB. Clip out-of-gamut negatives, then restore luminance.
  const r = Math.max(0, 3.2406 * X - 1.5372 - 0.4986 * Z);
  const g = Math.max(0, -0.9689 * X + 1.8758 + 0.0415 * Z);
  const b = Math.max(0, 0.0557 * X - 0.204 + 1.057 * Z);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return new Color().setRGB(r / luminance, g / luminance, b / luminance);
}
