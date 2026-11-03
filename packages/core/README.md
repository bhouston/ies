# @ies-tools/core

Dependency-free TypeScript IES LM-63 parser and Type C photometry sampler for browsers and Node.

```ts
import { parseIES, sampleIntensity, summarizeIES } from '@ies-tools/core';
const profile = parseIES(await (await fetch('/luminaire.ies')).text());
console.log(summarizeIES(profile));
console.log(sampleIntensity(profile, 30, 90)); // candela at vertical 30°, horizontal 90°
```

`parseIES` accepts legacy 1986 files, IESNA91, LM-63-1995 and LM-63-2002. It validates finite numeric data, counts, angles and table size, preserves metadata and absolute candela values, and rejects external TILT files. Embedded `TILT=INCLUDE` data is preserved; pass the optional fourth `sampleIntensity` argument to apply a luminaire tilt correction. The default luminaire tilt is 0°.

`IESProfile.candelaValues` is horizontal-major. The candela multiplier and ballast factor are applied during parsing; the ballast-lamp factor is applied only for pre-2002 formats, where that field was not reserved. Values are never normalized to a peak of one. Dimensions preserve the file's units and signed LM-63 shape encodings.

`sampleIntensity` uses bilinear interpolation. Vertical 0° points down, 180° points up. Horizontal angles wrap at 360°. Axial, quadrant, bilateral and full Type C data are supported, including a missing duplicate 360° plane. Missing vertical ranges produce zero light. Type A/B data may be inspected but sampling and viewers reject them explicitly. Tilt factors interpolate linearly and clamp to the measured tilt range. This library does not infer lamp geometry or apply arbitrary fixture aiming transformations.

