# ies

IES and EULUMDAT photometric lighting tools for JavaScript and TypeScript, modeled on [mtlx](https://github.com/bhouston/mtlx).

| Package                | Purpose                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `@ies-tools/core`      | Parse IES/LDT, convert photometry and calculate statistics         |
| `@ies-tools/cli`       | Inspect, validate, convert, preview and export render/chart images |
| `@ies-tools/viewer`    | Three.js scene, `<light-viewer>` and React viewer/graphs           |
| `ies-vscode-extension` | Live `.ies` and `.ldt` previews for VS Code                        |
| `ies-website`          | React demo with local file input                                   |
| `ies-docs`             | Docusaurus documentation built as a GitHub Pages artifact          |

The shared components include polar, Cartesian, topology and isolux diagrams, a cone diagram, a glare-angle luminance table and an intensity table. `ies render` exports hardware-rendered PNGs; `ies chart` exports the same diagrams as SVG or PNG.

The viewer places a downward-facing light above a ground plane and in front of a wall, against a black background. It uses the IES angular intensity distribution to illuminate both receiving planes.

Embed the viewer on any web page with the `<light-viewer>` element:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@ies-tools/viewer/dist/light-viewer.js"></script>
<light-viewer src="/lights/luminaire.ies" exposure="1" style="height: 600px"></light-viewer>
```

See the [`<light-viewer>` guide](https://ies-tools.ben3d.ca/docs/light-viewer) for attributes, events, chart tabs and self-hosting.

To work on this repository:

```sh
pnpm install
pnpm build
pnpm test
pnpm dev
```

See [documentation](https://ies-tools.ben3d.ca/), [CONTRIBUTING.md](CONTRIBUTING.md) and [RELEASING.md](RELEASING.md). npm and extension publication are configured as a separate manual release; initial registry setup is required. No MCP, authentication or cloud service is included.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for test-data provenance and licenses.
