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
