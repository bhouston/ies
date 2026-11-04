---
title: Compatibility and limits
description: Supported runtimes, integration requirements, photometry formats and rendering assumptions.
---

# Compatibility and limits

## Supported environments

| Surface                          | Requirements                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| Core and CLI in Node             | Node.js 22+; ESM imports for the library                                                |
| Core in a browser                | ESM-capable bundler or module loader; no DOM or GPU needed for calculations             |
| React integration                | React / React DOM 19, Three.js 0.186.x; mount the viewer in the browser                 |
| Standalone custom element        | Modern browser; bundled dependencies; no build step                                     |
| 3D previews and CLI `render`     | Hardware WebGL2; CLI export also needs an installed Chrome, Edge or Playwright Chromium |
| React SVG charts and CLI `chart` | No GPU required; PNG charts are rasterized with Sharp                                   |
| VS Code extension                | VS Code 1.85+; hardware WebGL2 for 3D previews                                          |

## Photometry support

IES LM-63 1986, 1991, 1995, 2002 and 2019 and EULUMDAT are supported. Type C supports sampling, charts and rendering. Type A/B supports inspection and validation, with unsupported calculations explicitly unavailable. External `TILT` files are rejected; embedded tilt data is preserved. See [core behavior](./core.md) and [conversion guarantees](./conversion.md).

## Preview and calculation limits

It shows direct diffuse light on a floor and wall, using intensity, inverse-square falloff and receiver cosine. It does not simulate room interreflection, body shadows or detailed fixture geometry. Exposure and tone mapping change display appearance. Integrated flux and beam widths are estimates from the angular table; see [calculation assumptions](./core.md#how-metrics-are-calculated).

## Integration requirements

React controls need `@ies-tools/viewer/styles.css`; the standalone `<light-viewer>` bundles its styles. Browser-only rendering must mount on the client in SSR applications. See the [React integration guide](./react.md), [embedding guide](./light-viewer.mdx) and [styling reference](./styling.md) for setup.

Loading and initialization failures explain the next action in the viewer itself. The CLI reports corrective options alongside its errors; the VS Code preview provides validation diagnostics and a selector for alternative lamp configurations.
