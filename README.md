# ies

IES photometric lighting tools for JavaScript and TypeScript, modeled on [mtlx](https://github.com/bhouston/mtlx).

| Package                | Purpose                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `ies-core`             | Parse LM-63 files, interpolate intensities and inspect photometry |
| `ies-cli`              | Validate, report stats, convert to JSON and preview local files   |
| `ies-viewer`           | Three.js scene, `<light-viewer>` and React viewer/graphs          |
| `ies-vscode-extension` | Live `.ies` preview for VS Code                                   |
| `ies-website`          | React demo with local file input                                  |
| `ies-docs`             | Docusaurus documentation built as a GitHub Pages artifact         |

The viewer places a downward-facing light above a ground plane and in front of a wall, against a black background. It uses the IES angular intensity distribution to illuminate both receiving planes.

```sh
pnpm install
pnpm build
pnpm test
pnpm dev
```

See [documentation](https://bhouston.github.io/ies/), [CONTRIBUTING.md](CONTRIBUTING.md) and [RELEASING.md](RELEASING.md). npm and extension publication are configured as a separate manual release; initial registry setup is required. No MCP, authentication or cloud service is included.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for test-data provenance and licenses.
