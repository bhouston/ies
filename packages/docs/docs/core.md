---
sidebar_position: 5
---

# Core library

```ts
import { parseIES, sampleIntensity, summarizeIES } from '@ies-tools/core';
const profile = parseIES(iesText);
const candela = sampleIntensity(profile, 30, 90);
const summary = summarizeIES(profile); // format/version, coordinate type, source descriptions and stats
```

`parseIES` supports LM-63-1986, IESNA91, LM-63-1995 , LM-63-2002 and LM-63-2019. It validates numeric data, dimensions, angle counts, ranges and table size. Metadata is preserved, including continuation lines. External TILT files are rejected with a clear error; embedded TILT data is preserved.

`candelaValues` is horizontal-major and contains absolute intensities with candela and ballast multipliers applied. The ballast-lamp factor is applied only to 1986/1991 files; the second field is reserved in 1995/2002 and is provenance in 2019. Dimensions retain the file's units and signed shape encoding. A negative lumens-per-lamp value of -1 denotes absolute photometry.

`sampleIntensity(profile, verticalDegrees, horizontalDegrees, tiltDegrees = 0)` returns candela with bilinear interpolation. Vertical zero points down; 180 points up. Horizontal angles wrap around 360 degrees. Axial, quadrant, bilateral and full Type C symmetry are supported. Missing vertical coverage is dark. Embedded lamp-tilt factors are interpolated at the fourth argument, clamped to their measured range.

Type A/B files can be parsed and inspected, but intensity sampling and rendering support Type C only and reject other types explicitly. The viewer is a direct-light visualization, not a full architectural lighting simulation.

## LM-63-2019 interpretation

The current edition uses the exact `IES:LM-63-2019` header. The 2025 reaffirmation of the standard does not introduce an `IES:LM-63-2025` header. The second number on the ballast/power line is the **file generation type**, for example `1.10100`. `profile.fileGenerationType` preserves this numeric provenance value, while the compatibility field `ballastLampPhotometricFactor` continues to expose the raw number. It never scales 2019 candela. Values in the reserved position of 1995/2002 files are also ignored for intensity; a non-unity value produces a validation warning.

The older ballast-lamp photometric factor scales intensity only in 1986/1991 files. Candela and ballast multipliers still apply once. Embedded TILT factors remain separate from the stored table and are interpolated when sampling or computing metrics at a specified lamp tilt.

