# ies-cli

```sh
npm install -g ies-cli
ies validate luminaire.ies
ies inspect luminaire.ies --json
ies convert luminaire.ies -o luminaire.json
ies view luminaire.ies --open
```

`validate` returns a nonzero exit status for malformed input. `inspect --json` prints metadata, angle counts, power and peak candela. `convert` exports the parsed `ies-core` profile, including actual candela values and embedded tilt data. Output files are created exclusively: an existing file is never silently overwritten. Omit `-o` to write JSON to stdout.

`view` bundles the shared `<light-viewer>` locally, serves the chosen file from `127.0.0.1` on a free port and prints the URL. Set `--port 8080` for a fixed port. `--open` launches the system browser. Press Ctrl+C to stop. The local server does not upload files or load scripts from a CDN. Preview requires hardware WebGL2 and Type C photometry.

Run `ies --help` for all commands. No MCP, authentication or cloud download services are included.
