---
sidebar_position: 7
sidebar_label: Core library
---

# Core library

`@ies-tools/core` parses, validates, measures and converts IES and EULUMDAT files. It has no dependencies and runs in Node and the browser, with no DOM or GPU needed.

```sh
npm install @ies-tools/core
```

This page covers common tasks. The [API reference](./api/core/index.md) documents every export.

## Parse and inspect a file

```ts
import { parsePhotometry, sampleIntensity, summarizeIES } from '@ies-tools/core';

const document = parsePhotometry(text); // IES or LDT, detected from the content
const candela = sampleIntensity(document.profile, 30, 90); // γ = 30°, C = 90°
const summary = summarizeIES(document.profile);
```

`parsePhotometry` returns a `PhotometricDocument` with a `profile` (the distribution in absolute candela), the luminaire `geometry` in metres, and the original file's fields in `source`. See [Conversion](./conversion.md) for details. For IES only, `parseIES(text)` returns the profile directly.

Supported files:

- IES LM-63-1986, IESNA91, LM-63-1995, LM-63-2002 and LM-63-2019, with embedded `TILT` data. Files that reference an external `TILT` file are rejected.
- EULUMDAT `.ldt`, with all five symmetry types and multiple lamp configurations.

Parse errors throw `IESParseError` or `LDTParseError`, with a `code`, an optional `field` and an optional source `range`.

### Sample intensity

`sampleIntensity(profile, verticalDegrees, horizontalDegrees, tiltDegrees = 0)` returns candela in any direction, interpolated between measured angles.

- Vertical 0° points straight down and 180° straight up. Horizontal angles wrap at 360°.
- Values are absolute candela, with the file's multipliers applied.
- Directions outside the measured range are dark.
- The optional fourth argument applies the file's embedded lamp-tilt correction at that angle.

Sampling, metrics and charts need Type C photometry. Type A and B files can be parsed and inspected; Type C-only functions reject them with a clear error.

To decide whether to show a 3D preview or charts before you mount a viewer, ask `getPhotometricTypeSupport`. It returns `{ supported: true }` for Type C. For Type A and B it returns `supported: false` with the `IES_UNSUPPORTED_COORDINATES` code, the photometric type and a message you can show. `SUPPORTED_PHOTOMETRIC_TYPES` lists the supported LM-63 type numbers (currently `[1]`). Both are also exported from `@ies-tools/viewer`.

```ts
import { getPhotometricTypeSupport, parsePhotometry } from '@ies-tools/core';

const photometry = parsePhotometry(text);
const support = getPhotometricTypeSupport(photometry.profile);
if (support.supported) viewer.setDocument(photometry);
else showNotice(support.message);
```

### Inspect a file

`inspectPhotometry` returns the same model the CLI's `ies inspect` and the VS Code information panel show: metadata, lamp configurations, statistics and diagnostics.

```ts
import { inspectPhotometry } from '@ies-tools/core';

const info = inspectPhotometry(text, 'ldt', 0); // zero-based lamp configuration
console.log(info.manufacturer, info.integratedFluxLumens, info.lampSets.length);
```

For an LDT file with several lamp configurations, statistics are `null` until you pass a configuration index.

### LM-63-2019 files

In LM-63-2019, the second number on the ballast line is the **file generation type**, such as `1.10100`. It is kept as `profile.fileGenerationType` and never scales intensity. The older ballast-lamp factor only scales intensity in 1986 and 1991 files.

## Validate a file

```ts
import { validateIES } from '@ies-tools/core';

const result = validateIES(text, { strict: true });
for (const diagnostic of result.diagnostics) {
  console.log(diagnostic.code, diagnostic.severity, diagnostic.field, diagnostic.message);
}
// result.profile is null only when parsing failed.
```

Each diagnostic has a stable `code`, a `severity` (`error`, `warning` or `info`), a `message` and, where it applies, the `field`.

- **Errors** are problems that stop the file being read: invalid numbers, counts, ranges, angle order or table size.
- **Warnings** are problems that leave the file usable, such as missing `[TEST]`, `[TESTLAB]`, `[ISSUEDATE]` or `[MANUFAC]` keywords in 2002 and 2019 files.
- **`strict: true`** makes warnings fail validation as well.