Sources: the [ANSI overview of the 2019 changes](https://blog.ansi.org/ansi/standard-file-photometric-data-ies-lm-63-19/) explains the provenance field and removal of external tilt references; the [IES standard listing](https://store.ies.org/product/approved-method-ies-standard-file-format-for-the-electronic-transfer-of-photometric-data-and-related-information/) identifies the reaffirmed edition. [Lighting Analysts' original workshop](https://www.agi32.com/Downloads/TechnicalDocs/Thinking%20Photometrically%20II.pdf) describes removal of the ballast-lamp factor in 1995.

## Structured validation

```ts
import { validateIES, diagnoseIES } from '@ies-tools/core';
const result = validateIES(iesText, { strict: true });
for (const diagnostic of result.diagnostics) {
  console.log(diagnostic.code, diagnostic.severity, diagnostic.field, diagnostic.message);
}
// result.profile is null only when parsing failed; warnings preserve the usable profile.
const existingProfileDiagnostics = diagnoseIES(profile);
```

Diagnostics carry stable `code`, `severity` (`error`, `warning`, `info`), human-readable `message` and optional `field`. Invalid numeric tokens, counts, ranges, angle ordering, scaled overflow and malformed tables are hard parse errors. Metadata omissions remain warnings so existing files stay readable: `[TEST]`, `[TESTLAB]`, `[ISSUEDATE]` and `[MANUFAC]` are checked for 2002/2019 files. Earlier versions do not inherit these requirements. [Lighting Analysts' manufacturer guidelines](https://www.agi32.com/Downloads/Photometry/Manufacturers%20Guidelines%2010-29-14.pdf) distinguish required 2002 keywords from earlier recommendations.

`strict: true` makes warnings fail validation while retaining their original severity. Informational unsupported-coordinate notices do not invalidate otherwise readable Type A/B files. Additional warnings identify partial vertical coverage, mismatched 360° endpoint rows, non-unity reserved fields and malformed generation-code encodings. This is a supported subset of LM-63 checks, not a complete standards certification or assessment of laboratory accreditation.

`parseIES` keeps its throwing behavior. `IESParseError` now includes the same `code` and optional `field` used by validation results.

## Flux, efficacy and angular widths

```ts
import { calculateLuminousFlux, computePhotometricMetrics, getBeamAngles } from '@ies-tools/core';
const lumens = calculateLuminousFlux(profile); // default lamp tilt 0°
const tiltedLumens = calculateLuminousFlux(profile, 30);
const metrics = computePhotometricMetrics(profile);
const c0cut = getBeamAngles(profile, 0);
```

Flux integrates `I(theta, phi) * sin(theta) dtheta dphi` in radians. The implementation integrates the same piecewise bilinear angular interpolant as the intensity sampler, using exact polar integrals and actual azimuth interval widths. Irregular grids are supported. Axial, quadrant and bilateral measurements expand their measured symmetry; full azimuth data close the omitted seam when necessary. Duplicate 0°/360° rows are interval endpoints and do not add an extra bin. Unmeasured vertical angles are dark. No nominal lamp flux, light-output ratio or already-applied multiplier rescales this result.

The returned `integratedFluxLumens` is an angular-table estimate of luminaire output, not a substitute for a laboratory flux measurement. `declaredLampFluxLumens` is lamp count times the per-lamp rating, or null for the `-1` absolute-photometry sentinel. Those values describe different quantities and can differ. `luminousEfficacyLumensPerWatt` divides integrated output by declared input watts and is null for zero input power. `metricsTiltDegrees` records the applied embedded lamp-tilt correction.

`calculateLuminousFlux` accepts the `PhotometricGrid` structural subset: photometric type, horizontal and vertical angles, absolute horizontal-major candela, and optional embedded tilt. This lets format converters reuse the integration without fabricating IES metadata. Input grids should already satisfy the parser's numeric and angular constraints.

Beam estimates use complete opposed-plane cuts C0–C180 and C90–C270 by default. Each cut reports the dominant measured peak direction, peak candela, and full angular widths between interpolated 50%-peak (**beam**) and 10%-peak (**field**) crossings. A custom cut is available through `getBeamAngles(profile, horizontalDegrees)`. `beamLeftDegrees`/`beamRightDegrees` and `fieldLeftDegrees`/`fieldRightDegrees` give each crossing as a signed vertical angle (negative = the opposite C-plane, C+180°), and are present whenever both crossings bracket the peak. Off-axis peaks retain their measured signed vertical direction; cuts are not automatically rotated to a nominal optical axis. The [IES beam-angle](https://ies.org/definitions/beam-angle/) and [field-angle definitions](https://ies.org/definitions/field-angle/) describe the threshold convention.

Widths are null with `no-light`, `no-crossing`, or `multiple-lobes` status when the data cannot support a single bounded estimate. Missing hemispheres never invent zero-intensity threshold crossings. These principal-plane estimates are not certified manufacturer beam angles, global maximum/minimum beam widths, or a general optical-axis finder. Type A/B summaries return `metricsSupported: false`, null integrated metrics, an empty beam array and an explicit reason; low-level Type C metric functions reject those types.

## Flux breakdown, LOR, DFF and CIE flux code

```ts
import { calculateFluxBreakdown } from '@ies-tools/core';
const { total, downward, upward, cumulative } = calculateFluxBreakdown(profile, tiltDegrees);
// cumulative[g]: flux from γ = 0 to γ = g degrees, g = 0…180
```

`calculateFluxBreakdown` runs the same exact integration as `calculateLuminousFlux` (whose result is its `total`), splitting measured intervals at whole degrees so one pass also yields downward (γ = 0…90°), upward (γ = 90…180°) and 1° cumulative zonal flux. `computePhotometricMetrics` and the inspection models derive these additional fields from it; each is null for Type A/B data or an unselected LDT configuration:

- `downwardFluxLumens`, `upwardFluxLumens`.
- `peakIntensityCandela` and `peakDirection` (`horizontalDegrees`, `verticalDegrees`): the largest tabulated intensity after lamp tilt and its first measured direction. The summary's existing `peakCandela` remains the raw table maximum.
- `nadirCandela`: intensity at γ = 0.
- `lightOutputRatio`, `downwardLightOutputRatio`, `upwardLightOutputRatio`: luminaire flux divided by declared lamp flux. Null for absolute photometry (`lumensPerLamp = -1`), which has no lamp rating.
- `downwardFluxFraction` (DFF): downward ÷ total flux; null when no light is emitted.
- `cieFluxCode`: `[N1, N2, N3, N4, N5]` rounded percentages. N1–N3 are the flux within γ = 41.4°, 60° and 75.5° (interpolated in the 1° cumulative array) as a percentage of downward flux; N4 and N5 are downward and total flux as a percentage of lamp flux and are null without a lamp rating.
- `zonalLumens`: `{ fromDegrees, toDegrees, lumens, percentOfLamp, percentOfLuminaire }` for 0–30°, 0–40°, 0–60°, 0–90°, 90–120°, 90–130°, 90–150°, 90–180° and 0–180°.

All of these are angular-table estimates with the same assumptions as `integratedFluxLumens`.

## Shared inspection and validation

```ts
import { inspectPhotometry, validatePhotometry, inspectParsedPhotometry } from '@ies-tools/core';
const validation = validatePhotometry(source, 'ies', false);
const inspection = validation.profile ? inspectParsedPhotometry(validation.profile) : null;
const direct = inspectPhotometry(source, 'ldt', 0); // zero-based alternative lamp configuration
```

The CLI and VS Code panel consume these same browser-safe models. `validatePhotometry` accepts a strict flag, returns diagnostic codes/severity/fields, and keeps structural parse errors separate from metadata warnings. `inspectParsedPhotometry` avoids reparsing a validated profile. Native LDT alternatives remain unselected unless the caller supplies an index; intensity/flux are unavailable until then. Inspection and validation are independent of Three.js rendering capabilities.

See the [@ies-tools/core API reference](./api/core/index.md) for every export, generated from the source's TSDoc comments.
