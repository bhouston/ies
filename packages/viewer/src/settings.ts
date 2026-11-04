export const TONE_MAPPING_OPTIONS = [
  { value: 'aces', label: 'ACES Filmic' },
  { value: 'agx', label: 'AgX' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'reinhard', label: 'Reinhard' },
  { value: 'cineon', label: 'Cineon' },
  { value: 'linear', label: 'Linear' },
  { value: 'none', label: 'None' },
] as const;
export type ToneMappingName = (typeof TONE_MAPPING_OPTIONS)[number]['value'];
export const VIEW_MODE_OPTIONS = [
  { value: 'realistic', label: 'Realistic' },
  { value: 'measurement', label: 'Measurement' },
] as const;
export type ViewMode = (typeof VIEW_MODE_OPTIONS)[number]['value'];
export const UNITS_OPTIONS = [
  { value: 'metric', label: 'Metric' },
  { value: 'imperial', label: 'Imperial' },
] as const;
export type Units = (typeof UNITS_OPTIONS)[number]['value'];
/** Scene and display settings shared by the React viewer and `<light-viewer>`. */
export interface ViewerSettings {
  /** Show the back wall. Defaults to true. */
  showWall: boolean;
  /** Wall distance from the luminaire in meters. Defaults to 2. */
  wallDistance: number;
  /** Floor distance below the luminaire in meters. Defaults to 2. */
  floorDistance: number;
  /** Tone mapping operator. Defaults to `aces`. */
  toneMapping: ToneMappingName;
  /** Nonnegative display exposure. Defaults to 1. */
  exposure: number;
  /** Show the blue beam-extent helper lines (cone or spheres). Defaults to true. */
  helper: boolean;
  /** `realistic` shades diffuse surfaces; `measurement` shows false-colour illuminance with isolux contours. Defaults to `realistic`. */
  viewMode: ViewMode;
  /** Display units: lux and metres, or footcandles and feet. Stored distances stay in metres. Defaults to `metric`. */
  units: Units;
  /** Overlay the 3D candela distribution, its peak at half the floor distance. Defaults to false. */
  photometricSolid: boolean;
  /** Show floor distance rulers and the mounting-height ruler. Defaults to true. */
  rulers: boolean;
}
export const DEFAULT_VIEWER_SETTINGS: Readonly<ViewerSettings> = Object.freeze({
  showWall: true,
  wallDistance: 2,
  floorDistance: 2,
  toneMapping: 'aces',
  exposure: 1,
  helper: true,
  viewMode: 'realistic',
  units: 'metric',
  photometricSolid: false,
  rulers: true,
});
export const VIEWER_SETTINGS_ATTRIBUTES = [
  'show-wall',
  'wall-distance',
  'floor-distance',
  'tone-mapping',
  'exposure',
  'helper',
  'view-mode',
  'units',
  'photometric-solid',
  'rulers',
] as const;
export interface ViewerSettingsChangeDetail {
  settings: ViewerSettings;
  previousSettings: ViewerSettings;
}
export type ViewerSettingsListener = (event: CustomEvent<ViewerSettingsChangeDetail>) => void;

/** Validate the whole patch before publishing a new state. No partial mutations or silent clamping. */
export function resolveViewerSettings(
  patch: Partial<ViewerSettings>,
  current: Readonly<ViewerSettings> = DEFAULT_VIEWER_SETTINGS,
): ViewerSettings {
  for (const key of Object.keys(patch))
    if (!Object.hasOwn(DEFAULT_VIEWER_SETTINGS, key)) throw new Error(`Unknown viewer setting: ${key}`);
  const next = { ...current, ...patch };
  if (typeof next.showWall !== 'boolean') throw new TypeError('showWall must be a boolean');
  if (typeof next.helper !== 'boolean') throw new TypeError('helper must be a boolean');
  if (typeof next.photometricSolid !== 'boolean') throw new TypeError('photometricSolid must be a boolean');
  if (typeof next.rulers !== 'boolean') throw new TypeError('rulers must be a boolean');
  if (!TONE_MAPPING_OPTIONS.some((option) => option.value === next.toneMapping))
    throw new RangeError('Unsupported toneMapping function');
  if (!VIEW_MODE_OPTIONS.some((option) => option.value === next.viewMode))
    throw new RangeError('viewMode must be realistic or measurement');
  if (!UNITS_OPTIONS.some((option) => option.value === next.units))
    throw new RangeError('units must be metric or imperial');
  for (const [key, min, max] of [
    ['wallDistance', 0.1, 100],
    ['floorDistance', 0.1, 100],
    ['exposure', 0, Infinity],
  ] as const) {
    const value = next[key];
    if (!Number.isFinite(value) || value < min || value > max)
      throw new RangeError(`${key} must be a finite number from ${min} to ${max}`);
  }
  return next;
}
export function settingsEqual(a: Readonly<ViewerSettings>, b: Readonly<ViewerSettings>): boolean {
  return (Object.keys(DEFAULT_VIEWER_SETTINGS) as (keyof ViewerSettings)[]).every((key) => a[key] === b[key]);
}
export function viewerSettingFromAttribute(name: string, value: string | null): Partial<ViewerSettings> {
  const number = (key: 'wallDistance' | 'floorDistance' | 'exposure') => ({
    [key]: value === null ? DEFAULT_VIEWER_SETTINGS[key] : value.trim() ? Number(value) : NaN,
  });
  const booleans = {
    'show-wall': 'showWall',
    helper: 'helper',
    'photometric-solid': 'photometricSolid',
    rulers: 'rulers',
  } as const;
  if (Object.hasOwn(booleans, name)) {
    const key = booleans[name as keyof typeof booleans];
    if (value === null) return { [key]: DEFAULT_VIEWER_SETTINGS[key] };
    if (value === '' || value === 'true') return { [key]: true };
    if (value === 'false') return { [key]: false };
    throw new RangeError(`${name} must be empty, true, or false`);
  }
  if (name === 'wall-distance') return number('wallDistance');
  if (name === 'floor-distance') return number('floorDistance');
  if (name === 'exposure') return number('exposure');
  if (name === 'tone-mapping')
    return { toneMapping: (value ?? DEFAULT_VIEWER_SETTINGS.toneMapping) as ToneMappingName };
  if (name === 'view-mode') return { viewMode: (value ?? DEFAULT_VIEWER_SETTINGS.viewMode) as ViewMode };
  if (name === 'units') return { units: (value ?? DEFAULT_VIEWER_SETTINGS.units) as Units };
  return {};
}
