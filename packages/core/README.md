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
