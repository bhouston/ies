/** Field names and descriptions for IES LM-63 and EULUMDAT source text, shared by tooling and docs. */

/** LM-63 keywords. Keywords starting with `_` are user-defined. */
export const IES_KEYWORDS: Readonly<Record<string, string>> = {
  TEST: 'Test report number',
  TESTLAB: 'Photometric testing laboratory',
  TESTDATE: 'Date of the photometric test',
  ISSUEDATE: 'Date the manufacturer issued this file',
  DATE: 'Date (LM-63-1991; replaced by TESTDATE and ISSUEDATE)',
  MANUFAC: 'Manufacturer of the luminaire',
  LUMCAT: 'Luminaire catalog number',
  LUMINAIRE: 'Luminaire description',
  LAMPCAT: 'Lamp catalog number',
  LAMP: 'Lamp description',
  BALLAST: 'Ballast description',
  BALLASTCAT: 'Ballast catalog number',
  MAINTCAT: 'IES maintenance category (1–6)',
  DISTRIBUTION: 'Distribution description',
  FLASHAREA: 'Light-emitting area projected at 76° (flash area)',
  COLORCONSTANT: 'Color constant for glare calculations',
  LAMPPOSITION: 'Lamp position: vertical and horizontal angles of the lamp',
  NEARFIELD: 'Near-field photometry data references',
  FILEGENINFO: 'Additional information about how this file was generated',
  SEARCH: 'Search terms for this luminaire',
  OTHER: 'Other information',
  MORE: 'Continuation of the previous keyword line',
};

export function iesKeywordDescription(keyword: string): string {
  if (keyword.startsWith('_')) return 'User-defined keyword';
  return IES_KEYWORDS[keyword] ?? 'Unrecognized keyword';
}

export const IES_FORMAT_LINE: Readonly<Record<string, string>> = {
  'LM-63-1991': 'Format line: IESNA LM-63-1991',
  'LM-63-1995': 'Format line: IESNA LM-63-1995',
  'LM-63-2002': 'Format line: IESNA LM-63-2002',
  'LM-63-2019': 'Format line: ANSI/IES LM-63-2019',
};

/** The second number on the ballast line changed meaning between editions. */
export function iesSecondFieldDescription(version: string): [string, string] {
  if (version === 'LM-63-1986' || version === 'LM-63-1991')
    return ['Ballast-lamp photometric factor', 'Multiplier applied to every candela value in this edition'];
  if (version === 'LM-63-2019')
    return [
      'File generation type',
      'Provenance code such as 1.10100 (LM-63-2019 Table 2); never applied to candela values',
    ];
  return ['Future use (reserved)', 'Reserved field in LM-63-1995/2002; should be 1 and is not applied'];
}

/** [name, description] for the numeric IES header in file order, excluding the edition-dependent second ballast field. */
export const IES_HEADER = {
  lampCount: ['Number of lamps', 'Number of lamps in the luminaire'],
  lumensPerLamp: ['Lumens per lamp', 'Rated lumens per lamp; -1 means absolute photometry'],
  candelaMultiplier: ['Candela multiplier', 'Multiplier applied to every candela value'],
  verticalCount: ['Number of vertical angles', 'Count of vertical angles in the table'],
  horizontalCount: ['Number of horizontal angles', 'Count of horizontal angles in the table'],
  photometricType: ['Photometric type', '1 = Type C, 2 = Type B, 3 = Type A'],
  units: ['Units type', 'Units for the luminous opening: 1 = feet, 2 = meters'],
  width: ['Width', 'Width of the luminous opening; negative values describe round shapes'],
  length: ['Length', 'Length of the luminous opening; negative values describe round shapes'],
  height: ['Height', 'Height of the luminous opening; negative values describe round shapes'],
  ballastFactor: ['Ballast factor', 'Multiplier applied to every candela value'],
  inputWatts: ['Input watts', 'Total input power of the luminaire in watts'],
  tilt: ['TILT', 'Lamp tilt data: NONE, INCLUDE (embedded below) or an external file name'],
  tiltGeometry: ['Lamp-to-luminaire geometry', '1 = vertical base-up/down, 2 = horizontal, 3 = horizontal tilted'],
  tiltCount: ['Number of tilt angles', 'Count of tilt angle and multiplying factor pairs'],
  tiltAngle: ['Tilt angles', 'Lamp tilt angle in degrees'],
  tiltFactor: ['Tilt multiplying factors', 'Candela multiplier at the corresponding tilt angle'],
  verticalAngle: ['Vertical angles', 'Vertical angle'],
  horizontalAngle: ['Horizontal angles', 'Horizontal angle'],
  candela: ['Candela values', 'Candela'],
} as const satisfies Record<string, readonly [string, string]>;

