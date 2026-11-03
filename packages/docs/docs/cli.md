---
sidebar_position: 2
---

# Command line

Install `ies-cli` after its first npm release, or build the workspace and run `node packages/cli/bin/cli.js` in place of `ies`.

```sh
npm install -g ies-cli
ies validate luminaire.ies
ies inspect luminaire.ies --json
ies convert luminaire.ies -o luminaire.json
ies view luminaire.ies --open
```

`validate` reports malformed files with a nonzero exit status. `inspect` shows the IES format and LM-63 version, photometric coordinate type (A/B/C), manufacturer, luminaire and lamp descriptions, absolute or relative photometry, lamp count, lumens per lamp, dimensions and units, angle counts, power, peak candela and embedded tilt availability. Source descriptions are reported from file metadata; absent descriptions are shown as not specified. `--json` emits a machine-readable summary. `convert` exports the parsed profile and its horizontal-major candela table. Omit the output option to write JSON to stdout. Existing output files are never overwritten.

`view` serves the selected file and bundled viewer from a loopback HTTP server and prints its URL. `--open` launches your default browser; `--port 8080` chooses a fixed port. Stop the server with Ctrl+C. The preview uses hardware WebGL2 and Type C photometry. Files are not uploaded, and scripts are served locally.

Run `ies --help` for usage. The command line has no authentication or cloud service dependency.

`ies inspect` additionally reports declared lamp flux, integrated luminaire flux, integrated luminous efficacy, principal-plane beam/field estimates and LM-63-2019 generation provenance. Declared lamp ratings and estimated luminaire output are labeled separately; absent absolute-photometry lamp ratings and unsupported Type A/B calculations are null in JSON. Beam/field estimates have explicit statuses when a crossing is missing or multiple lobes make a single width ambiguous. Estimates use the embedded lamp correction at 0° tilt.

```sh
ies validate luminaire.ies --json
ies validate luminaire.ies --strict --json
```

Validation JSON includes `valid`, the selected file, any available summary and `diagnostics` with stable codes, severity, message and optional field. Even malformed-file parse errors produce a JSON result on stdout with a nonzero exit status. Missing required 2002/2019 metadata emits warnings; `--strict` makes those warnings fail validation without changing their severity. Default validation still accepts usable files with warnings. Text validation prints diagnostics on stderr. Read or command-line errors continue to use the CLI error stream.

`inspect --json` also includes diagnostics. Type A/B files remain inspectable; their integrated flux, efficacy and beam calculations are explicitly unavailable. See the core documentation for the integration and beam-estimation assumptions.

## Export viewer and chart images

```sh
ies render light.ies -o preview.png --width 1024 --height 768 --exposure 1 --json
ies chart light.ies -o polar.svg
ies chart light.ies -o topology.png --type topology --up-axis z
ies chart light.ies -o isolux.png --type isolux --mounting-height 2 --extent 10 --resolution 61
```

`render` captures the shared black-background viewer, ground and wall as PNG. It launches an installed Chrome/Edge or cached Playwright Chromium; it does not download a browser. Set `IES_BROWSER` or `--browser <executable>` to choose one. The actual WebGL2 context must report a recognizable hardware renderer. Software rasterizers, including SwiftShader, llvmpipe and lavapipe, and masked/unknown renderer identities are rejected. GPU work finishes before image capture. JSON output reports the hardware vendor, renderer and WebGL version.

`chart` exports the same React diagrams used by the interactive viewer, with no graph implementation duplicated in the CLI. Output extension chooses SVG or PNG; PNG uses Sharp's 2D SVG rasterizer. Default polar and Cartesian diagrams show the principal planes. `--axis vertical|horizontal --angle <degrees>` chooses an explicit slice. Topology uses `--up-axis x|y|z`; isolux uses `--mounting-height <meters>`, `--extent <meters>` and `--resolution <count>`. Available types are `polar`, `cartesian`, `topology` and `isolux`.

Both commands accept `--width`, `--height`, `--json` and the one-based `--lamp-set` configuration selector. Render defaults to 1024×768; charts default to 900×700. Dimensions must be integers within 1–8192. Render exposure defaults to 1 and is nonnegative. `--timeout` defaults to 60 seconds, up to 600. Output paths must have existing parent directories. Export creates files exclusively, preserves existing files and removes its own partial output after failure. A still-image export does not measure rendering throughput.
