---
sidebar_position: 5
---

# Core library

```ts
import { parseIES, sampleIntensity, summarizeIES } from 'ies-core';
const profile = parseIES(iesText);
const candela = sampleIntensity(profile, 30, 90);
const summary = summarizeIES(profile);
```

`parseIES` supports LM-63-1986, IESNA91, LM-63-1995 and LM-63-2002. It validates numeric data, dimensions, angle counts, ranges and table size. Metadata is preserved, including continuation lines. External TILT files are rejected with a clear error; embedded TILT data is preserved.

`candelaValues` is horizontal-major and contains absolute intensities with candela and ballast multipliers applied. The pre-2002 ballast-lamp factor is applied only in formats where it is not reserved. Dimensions retain the file's units and signed shape encoding. A negative lumens-per-lamp value of -1 denotes absolute photometry.

`sampleIntensity(profile, verticalDegrees, horizontalDegrees, tiltDegrees = 0)` returns candela with bilinear interpolation. Vertical zero points down; 180 points up. Horizontal angles wrap around 360 degrees. Axial, quadrant, bilateral and full Type C symmetry are supported. Missing vertical coverage is dark. Embedded lamp-tilt factors are interpolated at the fourth argument, clamped to their measured range.

Type A/B files can be parsed and inspected, but intensity sampling and rendering support Type C only and reject other types explicitly. The viewer is a direct-light visualization, not a full architectural lighting simulation.