For either format, use `validatePhotometry(text, 'ies' | 'ldt', strict, lampSetIndex?)`. To check a profile you've already built, use `diagnoseIES(profile)`.

These checks cover the common LM-63 rules. They are not a full standards certification.

### Source locations

Diagnostics from text carry `range: { line, start, end }`: a 0-based line, with UTF-16 column offsets and an exclusive end, as VS Code and most editors expect. The range points at the token that caused the problem, or at the whole line for count and table-size errors.

For editor tooling, `describePhotometrySource` also describes every field in the file. It never throws for malformed files.

```ts
import { describePhotometrySource } from '@ies-tools/core';

const { diagnostics, fields } = describePhotometrySource(text, 'ies');
// fields: { line, start, end, name, description }[] in document order
const hovered = fields.find((field) => field.line === 9 && field.start <= 4 && 4 < field.end);
```

Field names and descriptions cover the IES format line, keywords, `TILT`, each header number, each angle and each candela value, and every line of an EULUMDAT file. The tables behind them (`IES_KEYWORDS`, `IES_HEADER`, `LDT_LINES` and related exports) are exported too.

## Photometric metrics

```ts
import { computePhotometricMetrics, getBeamAngles } from '@ies-tools/core';

const metrics = computePhotometricMetrics(profile); // optional second argument: lamp tilt in degrees
console.log(metrics.integratedFluxLumens, metrics.luminousEfficacyLumensPerWatt);

const c0 = getBeamAngles(profile, 0); // beam and field angles in the C0–C180 plane
console.log(c0.beamAngleDegrees, c0.fieldAngleDegrees);
```

`computePhotometricMetrics` returns:

| Field                                                                    | Meaning                                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `integratedFluxLumens`                                                   | Luminaire output, integrated from the intensity table                                             |
| `declaredLampFluxLumens`                                                 | Lamp count × rated lumens per lamp; `null` for absolute photometry                                |
| `luminousEfficacyLumensPerWatt`                                          | Integrated flux ÷ declared input watts; `null` for zero watts                                     |
| `beamAngles`                                                             | Beam (50 %) and field (10 %) angles for the C0–C180 and C90–C270 planes                           |
| `downwardFluxLumens`, `upwardFluxLumens`                                 | Flux below and above horizontal                                                                   |
| `peakIntensityCandela`, `peakDirection`                                  | Brightest measured intensity and its direction                                                    |
| `nadirCandela`                                                           | Intensity straight down                                                                           |
| `lightOutputRatio`, `downwardLightOutputRatio`, `upwardLightOutputRatio` | Luminaire flux ÷ lamp flux (LOR, DLOR, ULOR); `null` for absolute photometry                      |
| `downwardFluxFraction`                                                   | Downward ÷ total flux (DFF)                                                                       |
| `cieFluxCode`                                                            | CIE flux code `[N1, N2, N3, N4, N5]` as rounded percentages; N4 and N5 need a lamp rating         |
| `zonalLumens`                                                            | Flux in standard zones (0–30°, 0–40°, 0–60°, 0–90°, 90–120°, … 0–180°), in lumens and percentages |

For Type A and B files, `metricsSupported` is `false`, `metricsUnsupportedReason` explains why, and the values are `null`.

Each beam estimate has a `beamAngleStatus` and `fieldAngleStatus`. When a plane has no light, no clear edge, or several lobes, the status says so (`no-light`, `no-crossing` or `multiple-lobes`) and the angle is `null`. `beamLeftDegrees`, `beamRightDegrees`, `fieldLeftDegrees` and `fieldRightDegrees` give each edge as a signed vertical angle, negative on the opposite C-plane.

For just the flux, use `calculateLuminousFlux(profile, tiltDegrees?)`. `calculateFluxBreakdown(profile, tiltDegrees?)` returns `{ total, downward, upward, cumulative }`, where `cumulative[g]` is the flux from γ = 0° to γ = g°.

### How metrics are calculated

