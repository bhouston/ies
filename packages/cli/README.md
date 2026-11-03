# ies-cli

```sh
npm install -g ies-cli
ies validate luminaire.ies
ies inspect luminaire.ies --json
ies convert luminaire.ies -o luminaire.json
ies view luminaire.ies --open
```

`validate` returns a nonzero exit status for malformed input. `inspect` shows the file format and LM-63 version, Type A/B/C photometry, absolute or relative photometry, declared light source, manufacturer, luminaire, lamp count and lumens, dimensions and units, angle counts, power, peak candela, and tilt correction. Add `--json` for structured output. Missing light-source metadata is reported as `not specified`; the CLI does not infer lamp technology. Absolute-photometry files use the LM-63 sentinel `lumensPerLamp: -1` in JSON and explain that sentinel in text output. `convert` defaults to native JSON, including parsed IES candela/tilt data or the native LDT cd/klm table and source geometry. Output files are created exclusively: an existing file is never silently overwritten. Omit `-o` to write JSON to stdout.

`view` bundles the shared `<light-viewer>` locally, serves the chosen file from `127.0.0.1` on a free port and prints the URL. Set `--port 8080` for a fixed port. `--open` launches the system browser. Press Ctrl+C to stop. The local server does not upload files or load scripts from a CDN. Preview requires hardware WebGL2 and Type C photometry.

Run `ies --help` for all commands. No MCP, authentication or cloud download services are included.

Use `ies validate file.ies --strict --json` to fail on validation warnings. Structured JSON diagnostics include stable codes and severity for parse errors and metadata omissions. `ies inspect` reports declared lamp ratings separately from angularly integrated luminaire flux, efficacy and principal-plane beam/field estimates. Type A/B metrics are explicitly unavailable. LM-63-2019 generation codes are preserved as provenance and never change intensity.

All file commands also accept `.ldt` EULUMDAT files. `--format ies|ldt` overrides extension/content detection. `--lamp-set N` uses one-based numbering to choose an alternative LDT lamp configuration; `inspect` lists every configuration and leaves normalized metrics unavailable until a choice is made. Absolute LDT source flux is reported separately from integrated output. Validation and native JSON/LDT round trips preserve all alternatives without selection.

Use `ies convert file.ldt --to ies -o file.ies` or `ies convert file.ies --to ldt -o file.ldt` for text conversion. Conversion-loss warnings go to stderr and payloads alone go to stdout. `--to json` retains the native source model and remains the default. Rendering and LDT-to-IES conversion require explicit selection when alternatives exist. LDT validation emits structured parse errors and optional strict usability warnings for empty identification/descriptions. Local previews serve original `.ies` or `.ldt` text at the correct route. The statistics command remains `ies inspect`.
