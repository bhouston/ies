---
sidebar_position: 8
title: Conversion
---

# Converting between IES, LDT and JSON

ies-tools converts IES (LM-63) files to EULUMDAT (`.ldt`) and back, and turns either one into JSON. IES output uses LM-63-2002. JSON output is the parsed file, with every native field.

## How to convert

### In VS Code

Right-click one or more `.ies` or `.ldt` files in the Explorer and choose **Convert Photometric File**, then a target format. Right-click a folder and choose **Convert Folder…** to convert everything in it. See [Convert files](./vscode.md#convert-files).

### On the command line

```sh
ies convert luminaire.ldt --to ies -o luminaire.ies
ies convert luminaire.ies --to ldt -o luminaire.ldt
ies convert luminaire.ies -o luminaire.json
```

Warnings go to standard error. Existing files are never overwritten. See [Convert a file](./cli.md#convert-a-file).

### In code

```ts
import { parsePhotometry, sampleIntensity, serializeIES, serializeLDT, parseLDT, writeLDT } from '@ies-tools/core';

const document = parsePhotometry(text); // IES or LDT, detected from the content
console.log(sampleIntensity(document.profile, 30, 90)); // candela at γ = 30°, C = 90°

const ies = serializeIES(document); // { value, warnings }
const ldt = serializeLDT(document);
for (const warning of ldt.warnings) {
  console.warn(warning.category, warning.code, warning.message);
}

// Edit an LDT file's own fields and write it back without converting.
const native = parseLDT(ldtText);
native.luminaireName = 'Updated description';
const updated = writeLDT(native);
```

`parsePhotometry` returns a `PhotometricDocument`:

- `profile` is the light distribution in absolute candela. Pass it to `sampleIntensity`, the charts and the viewer.
- `geometry` gives the luminaire body and its luminous opening separately, in metres.
- `source` keeps every field of the original file.

Pass `'ies'` or `'ldt'` as the second argument to skip format detection.

## What's preserved and what isn't

Conversion is not always lossless, because IES and LDT don't hold exactly the same information. Each converter returns a warning for every change, so nothing is dropped silently.

| What                                         | IES → LDT                                                                 | LDT → IES                                            |
| -------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- |
| Intensity distribution (Type C)              | Kept, in absolute candela                                                 | Kept, in absolute candela                            |
| Symmetry and irregular angle grids           | Kept                                                                      | Kept                                                 |
| Lamp `TILT` curve                            | Replaced by a fixed tilt angle (0° unless you choose one), with a warning | Not applicable                                       |
| Several lamp configurations                  | Not applicable                                                            | One configuration is chosen; the others are reported |
| Dimensions and luminous opening              | Kept where LDT can express them; otherwise a warning                      | Kept where IES can express them; otherwise a warning |
| Metadata, colour data and format-only fields | Fields LDT can't hold are reported                                        | Fields IES can't hold are reported                   |

`parseLDT` and `writeLDT` keep every LDT field and lamp configuration. IES output applies the candela multiplier and ballast factors to the values (writing the factors as 1), and keeps embedded `TILT` data and keywords. Because IES output is LM-63-2002, an LM-63-2019 file-generation code is reported as dropped.

Type A and B files can be inspected, but converting them to the other format is refused.

## Lamp configurations

An EULUMDAT file can hold several **alternative** lamp configurations, for example the same luminaire with different lamps. They are not added together. Converting to IES, rendering and statistics need one configuration:

| Where    | How to choose                                    | Numbering  |
| -------- | ------------------------------------------------ | ---------- |
| VS Code  | Pick from the list when converting or previewing |            |
| CLI      | `--lamp-set 2`                                   | from **1** |
| Core API | `{ lampSetIndex: 1 }`                            | from **0** |

```ts
const selected = parsePhotometry(text, 'ldt', { lampSetIndex: 0 });
const result = serializeIES(parseLDT(text), { lampSetIndex: 0 });
```

Every configuration stays in `document.source`, and converting LDT to LDT or JSON keeps them all without a choice.

## Things to know when converting in code

**Read the warnings.** Each warning has a `code`, a `category` (`metadata`, `geometry` or `photometry`) and a `message`. Show or log them so users know what changed.

**Supplying flux for LDT output.** LDT stores intensities per 1000 lamp lumens. IES → LDT uses the declared lamp flux, or the integrated luminaire flux for absolute photometry. A file with light but zero declared flux throws unless you pass a positive `luminousFlux` option to `serializeLDT`. A file with no light at all writes zeros.

**Lamp tilt.** IES → LDT applies one fixed lamp tilt. Pass `tiltDegrees` to choose it; the default is 0°.

**Missing downward hemisphere.** If an IES file starts measuring above 0°, the area below stays dark. LDT output adds a zero value just below the first measured angle and reports it.

**No automatic rotation.** Angles keep the source file's convention; nothing is rotated by 90°.

**Editing metadata.** To change LDT fields, edit the result of `parseLDT` and call `writeLDT`. Editing `document.profile` and converting it back to LDT resets LDT-only fields, and reports which ones.

**Unknown flux.** For absolute Type A or B data, integrated flux can't be calculated and is `null`, not zero.

## Validation

`parseLDT` checks numbers, counts, table sizes, angle order, symmetry layouts and lamp configurations. Problems throw an `LDTParseError` with `code: 'LDT_PARSE_ERROR'` and a source location. Real-world files whose measurements start above 0° are accepted. C-planes must start at 0° and must not repeat 360°.

LDT support follows [DIAL's EULUMDAT format description](https://evo.support-en.dial.de/support/solutions/articles/9000074164-description-of-the-eulumdat-format) and the [DIAL/Lighting Analysts absolute-photometry interpretation](https://www.agi32.com/Downloads/PressReleases/EULUMDAT_Absolute_Photometry.pdf).
