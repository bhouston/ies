---
title: Quick start
description: Inspect a sample IES file, export a chart, parse photometry in Node, or embed a React viewer.
---

# Get your first result

Use this [sample track-light file](/lights/track-light.ies) before trying your own photometry. It comes from the three.js examples; see [fixture attribution and licenses](https://github.com/bhouston/ies-tools/blob/main/THIRD_PARTY_NOTICES.md).

## Inspect and chart a file

Install Node.js 22 or later, then run these commands in a new directory:

```sh
npm install -g @ies-tools/cli
curl -fL https://ies-tools.ben3d.ca/lights/track-light.ies -o track-light.ies
ies inspect track-light.ies
ies validate track-light.ies --strict
ies chart track-light.ies -o polar.svg
```

`inspect` prints the file's manufacturer, luminaire, flux and beam estimates. `validate` exits successfully for this sample. Open `polar.svg` to see its principal-plane intensity curves. These commands need no GPU. Outputs are never overwritten: choose another output name when repeating an export.

For a 3D preview, run `ies view track-light.ies --open` in a hardware-WebGL2-capable browser. Drag to orbit, switch chart tabs, and press Ctrl+C in the terminal to stop the server. The file is processed locally.

Next: [CLI guide](./cli.md), [export charts](./graphs.md), or [validate files in CI](./automation.md).

## Parse a file in Node

In the directory containing `track-light.ies`:

```sh
npm install @ies-tools/core
```

Save this as `inspect.mjs`, then run `node inspect.mjs`:

```js
import { readFile } from 'node:fs/promises';
import { parsePhotometry, sampleIntensity, calculateLuminousFlux } from '@ies-tools/core';

const text = await readFile('track-light.ies', 'utf8');
const document = parsePhotometry(text);
console.log('Nadir intensity (cd):', sampleIntensity(document.profile, 0, 0));
console.log('Integrated output (lm):', calculateLuminousFlux(document.profile));
```

Both values should be finite and positive. `parsePhotometry` detects IES or EULUMDAT from the text. Invalid input throws an error; for diagnostics instead, use [structured validation](./core.md#validate-a-file). No Three.js, React or GPU is required.

Next: [core guide](./core.md) and [conversion with loss warnings](./conversion.md#convert-a-file-and-review-loss-warnings).

## Show the sample in React

In an existing client-rendered React 19 app:

```sh
npm install @ies-tools/viewer @ies-tools/core three@^0.186.0
```

Download the sample above into `public/lights/track-light.ies`. Render this component:

```tsx
import { LightViewer } from '@ies-tools/viewer/react';
import '@ies-tools/viewer/styles.css';

export default function App() {
  return (
    <LightViewer
      src="/lights/track-light.ies"
      style={{ height: 480 }}
      onError={(error) => console.error(error.message)}
    />
  );
}
```

Start your app's development server. You should see a narrow beam illuminating the floor and wall; drag to orbit. The stylesheet supplies the settings UI. The 3D view requires hardware WebGL2 and a browser DOM; with server rendering, mount it on the client.

Next: [React charts and local file input](./react.md), [plain HTML integration](./light-viewer.mdx), or [compatibility and limits](./troubleshooting.md).

Prefer an editor? [Install the VS Code extension](./vscode.md#install) and open the sample file.