Flux integrates I(θ, φ) sin θ dθ dφ over the same interpolated intensity that `sampleIntensity` uses, with the file's symmetry expanded. Unmeasured directions count as dark. The result is an estimate from the angular table, not a laboratory flux measurement, so it can differ from the declared lamp flux. These are different quantities.

Beam and field angles are the full angles between the 50 % and 10 % of peak crossings on each side of the peak, following the [IES beam-angle](https://ies.org/definitions/beam-angle/) and [field-angle](https://ies.org/definitions/field-angle/) definitions. They are estimates from the principal planes, not certified manufacturer values.

CIE flux code N1–N3 are the flux within γ = 41.4°, 60° and 75.5° as percentages of downward flux. N4 and N5 are downward and total flux as percentages of lamp flux.

## Chart data

The numbers behind every [chart](./graphs.md) come from core, with no React, Three.js or DOM dependency. Use them to draw charts with another library or to export values.

```ts
import {
  buildIntensityCurves,
  buildIntensityTopology,
  buildIsoluxGrid,
  groundIlluminance,
  extractContours,
  isoluxContourLevels,
  buildConeDiagram,
  buildLuminanceTable,
  buildIntensityTable,
} from '@ies-tools/core';

const cuts = buildIntensityCurves(profile, { principalPlanes: true });
// cuts.curves[].points: { angle: signed degrees, intensity: candela }; curves[].beam: beam and field estimate.
// cuts.angleTicks and cuts.intensityTicks are ready for axes.

const mesh = buildIntensityTopology(profile, { upAxis: 'z', projection: 'orthographic' });
// vertices[].position: candela-scaled XYZ; projected: normalized XY. faces: triangles sorted far to near.

const lux = groundIlluminance(profile, 1, 2, { mountingHeight: 3, aimAngle: 30 }); // lux at x = 1 m, z = 2 m
const grid = buildIsoluxGrid(profile, { mountingHeight: 3, extent: [12, 8], resolution: [61, 41] });
// grid.xs, grid.zs, grid.values[zIndex][xIndex], plus maximum, minimum, average and uniformity (U0).
const levels = isoluxContourLevels(grid.maximum, { minContour: 1 }); // [1, 2, 5, 10, 20, 50, …]
const contours = extractContours(grid, levels);
// contours[].segments: [[x1, z1], [x2, z2]] line segments in metres.

const cone = buildConeDiagram(profile, { maxDistance: 5 });
// cone.rows[]: { distance, illuminance, beamDiameters: [c0, c90], fieldDiameters: [c0, c90] }
const glare = buildLuminanceTable(profile);
// glare.luminance[gammaIndex][cIndex] in cd/m² (null for zero area); glare.intensity in cd.
const table = buildIntensityTable(profile, { unit: 'cd/klm' });
// table.values[gammaIndex][cIndex], with table.gammas, table.cPlanes and table.unit.
```

`luminousShape(profile.dimensions, profile.units, profile.version)` reads the luminous-opening shape from the signed IES width, length and height (the 15 shapes of LM-63-2002/2019 Table 1, plus the older negative-width circle and vertical disks or ellipses facing the 90° plane, which are not in Table 1). Pass the version so LM-63-1986, 1991 and 1995 files are read with their own sign conventions; for example, a 1995 sphere is written as `(-D, 0, -D)`, which in 2002 means a vertical disk. Without it, the 2002 rules apply. Converting a round EULUMDAT opening to IES writes the 2002 form `(-D, -D, h)`. It returns the shape name, such as `rectangular`, `circular`, `vertical-cylinder` or `sphere`, and its size in metres. `projectedLuminousArea(shape, direction)` gives the area seen from a unit direction (Y up, +X toward C0), so intensity divided by it is the average luminance in cd/m².

```js
const shape = luminousShape({ width: -0.1, length: 1.2, height: -0.1 });
// { kind: 'horizontal-cylinder-along-length', solid: 'cylinder', axis: 'x', width: 0.1, length: 1.2, height: 0.1 }
projectedLuminousArea(shape, [0, -1, 0]); // 0.12 m² seen from below
```

Axis helpers `niceTicks`, `logRadius`, `logTicks`, `orientGraphPoint` and `formatGraphValue` are exported too. The options match the chart props described on the [Charts](./graphs.md) page.
