<p align="center">
  <a href="https://ies-tools.ben3d.ca" target="_blank" rel="noopener noreferrer">
    <img alt="@ies-tools/cli logo" src="https://raw.githubusercontent.com/bhouston/ies-tools/main/packages/docs/static/img/icon.png" height="96">
  </a>
</p>
<br/>
<p align="center">
  <a href="https://npmjs.com/package/@ies-tools/cli"><img src="https://img.shields.io/npm/v/@ies-tools/cli.svg" alt="npm package"></a>
  <a href="https://www.npmtrends.com/@ies-tools/cli"><img src="https://img.shields.io/npm/dw/@ies-tools/cli.svg" alt="npm downloads"></a>
  <a href="https://ies-tools.ben3d.ca/coverage/"><img src="https://ies-tools.ben3d.ca/coverage/packages/cli.svg" alt="coverage"></a>
  <a href="https://discord.gg/fwupDN493R"><img src="https://img.shields.io/badge/chat-discord-blue?style=flat&logo=discord" alt="discord chat"></a>
  <a href="https://ies-tools.ben3d.ca"><img src="https://img.shields.io/badge/docs-read-blue?style=flat" alt="documentation"></a>
</p>
<br/>

# @ies-tools/cli

> Inspect, validate, convert and chart IES and EULUMDAT files.

- 🔍 Inspect Photometric Metrics
- ✅ Validate Files in CI
- 🔄 Convert IES, LDT, and JSON
- 📊 Export SVG and PNG Charts
- 💡 Local 3D Preview Server
- 🔒 Files Stay Local

Inspect, validate and convert IES/EULUMDAT photometry, export charts, and preview measured light from your terminal. Requires Node.js 22+.

