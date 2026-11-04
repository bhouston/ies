---
title: Compatibility and troubleshooting
description: Runtime requirements, WebGL2, React and Three.js compatibility, CORS, and photometry limitations.
---

# Compatibility and troubleshooting

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

IES LM-63 1986, 1991, 1995, 2002 and 2019 and EULUMDAT are supported. Type C supports sampling, charts and rendering. Type A/B supports inspection and validation, with unsupported calculations explicitly unavailable. External `TILT` files are rejected; embedded tilt data is preserved. See [core behavior](./core.md) and [conversion guarantees](./conversion.md).

## The viewer is blank

Check the viewer's error message, browser console and `onError` callback. Confirm that the container has a nonzero height and that WebGL2 is available on a real GPU. In VS Code, check that GPU acceleration is enabled. Software rasterizers are not supported; CLI `render --json` reports the actual renderer and rejects software or unknown adapters.

To isolate the problem, try the [sample file](./quick-start.md). If charts work but 3D fails, investigate WebGL2 and coordinate-type support first.

## The source URL fails to load

Put the file in your app's public directory and open the app over HTTP using its development server. A URL like `/lights/track-light.ies` is relative to your application's origin. Verify it returns file text rather than an HTML fallback page. For another origin, the server hosting the file must permit your origin through CORS. To use a local file picker, read `file.text()` and pass `text` to React or `photometryText` to the custom element.

## React renders but the controls look wrong

Import `@ies-tools/viewer/styles.css` once. Use React 19 and Three.js 0.186.x, matching the package's peer dependencies. With SSR frameworks, put the 3D viewer behind a client-only mount or dynamic import with server rendering disabled. See [styling](./styling.md) and the [complete React example](./quick-start.md#show-the-sample-in-react).

## An LDT file needs a lamp configuration

Lamp sets are alternatives, never a sum. Choose `--lamp-set 1` in the CLI or `lampSetIndex={0}` in React for the first configuration. The CLI counts from one; JavaScript counts from zero. Inspect the file first so the choice is deliberate. See [conversion](./conversion.md#lamp-configurations).

## Conversion produces warnings

Review each warning before saving the result. Some metadata or geometry has no equivalent in the target format. A successful conversion does not imply lossless interchange. Follow the [conversion recipe](./conversion.md#convert-a-file-and-review-loss-warnings).

## The preview differs from a room simulation

It shows direct diffuse light on a floor and wall, using intensity, inverse-square falloff and receiver cosine. It does not simulate room interreflection, body shadows or detailed fixture geometry. Exposure and tone mapping change display appearance. Integrated flux and beam widths are estimates from the angular table; see [calculation assumptions](./core.md#how-metrics-are-calculated).

## Report an integration problem

[Open an issue](https://github.com/bhouston/ies-tools/issues) with the package version, runtime/browser, minimal example, diagnostic code, and a redistributable input file if possible. For rendering problems, include the reported GPU renderer. Check [release notes](https://github.com/bhouston/ies-tools/releases) when upgrading.
