# ies

IES and EULUMDAT photometric lighting tools for JavaScript and TypeScript, modeled on [mtlx](https://github.com/bhouston/mtlx).

| Package                                                       | Purpose                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@ies-tools/core`](packages/core/README.md)                  | Parse IES/LDT, convert photometry and calculate statistics                                                                                                                                                                                                  |
| [`@ies-tools/cli`](packages/cli/README.md)                    | Inspect, validate, convert, preview and export render/chart images                                                                                                                                                                                          |
| [`@ies-tools/viewer`](packages/viewer/README.md)              | Three.js scene, `<light-viewer>` and React viewer/graphs                                                                                                                                                                                                    |
| [`ies-vscode-extension`](packages/vscode-extension/README.md) | An IES & EULUMDAT viewer, inspector and syntax highlighter for VS Code ([Marketplace](https://marketplace.visualstudio.com/items?itemName=benhouston3d.ies-vscode-extension), [Open VSX](https://open-vsx.org/extension/benhouston3d/ies-vscode-extension)) |
| [`ies-website`](packages/website/README.md)                   | React demo with local file input                                                                                                                                                                                                                            |
| [`ies-docs`](packages/docs/)                                  | Docusaurus documentation published at [ies-tools.ben3d.ca](https://ies-tools.ben3d.ca/)                                                                                                                                                                     |

The shared components include polar, Cartesian, topology and isolux diagrams, a cone diagram, a glare-angle luminance table and an intensity table. `ies render` exports hardware-rendered PNGs; `ies chart` exports the same diagrams as SVG or PNG.

The viewer places a downward-facing light above a ground plane and in front of a wall, against a black background. It uses the IES angular intensity distribution to illuminate both receiving planes.

Embed the viewer on any web page with the `<light-viewer>` element:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@ies-tools/viewer/dist/light-viewer.js"></script>
<light-viewer src="/lights/luminaire.ies" exposure="1" style="height: 600px"></light-viewer>
```

See the [`<light-viewer>` guide](https://ies-tools.ben3d.ca/docs/light-viewer) for attributes, events, chart tabs and self-hosting.

## Working on this repository

```sh
pnpm install
pnpm build
pnpm tsc
pnpm lint
pnpm test
pnpm dev         # React demo in packages/website
pnpm docs:build  # documentation site; fails on broken links
```

Representative IES files from the three.js examples are in `fixtures/`, with attribution in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

To try the VS Code extension from source, package and install a VSIX:

```sh
pnpm build
pnpm --filter ies-vscode-extension package
code --install-extension packages/vscode-extension/ies-vscode-extension-0.1.0.vsix
```

The chart screenshots in `packages/docs/static/img/charts/` are generated with the built CLI by [`scripts/chart-screenshots.mjs`](scripts/chart-screenshots.mjs). Regenerate them with `pnpm build && pnpm docs:charts`; this is not run in CI.

CI uploads the documentation build as a `github-pages` artifact, and the Documentation workflow deploys it to GitHub Pages on every push to `main`.

### VS Code extension internals

- The preview is a webview that reuses the bundled `<light-viewer>` script; it loads no CDN resources. File text, format hints and lamp-configuration labels are sent as validated structured messages, never interpolated into HTML, and labels are assigned through `textContent`.
- The webview uses a content security policy and restricts local resources to its media directory.
- The webview UI is React with Tailwind v4 and `@ies-tools/viewer`'s theme stylesheet; the compiled CSS ships in the VSIX, and the theme tokens are mapped to VS Code editor colors.
- Diagnostics, hover, outline and CodeLens come from `describePhotometrySource` in `@ies-tools/core`. Parse results are cached per document version, and diagnostics refresh 250 ms after an edit.
- Conversion uses the same `@ies-tools/core` serializers as `ies convert` and writes through `vscode.workspace.fs`, so remote and virtual workspaces work.

See [documentation](https://ies-tools.ben3d.ca/), [CONTRIBUTING.md](CONTRIBUTING.md) and [RELEASING.md](RELEASING.md). npm and extension publication are configured as a separate manual release; initial registry setup is required. No MCP, authentication or cloud service is included.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for test-data provenance and licenses.