[Read the Docs to Learn More](https://ies-tools.ben3d.ca/docs/cli).

Try the [sample-file quick start](https://ies-tools.ben3d.ca/docs/quick-start#inspect-and-chart-a-file), or follow the [CI validation guide](https://ies-tools.ben3d.ca/docs/automation).

```sh
npm install -g @ies-tools/cli
ies validate luminaire.ies
ies inspect luminaire.ies --json
ies convert luminaire.ies -o luminaire.json
ies view luminaire.ies --open
```

`validate` returns a nonzero exit status for malformed input. `inspect` shows the file format and LM-63 version, Type A/B/C photometry, absolute or relative photometry, declared light source, manufacturer, luminaire, lamp count and lumens, dimensions and units, angle counts, power, peak candela, and tilt correction. Add `--json` for structured output. Missing light-source metadata is reported as `not specified`; the CLI does not infer lamp technology. Absolute-photometry files use the LM-63 sentinel `lumensPerLamp: -1` in JSON and explain that sentinel in text output. `convert` defaults to native JSON, including parsed IES candela/tilt data or the native LDT cd/klm table and source geometry. Output files are created exclusively: an existing file is never silently overwritten. Omit `-o` to write JSON to stdout.

`view` bundles the shared `<light-viewer>` locally, serves the chosen file from `127.0.0.1` on a free port and prints the URL. Set `--port 8080` for a fixed port. `--open` launches the system browser. Press Ctrl+C to stop. The local server does not upload files or load scripts from a CDN. Preview requires hardware WebGL2 and Type C photometry.

Run `ies --help` for all commands. Files are processed locally, with no account or upload required.

Use `ies validate file.ies --strict --json` to fail on validation warnings. Structured JSON diagnostics include stable codes and severity for parse errors and metadata omissions. `ies inspect` reports declared lamp ratings separately from angularly integrated luminaire flux, efficacy and principal-plane beam/field estimates, followed by downward/upward flux, DFF, LOR (DLOR/ULOR), the CIE flux code, tilt-applied peak and nadir intensity, and a zonal-lumens table. `--json` includes the same fields. Type A/B metrics are explicitly unavailable. LM-63-2019 generation codes are preserved as provenance and never change intensity.

All file commands also accept `.ldt` EULUMDAT files. `--format ies|ldt` overrides extension/content detection. `--lamp-set N` uses one-based numbering to choose an alternative LDT lamp configuration; `inspect` lists every configuration and leaves normalized metrics unavailable until a choice is made. Absolute LDT source flux is reported separately from integrated output. Validation and native JSON/LDT round trips preserve all alternatives without selection.

Use `ies convert file.ldt --to ies -o file.ies` or `ies convert file.ies --to ldt -o file.ldt` for text conversion. Conversion-loss warnings go to stderr and payloads alone go to stdout. `--to json` retains the native source model and remains the default. Rendering and LDT-to-IES conversion require explicit selection when alternatives exist. LDT validation emits structured parse errors and optional strict usability warnings for empty identification/descriptions. Local previews serve original `.ies` or `.ldt` text at the correct route. The statistics command remains `ies inspect`.

## Export images

```sh
ies render luminaire.ies -o preview.png --width 1024 --height 768 --json
ies chart luminaire.ies -o polar.svg
ies chart luminaire.ies -o topology.png --type topology --up-axis z
ies chart luminaire.ies -o floor.png --type isolux --mounting-height 2 --extent 10 --resolution 61
ies chart luminaire.ies -o cone.svg --type cone --max-distance 6 --json
ies chart luminaire.ies -o glare.png --type luminance
ies chart luminaire.ies -o table.png --type intensity-table --unit cd/klm --max-columns 12 --max-rows 19
```

`render` captures the shared `<light-viewer>` with its black background, ground and wall. It uses an installed Chrome, Edge or cached Playwright Chromium; installation does not download a browser. Set `IES_BROWSER` or `--browser` to an explicit executable. The renderer is queried from the actual WebGL2 canvas and must identify a hardware GPU: SwiftShader, llvmpipe, lavapipe, other software rasterizers and masked/unknown adapters are rejected. Rendering waits for GPU completion before capturing PNG. `--json` includes the confirmed GPU vendor, renderer and WebGL version. This is a still-image export, not a rendering benchmark.

Charts of an asymmetric BEGA luminaire, exported with `ies chart --type <type> --width 780 --height 840` (cone 780×900, intensity table 780×640); the last one is a narrow-beam track light with `--log-scale`:

<p>
<img src="https://raw.githubusercontent.com/bhouston/ies-tools/main/packages/docs/static/img/charts/polar.png" alt="Polar luminous intensity chart of the C0–C180 and C90–C270 planes with beam and field markers" width="390" />
<img src="https://raw.githubusercontent.com/bhouston/ies-tools/main/packages/docs/static/img/charts/cartesian.png" alt="Cartesian luminous intensity chart of the C0–C180 and C90–C270 planes with beam and field markers" width="390" />
<img src="https://raw.githubusercontent.com/bhouston/ies-tools/main/packages/docs/static/img/charts/topology.png" alt="3D luminous intensity topology surface" width="390" />
<img src="https://raw.githubusercontent.com/bhouston/ies-tools/main/packages/docs/static/img/charts/isolux.png" alt="Isolux ground illuminance plot with labelled contours at 2 m mounting height" width="390" />
<img src="https://raw.githubusercontent.com/bhouston/ies-tools/main/packages/docs/static/img/charts/cone.png" alt="Cone diagram with centre illuminance and beam and field diameters by distance" width="390" />
<img src="https://raw.githubusercontent.com/bhouston/ies-tools/main/packages/docs/static/img/charts/luminance.png" alt="Glare-angle average luminance and intensity tables" width="390" />
<img src="https://raw.githubusercontent.com/bhouston/ies-tools/main/packages/docs/static/img/charts/intensity-table.png" alt="Heat-tinted luminous intensity table" width="390" />
<img src="https://raw.githubusercontent.com/bhouston/ies-tools/main/packages/docs/static/img/charts/polar-log.png" alt="Log-scale polar intensity chart of a narrow-beam track light" width="390" />
</p>

`chart` reuses the shared React photometric diagrams and exports SVG or PNG. Types are `polar`, `cartesian`, `topology`, `isolux`, `cone`, `luminance` and `intensity-table`. Default vertical polar/Cartesian plots include the principal planes. Use `--axis vertical|horizontal --angle <degrees>` for an explicit slice, or `--up-axis x|y|z` for topology. `--log-scale` plots polar and Cartesian intensity over three decades on a log scale. Polar and Cartesian charts mark the beam (50 %) and field (10 %) crossings of each vertical cut. Isolux accepts mounting height and square ground extent in meters, plus grid resolution. Contours default to a labelled 1-2-5 lux series (1, 2, 5, 10, 20, 50, …) from `--min-contour` (default 1 lx) up to the grid peak, capped at 10 levels by dropping the lowest; `--contours 1,2,5,10` sets explicit levels. `--color-scale log|linear` picks the heatmap mapping (default `log`, so low-light spill stays visible). The stats line reports uniformity U0 = Emin / Eavg. `cone` tabulates centre illuminance and beam/field diameters at 1…`--max-distance` meters (default 5). `luminance` tabulates glare-angle average luminance (γ 45–85°, C 0–315°) over the declared luminous opening. `intensity-table` shows the measured candela grid in `--unit cd|cd/klm`; `--max-columns` and `--max-rows` thin large grids to evenly spaced angles for fixed-size images. With `--json`, these three types add a `values` object with the tabulated data. Chart PNGs use Sharp to rasterize SVG; this 2D operation does not require a GPU.

Image dimensions are positive integers up to 8192 pixels per side. Render defaults to 1024×768; charts default to 900×700. `--timeout` controls browser startup/loading in seconds (default 60, maximum 600). `--format ies|ldt` overrides input format detection. `--lamp-set` selects an LDT lamp configuration using a one-based index. Outputs are created exclusively; existing files are never overwritten, and a failed export removes its own incomplete output.

## Contribution

See [Contributing Guide](https://github.com/bhouston/ies-tools/blob/main/CONTRIBUTING.md).

## License

MIT

## Author

[Ben Houston](https://ben3d.ca), Sponsored by [Land of Assets](https://landofassets.com).