Format references: [Autodesk's LM-63 overview](https://help.autodesk.com/cloudhelp/2016/ENU/3DSMax/files/GUID-EA0E3DE0-275C-42F7-83EC-429A37B2D501.htm) and [AGi32 tilt correction documentation](https://docs.agi32.com/AGi32/Content/references/Tilt_correction_factors.htm). The authoritative specification is ANSI/IES LM-63.

`summarizeIES(profile)` returns format and version, numeric `photometricType` plus the `photometricTypeName` (`A`, `B`, or `C`), `photometry` (`absolute` or `relative`), declared `lightSource` (`LAMP`, falling back to `LAMPCAT`), `lampCatalog`, `manufacturer`, `luminaire`, lamp and power statistics, dimensions, angle counts, peak candela and tilt presence. Missing source descriptions are `not specified`; no lamp technology is inferred.

Modern files use the exact `IES:LM-63-2019` header. Its `fileGenerationType` is provenance, never a brightness factor. The raw second numeric field remains available as `ballastLampPhotometricFactor` for compatibility; it scales intensity only in 1986/1991 files, and is reserved in 1995/2002.

`validateIES(text, { strict: false })` returns `{ valid, profile, diagnostics }`. Numeric parse failures have stable error codes and a null profile. Required 2002/2019 metadata omissions produce warnings; strict mode makes warnings fail validation without changing their severity. `parseIES` retains its throwing API, with `code`, optional `field` and optional source `range` on `IESParseError`. Diagnostics parsed from text carry `range: { line, start, end }` (0-based line, UTF-16 columns, exclusive end). `describePhotometrySource(text, format)` returns the diagnostics plus a described field map of every header field, keyword, angle and intensity for editor tooling, with partial fields for invalid files.

`calculateLuminousFlux(profile, tiltDegrees = 0)` integrates the Type C angular table in lumens. It accepts the structural `PhotometricGrid` subset, handles irregular intervals, mirrors reduced symmetry and closes the azimuth seam once. `calculateFluxBreakdown` returns total, downward, upward and 1° cumulative flux from the same integration. `computePhotometricMetrics` and `summarizeIES` distinguish declared lamp flux from integrated luminaire output and efficacy, and add downward/upward flux, peak and nadir intensity, light output ratios (LOR/DLOR/ULOR), downward flux fraction, CIE flux code and zonal lumens. Principal-plane beam/field estimates use 50%/10% thresholds with explicit null/status values for missing crossings or multiple lobes. See the core documentation for assumptions and limitations.

## EULUMDAT and conversion

```ts
import { parsePhotometry, serializeIES, serializeLDT, parseLDT, writeLDT } from '@ies-tools/core';

const document = parsePhotometry(text); // detects IES or LDT
const candela = sampleIntensity(document.profile, 30, 90); // existing viewer-compatible API
const converted = serializeIES(document); // LM-63-2002
for (const warning of converted.warnings) console.warn(warning.code, warning.message);

const native = parseLDT(ldtText); // retains original cd/klm, conversion factor and native fields
const sameFormat = writeLDT(native);
const selected = parsePhotometry(multipleLampSetText, 'ldt', { lampSetIndex: 0 });
const exported = serializeLDT(document); // { value: string, warnings: ConversionWarning[] }
```

`PhotometricDocument.profile` contains absolute candela and works with existing `IESProfile` consumers. Its `geometry` is in meters and keeps luminaire-body and luminous-opening geometry distinct. `source` retains native fields, and `lampSets` retains configurations. Absolute Type A/B files remain inspectable, with unknown integrated lamp flux represented by `null`; conversion requires Type C and never silently relabels axes. Multiple LDT lamp sets require an explicit zero-based `lampSetIndex` when normalizing: alternative configurations are never implicitly summed.

Native LDT parsing/writing preserves all five symmetries, including the C270→C0→C90 measured-row order for C90–C270 symmetry, irregular grids, partial upper-hemisphere grids, separate luminous-area heights, lamp metadata, measurement tilt, direct ratios and conversion factors. Structural validation accepts real-world nonzero gamma starts; this is broader than DIAL's zero-start interchange description. C grids must start at zero and exclude a duplicate 360° plane; invalid counts, factors, table sizes and unsupported symmetry layouts produce `LDTParseError` with stable code `LDT_PARSE_ERROR`.

Cross-format serializers return `{ value, warnings }`. Warning categories separate metadata, geometry and photometry changes. IES writing folds candela/ballast scaling into values exactly once and retains embedded TILT and generic keywords. Output is LM-63-2002, so an original 2019 numeric generation code is reported as omitted. Native LDT writing preserves its fields; rebuilding an edited compatible profile reports discarded native derived fields. For native metadata editing, edit `LDTProfile` and call `writeLDT`, then normalize again if needed.

IES→LDT converts absolute candela to cd/klm using declared relative lamp flux or integrated absolute luminaire flux. Zero-light files remain finite; nonzero candela with zero normalization flux requires an explicit positive `luminousFlux` option. `tiltDegrees` bakes a fixed lamp-tilt correction and reports loss of the original curve. Unsupported signed IES shapes, absent luminaire-body geometry and fields without equivalents produce warnings. Simple circular luminous openings preserve their diameter encoding.

A missing downward hemisphere remains dark. When IES starts above zero, LDT export inserts a zero knot 0.000001° before the first measured angle and reports that narrow boundary approximation; exact interchange at that discontinuity is impossible while requiring a zero-start gamma grid. No automatic 90° azimuth rotation is applied.

This implementation follows [DIAL's EULUMDAT description](https://evo.support-en.dial.de/support/solutions/articles/9000074164-description-of-the-eulumdat-format) and the [DIAL/Lighting Analysts absolute-photometry interpretation](https://www.agi32.com/Downloads/PressReleases/EULUMDAT_Absolute_Photometry.pdf). No AGPL implementation code was copied or ported.

`inspectPhotometry(text, format, lampSetIndex?)` and `validatePhotometry(text, format, strict?, lampSetIndex?)` expose the same IES/LDT models used by the CLI and VS Code extension. `inspectParsedPhotometry(profile, lampSetIndex?)` accepts a validated native profile, avoiding a second parse in live integrations. Inspection preserves all metadata and alternative lamp configurations. Validation returns codes, severity and fields without requiring a renderer.
