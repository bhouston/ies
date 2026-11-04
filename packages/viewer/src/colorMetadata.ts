const TEMPERATURE_KEYS = [
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
] as const;

/** Explicit source values only. No inference, validation, or renderer fallback. */
export function declaredColorTemperatures(metadata: Record<string, string>): string[] {
  return [
    ...new Set(TEMPERATURE_KEYS.map((key) => metadata[key]?.trim()).filter((value): value is string => Boolean(value))),
  ];
}
