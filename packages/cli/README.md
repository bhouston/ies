# ies-cli

```sh
npm install -g ies-cli
ies validate luminaire.ies
ies inspect luminaire.ies --json
ies convert luminaire.ies -o luminaire.json
ies view luminaire.ies --open
```

`validate` returns a nonzero exit status for malformed input. `inspect` shows the file format and LM-63 version, Type A/B/C photometry, absolute or relative photometry, declared light source, manufacturer, luminaire, lamp count and lumens, dimensions and units, angle counts, power, peak candela, and tilt correction. Add `--json` for structured output. Missing light-source metadata is reported as `not specified`; the CLI does not infer lamp technology. Absolute-photometry files use the LM-63 sentinel `lumensPerLamp: -1` in JSON and explain that sentinel in text output. `convert` exports the parsed `ies-core` profile, including actual candela values and embedded tilt data. Output files are created exclusively: an existing file is never silently overwritten. Omit `-o` to write JSON to stdout.

`view` bundles the shared `<light-viewer>` locally, serves the chosen file from `127.0.0.1` on a free port and prints the URL. Set `--port 8080` for a fixed port. `--open` launches the system browser. Press Ctrl+C to stop. The local server does not upload files or load scripts from a CDN. Preview requires hardware WebGL2 and Type C photometry.

Run `ies --help` for all commands. No MCP, authentication or cloud download services are included.
