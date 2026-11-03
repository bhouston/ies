---
sidebar_position: 7
---

# EULUMDAT and IES conversion

`ies-core` reads EULUMDAT/LDT and IES into a common document while retaining the original fields. These APIs are available in Node and browsers:

```ts
import { parsePhotometry, sampleIntensity, serializeIES, serializeLDT, parseLDT, writeLDT } from 'ies-core';

const document = parsePhotometry(text); // optional second argument: 'ies' or 'ldt'
console.log(sampleIntensity(document.profile, 30, 90)); // absolute candela
const ies = serializeIES(document); // { value, warnings }, LM-63-2002
const ldt = serializeLDT(document);
for (const warning of ldt.warnings) {
  console.warn(warning.category, warning.code, warning.message);
}

// Native field editing preserves all LDT fields without a cross-format projection.
const native = parseLDT(ldtText);
native.luminaireName = 'Updated description';
const updated = writeLDT(native);
```

`PhotometricDocument.profile` is compatible with `IESProfile`, the viewer and `sampleIntensity`. `geometry` uses meters and separates the luminaire body from its luminous opening. `source` preserves native fields; the compatible profile is a projection for processing and viewing. LDT's native model uses millimeters and cd/klm; normalization applies its conversion factor once. `detectPhotometricFormat`, `toPhotometricDocument`, and `toIESProfile` support callers that already have parsed data. `toIESProfile` also returns conversion warnings.

## Lamp configurations and unknown values

LDT can hold multiple lamp configurations. Normalization requires an explicit selection, without summing them:

```ts
const selected = parsePhotometry(text, 'ldt', { lampSetIndex: 0 });
const result = serializeIES(parseLDT(text), { lampSetIndex: 0 });
```

All native configurations remain in `source`. Export to IES reports the omitted alternatives. `parseLDT`, `writeLDT` and unchanged same-format `serializeLDT` preserve every native set without needing a selection. Absolute LDT uses one negative-count set; relative sets have positive counts. Unknown integrated flux for unsupported absolute Type A/B data is `null`, not zero. Such files can be inspected but cross-format conversion rejects the unsupported coordinate transformation.

## Conversion guarantees and limits

| Behavior                            | Result                                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native LDT round trip               | Preserves native fields, lamp sets, direct ratios, measurement tilt and cd/klm values.                                                                                         |
| Type C intensity distribution       | Maintains absolute candela using explicit units, symmetry and exactly-once multiplier handling.                                                                                |
| All five LDT symmetries             | Supports axial, C0–C180, C90–C270, quadrant and asymmetric data. The C90–C270 measured rows wrap C270→C0→C90.                                                                  |
| Irregular angular grids             | Preserves measured knots and inserts reflected knots when reconstructing symmetry.                                                                                             |
| IES multiplier/ballast factors      | Folded into exported IES values; the new factors are one.                                                                                                                      |
| IES TILT→IES                        | Retains the embedded correction curve.                                                                                                                                         |
| IES TILT→LDT                        | Bakes a fixed `tiltDegrees` (default zero), with a photometry warning that the curve is omitted.                                                                               |
| Missing IES downward hemisphere→LDT | Stays dark; inserts a zero knot 0.000001° below the first measured angle and reports the resulting narrow boundary approximation.                                              |
| Geometry                            | Preserves separate native fields in the source; reports projection of per-plane heights and unsupported signed shape encodings. Simple circles retain their diameter encoding. |
| LDT→IES metadata                    | Reports omitted native derived fields, alternative lamp configurations, color metadata and geometry distinctions.                                                              |
| LM-63-2019→2002                     | Reports both the version change and loss of numeric file-generation provenance.                                                                                                |

Warnings have `{ code, category, message }`; categories are `metadata`, `geometry` and `photometry`. Conversion is not described as universally lossless. Native source data remains available even when the target format cannot express it. Changing a compatible profile and rebuilding LDT reports native fields that are defaulted; edit `LDTProfile` directly for native metadata edits.

`serializeLDT` accepts `luminousFlux` to supply normalization flux when required. A zero-light file writes finite zero values. Nonzero candela with zero declared normalization flux throws unless a positive flux is supplied. No automatic 90° azimuth rotation is applied: angles retain the source convention.

## Validation

`parseLDT` and `validateLDT` check finite numbers, counts, table bounds, angle ordering, spacing, symmetry layouts, lamp-set conventions and native fields. Failures use `LDTParseError` with `code: 'LDT_PARSE_ERROR'`. The native parser preserves real-world partial upper-hemisphere data even when gamma does not start at zero; structural acceptance is broader than strict format conformance. C grids start at zero and exclude a duplicate 360° plane. Incomplete files and unsupported symmetry encodings are rejected explicitly.

The implementation is independent and follows [DIAL's published format description](https://evo.support-en.dial.de/support/solutions/articles/9000074164-description-of-the-eulumdat-format) and the [DIAL/Lighting Analysts absolute-photometry interpretation](https://www.agi32.com/Downloads/PressReleases/EULUMDAT_Absolute_Photometry.pdf). Original synthetic tests cover these semantics; no AGPL implementation code was copied.
