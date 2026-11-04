import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePhotometry } from '@ies-tools/core';
import { iesSource } from '../../core/test/iesSource.js';
import { documentColorTemperature, temperatureColor } from './lightColor.js';

const temperature = (metadata: string) => documentColorTemperature(parsePhotometry(iesSource({ metadata })));

describe('single-temperature light appearance', () => {
  it.each([
    'COLORTEMP',
    '_COLORTEMP',
    'CCT',
    '_CCT',
    'COLORTEMPERATURE',
    '_COLORTEMPERATURE',
    'COLOR_TEMPERATURE',
    '_COLOR_TEMPERATURE',
    'TEMPCOLOR',
    '_TEMPCOLOR',
    '_SEARCH_COLORTEMP',
  ])('reads the %s explicit keyword before descriptions', (key) => {
    expect(temperature(`[${key}] 3000 K\n[LAMP] LED 5000K`)).toBe(3000);
  });
  it.each(['2700', '2700k', '2700 K', '2700 kelvin', '2700°K', 'CCT: 2700 K', '2700.0'])(
    'accepts an explicit temperature written as %s',
    (value) => {
      expect(temperature(`[CCT] ${value}`)).toBe(2700);
    },
  );
  it('finds explicit Kelvin values in lamp and luminaire descriptions', () => {
    expect(temperature('[LAMP] LED 12W 3000K CRI90')).toBe(3000);
    expect(temperature('[LUMINAIRE] LED 5000 kelvin')).toBe(5000);
    expect(temperature('[LAMP] LED 3000K\n[LUMINAIRE] Floodlight 3000K')).toBe(3000);
    expect(temperature('[CCT] 3000\n[_TEMPCOLOR] 3000K')).toBe(3000);
  });
  it.each([
    '',
    '[LAMP] LED 60W',
    '[LUMCAT] MODEL-3000K',
    '[LAMP] MODEL3000K',
    '[CCT] Unknown',
    '[CCT] 0',
    '[CCT] -3000',
    '[CCT] NaN',
    '[CCT] Infinity',
    '[CCT] 1000K',
    '[CCT] 26000K',
    '[CCT] 3000K/4000K',
    '[CCT] 3000 junk',
    '[CCT] 3000\n[_TEMPCOLOR] 4000',
    '[CCT] invalid\n[LAMP] 3000K',
    '[LAMP] 2700/3000K',
    '[LAMP] 2700–6500K',
    '[LAMP] 2700K–6500K',
    '[LAMP] 2700K/3000',
    '[LAMP] 3000K or 4000K',
    '[LAMP] 3000K\n[LUMINAIRE] 4000K',
  ])('defaults to 6500 K for absent, unsupported or ambiguous metadata: %s', (metadata) => {
    expect(temperature(metadata)).toBe(6500);
  });
  it.each([
    ['Floodlight_12W 3000K 54°.ies', 3000],
    ['Indoor_60W_120G_5300LM_5000K_OVNI.ies', 5000],
  ])('recognizes real fixture metadata in %s', (filename, expected) => {
    const text = readFileSync(new URL(`../../../fixtures/eulumdat-rs/${filename}`, import.meta.url), 'utf8');
    expect(documentColorTemperature(parsePhotometry(text))).toBe(expected);
  });
  it.each([1667, 1800, 2222, 2700, 3000, 4000, 6500, 10000, 25000])(
    'preserves unit luminance at %i K without clipping HDR positive channels',
    (kelvin) => {
      const { r, g, b } = temperatureColor(kelvin);
      expect([r, g, b].every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
      expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeCloseTo(1, 10);
      if (kelvin <= 3000) expect(r).toBeGreaterThan(b);
      if (kelvin >= 10000) expect(b).toBeGreaterThan(r);
    },
  );
  it.each([
    [3000, 0.43658, 0.40417],
    [6500, 0.31349, 0.32366],
  ])('matches reference Planckian chromaticity at %i K', (kelvin, x, y) => {
    const { r, g, b } = temperatureColor(kelvin);
    const X = 0.4124 * r + 0.3576 * g + 0.1805 * b;
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
    expect(X / (X + Y + Z)).toBeCloseTo(x, 4);
    expect(Y / (X + Y + Z)).toBeCloseTo(y, 4);
  });
  it.each([0, -1, NaN, Infinity, 1000, 26000])('uses a finite fallback color for %s', (value) => {
    expect(temperatureColor(value)).toEqual(temperatureColor(6500));
  });
});
