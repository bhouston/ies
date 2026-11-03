# ies-core

Dependency-free TypeScript IES LM-63 parser and Type C photometry sampler for browsers and Node.

```ts
import { parseIES, sampleIntensity, summarizeIES } from 'ies-core';
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

`validateIES(text, { strict: false })` returns `{ valid, profile, diagnostics }`. Numeric parse failures have stable error codes and a null profile. Required 2002/2019 metadata omissions produce warnings; strict mode makes warnings fail validation without changing their severity. `parseIES` retains its throwing API, with `code` and optional `field` on `IESParseError`.

`calculateLuminousFlux(profile, tiltDegrees = 0)` integrates the Type C angular table in lumens. It accepts the structural `PhotometricGrid` subset, handles irregular intervals, mirrors reduced symmetry and closes the azimuth seam once. `computePhotometricMetrics` and `summarizeIES` distinguish declared lamp flux from integrated luminaire output and efficacy. Principal-plane beam/field estimates use 50%/10% thresholds with explicit null/status values for missing crossings or multiple lobes. See the core documentation for assumptions and limitations.
