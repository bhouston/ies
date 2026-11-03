---
sidebar_position: 3
sidebar_label: Guide
title: Command line
---

# Command line

The `ies` command inspects, validates and converts IES and EULUMDAT files, opens a local preview, and exports charts and renders. Files stay on your computer.

This page covers common tasks. The [CLI reference](./cli-reference/ies.md) lists every command and flag.

## Install

The CLI needs Node.js. Install it globally with npm:

```sh
npm install -g @ies-tools/cli
ies --help
```

Every command takes an `.ies` or `.ldt` file. The format is detected from the extension and content; add `--format ies` or `--format ldt` to override it.

## Inspect a file

```sh
ies inspect luminaire.ies
```

`inspect` prints the file's format and version, photometric type, manufacturer, luminaire and lamp descriptions, dimensions and angle counts. It then lists photometric statistics:

- declared lamp flux, and the luminaire flux calculated from the intensity table;
- efficacy, peak and nadir intensity, and beam and field angles;
- downward and upward flux, light output ratios, downward flux fraction and the CIE flux code;
- a zonal-lumens table.

Missing descriptions are shown as `not specified`. Add `--json` for machine-readable output:

```sh
ies inspect luminaire.ies --json > luminaire-info.json
```

## Validate a file

```sh
ies validate luminaire.ies
```

`validate` checks the numbers, counts, angles and metadata. It lists each error and warning with a stable code and exits with status 1 when the file is invalid, so it works in scripts and CI.

| Option     | What it does                                                    |
| ---------- | --------------------------------------------------------------- |
| `--strict` | Treat warnings, such as missing required metadata, as failures. |
| `--json`   | Print the diagnostics and the summary as JSON.                  |

```sh
ies validate luminaire.ies --strict --json
```

To check a folder of files in a shell:

```sh
for f in lights/*.ies; do ies validate "$f" --strict || echo "FAILED: $f"; done
```

## Convert a file

```sh
ies convert luminaire.ldt --to ies -o luminaire.ies
ies convert luminaire.ies --to ldt -o luminaire.ldt
ies convert luminaire.ies -o luminaire.json
```

`--to` is `json` (the default), `ies` or `ldt`. Without `-o`, the result is written to standard output. Conversion warnings, such as fields the target format can't hold, go to standard error.

`convert` never overwrites an existing file. Delete the old output first, or choose a new name. See [Conversion](./conversion.md) for what each format keeps.

## Choose a lamp configuration

Some LDT files hold several alternative lamp configurations. `inspect` lists them all. To get statistics, a render or an IES file, choose one with `--lamp-set`. The CLI counts configurations from **1**:

```sh
ies inspect luminaire.ldt --lamp-set 2
ies convert luminaire.ldt --lamp-set 2 --to ies -o luminaire.ies
```

## Preview in a browser

```sh
ies view luminaire.ies --open
```

`view` starts a local preview server on `127.0.0.1`, prints its URL and, with `--open`, opens your browser. It uses a free port unless you set one with `--port 8080`. Press Ctrl+C to stop it.

The preview has the same 3D view, settings and chart tabs as [`<light-viewer>`](./light-viewer.mdx). It needs a browser with hardware WebGL2.

## Render an image

```sh
ies render luminaire.ies -o preview.png --width 1600 --height 1000 --exposure 1.5
```

`render` saves a PNG of the light on the floor and wall. It uses Chrome, Edge or a Playwright Chromium already installed on your computer, and doesn't download a browser. To pick one, set `--browser` or the `IES_BROWSER` environment variable to its executable.

`render` only runs on a hardware GPU: software renderers such as SwiftShader are rejected so the image is accurate. Add `--json` to see which GPU was used.

## Export charts

```sh
ies chart luminaire.ies -o polar.svg
```

`chart` saves a chart as SVG or PNG, picked by the output file's extension. It doesn't need a GPU. Choose the chart with `--type`:

| `--type`          | Chart                                              | Useful options                                                                                  |
| ----------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `polar` (default) | Polar intensity curves with beam and field markers | `--log-scale`, `--axis`, `--angle`                                                              |
| `cartesian`       | The same curves on angle and candela axes          | `--log-scale`, `--axis`, `--angle`                                                              |
| `topology`        | 3D intensity surface                               | `--up-axis x\|y\|z`                                                                             |
| `isolux`          | Illuminance on the ground, with lux contours       | `--mounting-height`, `--extent`, `--resolution`, `--contours`, `--min-contour`, `--color-scale` |
| `cone`            | Centre illuminance and beam and field diameters    | `--max-distance`                                                                                |
| `luminance`       | Average luminance at glare angles                  |                                                                                                 |
| `intensity-table` | The measured candela table                         | `--unit cd\|cd/klm`, `--max-columns`, `--max-rows`                                              |

Set the image size with `--width` and `--height` (900×700 by default). See [Charts](./graphs.md) for how to read each one.

### Intensity curves

By default, polar and Cartesian charts show the two main planes, C0–C180 and C90–C270. Pick one plane with `--angle`, or sweep around the light at a fixed vertical angle with `--axis horizontal`:

```sh
ies chart luminaire.ies -o c45.svg --type cartesian --angle 45
ies chart luminaire.ies -o around.svg --axis horizontal --angle 60
```

Add `--log-scale` to spread the curve over three decades below the peak, which shows faint spill around a narrow beam:

```sh
ies chart spot.ies -o polar-log.png --log-scale
```

### Isolux plots

```sh
ies chart luminaire.ies -o floor.png --type isolux --mounting-height 6 --extent 30 --resolution 121
```

`--mounting-height` and `--extent` are in metres; the plot is a square `--extent` wide, centred under the light. Contours follow a 1, 2, 5, 10, 20, 50 lux series starting at `--min-contour` (1 lx by default). Set your own levels with `--contours`:

```sh
ies chart luminaire.ies -o floor.svg --type isolux --contours 5,10,20,50
ies chart luminaire.ies -o floor.svg --type isolux --min-contour 0.5
```

`--color-scale log` (the default) keeps low spill visible; `linear` scales colour with lux.

### Cone, luminance and intensity tables

```sh
ies chart luminaire.ies -o cone.svg --type cone --max-distance 8
ies chart luminaire.ies -o glare.png --type luminance
ies chart luminaire.ies -o table.png --type intensity-table --unit cd/klm --max-columns 12 --max-rows 19
```

`--max-columns` and `--max-rows` keep evenly spaced angles so a large table fits a fixed-size image. With `--json`, these three chart types also print their values.

## Overwriting and errors

`render` and `chart` never overwrite an existing file either. If an export fails, it removes its incomplete output. Image sizes go up to 8192 pixels per side.

## Reference

The [CLI reference](./cli-reference/ies.md) documents every command:
[`inspect`](./cli-reference/ies-inspect.md), [`validate`](./cli-reference/ies-validate.md), [`convert`](./cli-reference/ies-convert.md), [`view`](./cli-reference/ies-view.md), [`render`](./cli-reference/ies-render.md) and [`chart`](./cli-reference/ies-chart.md).
