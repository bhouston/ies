---
slug: /
sidebar_position: 1
sidebar_label: Introduction
---

# ies-tools

ies-tools opens the IES (LM-63) and EULUMDAT (`.ldt`) photometric files that lighting manufacturers publish. It shows how a luminaire lights a floor and wall, draws its photometric charts, reports its statistics and checks the file for errors. It also converts between IES, LDT and JSON.

Everything runs locally: there is no account, upload or cloud service.

Start with the [five-minute quick start](./quick-start.md), using a supplied sample file. For automated checks, see [Validate photometry in CI](./automation.md).

## Choose your tool

### VS Code extension

Preview, validate and convert `.ies` and `.ldt` files without leaving your editor. Install it from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=benhouston3d.ies-vscode-extension) or [Open VSX](https://open-vsx.org/extension/benhouston3d/ies-vscode-extension), or run:

```sh
code --install-extension benhouston3d.ies-vscode-extension
```

[Read the VS Code guide →](./vscode.md)

### The `ies` command line

Inspect, validate and convert files, open a local preview, and export charts and renders from a terminal or a script.

```sh
npm install -g @ies-tools/cli
```

[Read the command line guide →](./cli.md)

### The `<light-viewer>` web component

Embed the interactive viewer and its chart tabs in any web page, with no framework.

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@ies-tools/viewer/dist/light-viewer.js"></script>
```

[Read the `<light-viewer>` guide →](./light-viewer.mdx)

### React components

Add the 3D viewer, the charts and the file information panel to a React app.

```sh
npm install @ies-tools/viewer @ies-tools/core three react react-dom
```

[Read the React guide →](./react.md)

### The `@ies-tools/core` library

Parse, validate, measure and convert photometric files in Node or the browser. It has no dependencies.

```sh
npm install @ies-tools/core
```

[Read the core library guide →](./core.md)

## What it can show

- **A lit scene:** the light falling on a floor and back wall, rendered from the measured intensity table.
- **[Charts](./graphs.md):** polar and Cartesian intensity curves, a 3D intensity surface, isolux ground plots, a cone diagram, glare luminance and the intensity table.
- **[File information](./vscode.md#file-information-and-validation):** format, manufacturer and lamp details, flux, efficacy, beam and field angles, light output ratios, zonal lumens and every metadata keyword.
- **[Validation](./cli.md#validate-a-file):** errors and warnings with stable codes, pointing at the line that caused them.
- **[Conversion](./conversion.md):** IES to LDT, LDT to IES, and either one to JSON, with a warning for anything the target format can't hold.

## Supported files

- IES LM-63: the 1986, 1991, 1995, 2002 and 2019 editions, including embedded `TILT` data.
- EULUMDAT `.ldt`, including files with several alternative lamp configurations.

The 3D view and most charts need **Type C** photometry, which covers almost all published luminaire files. Type A and B files can still be inspected and validated. The 3D view also needs hardware WebGL2. See [compatibility and limits](./troubleshooting.md) for supported runtimes and photometric assumptions.

Looking to contribute? Read [CONTRIBUTING.md](https://github.com/bhouston/ies-tools/blob/main/CONTRIBUTING.md).
