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

`validate` reports malformed files with a nonzero exit status. `inspect` shows the IES format and LM-63 version, photometric coordinate type (A/B/C), manufacturer, luminaire and lamp descriptions, absolute or relative photometry, lamp count, lumens per lamp, dimensions and units, angle counts, power, peak candela and embedded tilt availability. Source descriptions are reported from file metadata; absent descriptions are shown as not specified. `--json` emits a machine-readable summary. `convert` defaults to native JSON: IES profiles include their horizontal-major candela table, while LDT retains its native cd/klm table, geometry and all alternative lamp sets. Omit the output option to write JSON to stdout. Existing output files are never overwritten.

`view` serves the selected file and bundled viewer from a loopback HTTP server and prints its URL. `--open` launches your default browser; `--port 8080` chooses a fixed port. Stop the server with Ctrl+C. The preview uses hardware WebGL2 and Type C photometry. Files are not uploaded, and scripts are served locally.

Run `ies --help` for usage. The command line has no authentication or cloud service dependency.

`ies inspect` additionally reports declared lamp flux, integrated luminaire flux, integrated luminous efficacy, principal-plane beam/field estimates and LM-63-2019 generation provenance. Declared lamp ratings and estimated luminaire output are labeled separately; absent absolute-photometry lamp ratings and unsupported Type A/B calculations are null in JSON. Beam/field estimates have explicit statuses when a crossing is missing or multiple lobes make a single width ambiguous. Estimates use the embedded lamp correction at 0° tilt.

```sh
ies validate luminaire.ies --json
ies validate luminaire.ies --strict --json
```

Validation JSON includes `valid`, the selected file, any available summary and `diagnostics` with stable codes, severity, message and optional field. Even malformed-file parse errors produce a JSON result on stdout with a nonzero exit status. Missing required 2002/2019 metadata emits warnings; `--strict` makes those warnings fail validation without changing their severity. Default validation still accepts usable files with warnings. Text validation prints diagnostics on stderr. Read or command-line errors continue to use the CLI error stream.

`inspect --json` also includes diagnostics. Type A/B files remain inspectable; their integrated flux, efficacy and beam calculations are explicitly unavailable. See the core documentation for the integration and beam-estimation assumptions.

## EULUMDAT input and conversion

```sh
ies inspect luminaire.ldt --json
ies inspect alternatives.ldt --lamp-set 2
ies validate luminaire.ldt --strict --json
ies convert luminaire.ldt --to ies -o luminaire.ies
ies convert luminaire.ies --to ldt -o luminaire.ldt
ies convert luminaire.ldt --to json
ies view alternatives.ldt --lamp-set 2 --open
```

Every file command accepts IES and EULUMDAT (`.ldt`). An explicit `--format ies|ldt` takes precedence over a conventional filename extension; extensionless or unknown-extension files use content detection. `--lamp-set N` selects one LDT alternative configuration using **one-based** numbering. The core and viewer APIs use zero-based `lampSetIndex`, so CLI selection 2 corresponds to API index 1.

`inspect` identifies EULUMDAT as its source format and lists retained lamp configurations. Without a choice in a multi-configuration file it leaves intensity, flux and efficacy unavailable; it never sums alternatives or silently picks the first. Selected absolute LDT measurements retain a separate `declaredLuminaireFluxLumens` source rating in JSON. Relative lamp ratings, absolute luminaire ratings, and integrated angular-table estimates stay distinct.

Native validation and native JSON/LDT round trips preserve all configurations without selecting one. Rendering and LDT-to-IES conversion require an explicit choice for multiple sets. LDT parse failures use the structured `LDT_PARSE_ERROR` code. Empty manufacturer-identification or luminaire-name descriptions produce documented usability warnings; these are not claimed to be normative required-keyword rules. Strict mode fails on those warnings.

`--to ies|ldt|json` selects conversion output; the default remains JSON. JSON preserves the **native source model**, not a relabeled normalized IES object. Text conversion prints loss warnings with stable codes on stderr, while stdout contains only the selected payload. `-o` creates an output exclusively and never overwrites an existing file. Bidirectional conversion has documented losses and coordinate restrictions; see [Conversion](./conversion.md).

Local previews serve the unmodified original text at `/profile.ies` or `/profile.ldt` with the corresponding viewer hint. Lamp selections are explicit in the preview. Both source formats use the same calibrated rendering profile; viewing does not serialize LDT to IES first. `inspect` remains the statistics command; no separate `stats` alias is provided.