export const LDT_SYMMETRY =
  'Isym: 0 = no symmetry, 1 = symmetric about the vertical axis, 2 = symmetric to the C0–C180 plane, ' +
  '3 = symmetric to the C90–C270 plane, 4 = symmetric to both the C0–C180 and C90–C270 planes';

/** EULUMDAT line fields in file order, as [profile key, name, description]. Lamp sets and arrays follow. */
export const LDT_LINES: readonly (readonly [string, string, string])[] = [
  ['identification', 'Company identification', 'Company identification, databank or version'],
  [
    'typeIndicator',
    'Ityp',
    'Type indicator: 1 = point source with symmetry about the vertical axis, 2 = linear luminaire, 3 = point source with other symmetry',
  ],
  ['symmetry', 'Isym', LDT_SYMMETRY],
  ['cCount', 'Mc', 'Number of C-planes between 0° and 360°'],
  ['cPlaneSpacing', 'Dc', 'Distance between C-planes in degrees; 0 for irregular spacing'],
  ['gammaCount', 'Ng', 'Number of γ (luminous intensity) angles in each C-plane'],
  ['gammaSpacing', 'Dg', 'Distance between γ angles in degrees; 0 for irregular spacing'],
  ['reportNumber', 'Measurement report number', 'Measurement report number'],
  ['luminaireName', 'Luminaire name', 'Luminaire name'],
  ['luminaireNumber', 'Luminaire number', 'Luminaire number'],
  ['fileName', 'File name', 'File name'],
  ['dateUser', 'Date/user', 'Date and user'],
  ['luminaire.length', 'Luminaire length', 'Length or diameter of the luminaire (mm)'],
  ['luminaire.width', 'Luminaire width', 'Width of the luminaire (mm); 0 for circular luminaires'],
  ['luminaire.height', 'Luminaire height', 'Height of the luminaire (mm)'],
  ['luminousArea.length', 'Luminous area length', 'Length or diameter of the luminous area (mm)'],
  ['luminousArea.width', 'Luminous area width', 'Width of the luminous area (mm); 0 for circular areas'],
  ['luminousArea.heights.0', 'Luminous area height C0', 'Height of the luminous area in the C0 plane (mm)'],
  ['luminousArea.heights.1', 'Luminous area height C90', 'Height of the luminous area in the C90 plane (mm)'],
  ['luminousArea.heights.2', 'Luminous area height C180', 'Height of the luminous area in the C180 plane (mm)'],
  ['luminousArea.heights.3', 'Luminous area height C270', 'Height of the luminous area in the C270 plane (mm)'],
  ['downwardFluxFraction', 'DFF', 'Downward flux fraction (%)'],
  ['lightOutputRatio', 'LORL', 'Light output ratio of the luminaire (%)'],
  ['conversionFactor', 'Conversion factor', 'Conversion factor for luminous intensities'],
  ['measurementTilt', 'Measurement tilt', 'Tilt of the luminaire during measurement (degrees)'],
  ['lampSetCount', 'n', 'Number of standard lamp sets (alternative lamp configurations)'],
];

/** [profile key, name suffix, description] for each lamp set's six lines. */
export const LDT_LAMP_SET_LINES: readonly (readonly [string, string, string])[] = [
  ['lampCount', 'number of lamps', 'Number of lamps; negative for absolute photometry'],
  ['description', 'type of lamps', 'Lamp type description'],
  ['totalLumens', 'total luminous flux', 'Total luminous flux of the lamps (lm)'],
  ['colorTemperature', 'color temperature', 'Color appearance or correlated color temperature'],
  ['colorRendering', 'color rendering', 'Color rendering group or index'],
  ['watts', 'wattage', 'Wattage including ballast (W)'],
];

/** Room indices k for the ten direct ratios. */
export const LDT_ROOM_INDICES = [0.6, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5] as const;
