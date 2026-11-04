# ies-tools

[![CI](https://github.com/bhouston/ies-tools/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bhouston/ies-tools/actions/workflows/ci.yml?query=branch%3Amain)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Parse, validate, convert and preview IES LM-63 and EULUMDAT lighting files in JavaScript and TypeScript. Build a lighting product browser, check manufacturer files in CI, or embed photometric charts and a light preview in your app.

[**Live demo and documentation**](https://ies-tools.ben3d.ca/) · [**Quick start**](https://ies-tools.ben3d.ca/docs/quick-start) · [**Report an issue**](https://github.com/bhouston/ies-tools/issues)

![The light viewer in Measurement mode: false-color isolux contours on the floor and wall, an illuminance legend, floor and mounting-height rulers, chart tabs, and Realistic/Measurement and Metric/Imperial toggles](https://raw.githubusercontent.com/bhouston/ies-tools/main/packages/docs/static/img/light-viewer.png)

## Choose your tool

| Tool                                                     | Use it for                                                                     | Install / learn                                                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@ies-tools/core`](packages/core/README.md)             | Dependency-free parsing, validation, conversion and photometric calculations   | [npm](https://www.npmjs.com/package/@ies-tools/core) · [Guide](https://ies-tools.ben3d.ca/docs/core)                                                                                |
| [`@ies-tools/cli`](packages/cli/README.md)               | Inspect files, automate checks, export SVG/PNG charts and preview renders      | [npm](https://www.npmjs.com/package/@ies-tools/cli) · [Guide](https://ies-tools.ben3d.ca/docs/cli)                                                                                  |
| [`@ies-tools/viewer`](packages/viewer/README.md)         | Three.js viewer, React components and `<light-viewer>` web component           | [npm](https://www.npmjs.com/package/@ies-tools/viewer) · [React](https://ies-tools.ben3d.ca/docs/react) · [HTML](https://ies-tools.ben3d.ca/docs/light-viewer)                      |
| [VS Code extension](packages/vscode-extension/README.md) | Preview, inspect, validate, convert and highlight IES/LDT files in your editor | [Marketplace](https://marketplace.visualstudio.com/items?itemName=benhouston3d.ies-vscode-extension) · [Open VSX](https://open-vsx.org/extension/benhouston3d/ies-vscode-extension) |

## Try a file

With Node.js 22 or later:

```sh
npm install -g @ies-tools/cli
curl -fL https://ies-tools.ben3d.ca/lights/track-light.ies -o track-light.ies
ies inspect track-light.ies
ies chart track-light.ies -o polar.svg
ies view track-light.ies --open
```

You should see the manufacturer's metadata and photometric statistics, a polar chart saved to `polar.svg`, and an interactive local preview. File processing is local; no upload or account is required. See the [sample attribution](THIRD_PARTY_NOTICES.md).

To embed the viewer in HTML, place an IES file at `/lights/luminaire.ies` on your web server:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@ies-tools/viewer@1.2.0/dist/light-viewer.js"></script>
<light-viewer src="/lights/luminaire.ies" charts="true" style="height: 600px"></light-viewer>
```

## Compatibility and limits

Supports IES LM-63 1986–2019 and EULUMDAT, including alternative lamp configurations. The 3D viewer and most calculations use Type C photometry; Type A/B files can be inspected and validated. Rendering requires hardware WebGL2. SVG charts and core calculations run without a GPU.

The preview shows direct diffuse light on a floor and wall using the measured intensity distribution. It does not simulate room interreflection or luminaire-body shadows. See [compatibility and troubleshooting](https://ies-tools.ben3d.ca/docs/troubleshooting) and [calculation assumptions](https://ies-tools.ben3d.ca/docs/core#how-metrics-are-calculated).

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, workspace architecture, documentation ownership and the issue → branch → PR workflow. Use the Node version in `.nvmrc` and the pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

[Coverage reports](https://ies-tools.ben3d.ca/coverage/) are generated from tests on `main`; see the [coverage policy](CONTRIBUTING.md#coverage). [GitHub Releases](https://github.com/bhouston/ies-tools/releases) record published changes. Maintainers use [RELEASING.md](RELEASING.md) to publish separately from merging.

MIT licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for fixture attribution and licenses.
