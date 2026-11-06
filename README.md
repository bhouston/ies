<p align="center">
  <a href="https://ies-tools.ben3d.ca" target="_blank" rel="noopener noreferrer">
    <img alt="ies-tools logo" src="https://raw.githubusercontent.com/bhouston/ies-tools/main/packages/docs/static/img/icon.png" height="96">
  </a>
</p>
<br/>
<p align="center">
  <a href="https://npmjs.com/package/@ies-tools/core"><img src="https://img.shields.io/npm/v/@ies-tools/core.svg" alt="npm package"></a>
  <a href="https://www.npmtrends.com/@ies-tools/core"><img src="https://img.shields.io/npm/dw/@ies-tools/core.svg" alt="npm downloads"></a>
  <a href="https://discord.gg/fwupDN493R"><img src="https://img.shields.io/badge/chat-discord-blue?style=flat&logo=discord" alt="discord chat"></a>
  <a href="https://ies-tools.ben3d.ca"><img src="https://img.shields.io/badge/docs-read-blue?style=flat" alt="documentation"></a>
</p>
<br/>

# ies-tools

> Parse, validate, convert and preview IES and EULUMDAT lighting files.

- 📄 IES LM-63 and EULUMDAT
- ✅ Validation With Diagnostic Codes
- 🔄 Convert IES, LDT, and JSON
- 📊 SVG and PNG Photometric Charts
- 💡 3D Light Viewer Component
- 🔒 Local Processing, No Uploads

Parse, validate, convert and preview IES LM-63 and EULUMDAT lighting files in JavaScript and TypeScript. Build a lighting product browser, check manufacturer files in CI, or embed photometric charts and a light preview in your app.

[**Quick start**](https://ies-tools.ben3d.ca/docs/quick-start) · [**Report an issue**](https://github.com/bhouston/ies-tools/issues)

[Read the Docs to Learn More](https://ies-tools.ben3d.ca/).

## Packages

| Package                                           | Version (click for changelogs)                                                                                                                                       |
| ------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [@ies-tools/core](packages/core)                  | [![@ies-tools/core version](https://img.shields.io/npm/v/@ies-tools/core.svg?label=%20)](https://github.com/bhouston/ies-tools/releases)                             |
| [@ies-tools/cli](packages/cli)                    | [![@ies-tools/cli version](https://img.shields.io/npm/v/@ies-tools/cli.svg?label=%20)](https://github.com/bhouston/ies-tools/releases)                               |
| [@ies-tools/viewer](packages/viewer)              | [![@ies-tools/viewer version](https://img.shields.io/npm/v/@ies-tools/viewer.svg?label=%20)](https://github.com/bhouston/ies-tools/releases)                         |
| [ies-vscode-extension](packages/vscode-extension) | [![ies-vscode-extension version](https://img.shields.io/open-vsx/v/benhouston3d/ies-vscode-extension.svg?label=%20)](https://github.com/bhouston/ies-tools/releases) |

![The light viewer in Realistic mode, seen from low beside the light: an auto-exposed downlight mounted 3 m high glows with a soft glare halo above a cone of light that pools on the floor and washes the wall, with floor and mounting-height rulers, chart tabs, and Realistic/Measurement and Metric/Imperial toggles](https://raw.githubusercontent.com/bhouston/ies-tools/main/packages/docs/static/img/light-viewer.png)

## Choose Your Tool

| Tool                                                     | Use it for                                                                     | Install / learn                                                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@ies-tools/core`](packages/core/README.md)             | Dependency-free parsing, validation, conversion and photometric calculations   | [npm](https://www.npmjs.com/package/@ies-tools/core) · [Guide](https://ies-tools.ben3d.ca/docs/core)                                                                                |
| [`@ies-tools/cli`](packages/cli/README.md)               | Inspect files, automate checks, export SVG/PNG charts and preview renders      | [npm](https://www.npmjs.com/package/@ies-tools/cli) · [Guide](https://ies-tools.ben3d.ca/docs/cli)                                                                                  |
| [`@ies-tools/viewer`](packages/viewer/README.md)         | Three.js viewer, React components and `<light-viewer>` web component           | [npm](https://www.npmjs.com/package/@ies-tools/viewer) · [React](https://ies-tools.ben3d.ca/docs/react) · [HTML](https://ies-tools.ben3d.ca/docs/light-viewer)                      |
| [VS Code extension](packages/vscode-extension/README.md) | Preview, inspect, validate, convert and highlight IES/LDT files in your editor | [Marketplace](https://marketplace.visualstudio.com/items?itemName=benhouston3d.ies-vscode-extension) · [Open VSX](https://open-vsx.org/extension/benhouston3d/ies-vscode-extension) |

## Try a File

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

## Compatibility and Limits

Supports IES LM-63 1986–2019 and EULUMDAT, including alternative lamp configurations. The 3D viewer and most calculations use Type C photometry; Type A/B files can be inspected and validated. Rendering requires hardware WebGL2. SVG charts and core calculations run without a GPU.

The preview shows direct diffuse light on a floor and wall using the measured intensity distribution. It does not simulate room interreflection or luminaire-body shadows. See [compatibility and troubleshooting](https://ies-tools.ben3d.ca/docs/troubleshooting) and [calculation assumptions](https://ies-tools.ben3d.ca/docs/core#how-metrics-are-calculated).

## Development

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, workspace architecture, documentation ownership and the issue → branch → PR workflow. Use the Node version in `.nvmrc` and the pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

[Coverage reports](https://ies-tools.ben3d.ca/coverage/) are generated from tests on `main`; see the [coverage policy](CONTRIBUTING.md#coverage). [GitHub Releases](https://github.com/bhouston/ies-tools/releases) record published changes. Maintainers use [RELEASING.md](RELEASING.md) to publish separately from merging. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for fixture attribution and licenses.

## Contribution

See [Contributing Guide](CONTRIBUTING.md).

## License

MIT

## Author

[Ben Houston](https://ben3d.ca), Sponsored by [Land of Assets](https://landofassets.com).
