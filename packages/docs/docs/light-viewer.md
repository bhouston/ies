---
sidebar_position: 4
---

# The light-viewer element

Use the custom element in any browser application, independently of React:

```html
<script type="module" src="/vendor/light-viewer.js"></script>
<light-viewer src="/lights/luminaire.ies" exposure="1" style="height: 600px"></light-viewer>
```

Copy the self-contained `ies-viewer/dist/light-viewer.js` bundle to your application's public assets, or import the registration module in a bundler:

```js
import 'ies-viewer/element';

const viewer = document.querySelector('light-viewer');
viewer.addEventListener('load', (event) => console.log(event.detail.profile));
viewer.addEventListener('error', (event) => console.error(event.detail.message));
viewer.iesText = await file.text();
```

`data` is an alias for `iesText`. Both accept raw IES text, avoiding the need to host an uploaded file. Attach listeners before setting a source. Fetched URLs must be accessible to your page under normal browser CORS rules.

`src` changes cancel previous requests; removing the element cancels loading and releases GPU resources. Reinserting the element recreates its viewer. `exposure` controls display brightness and must be a finite nonnegative number. The element defaults to a 480-pixel height and black background.

The `load` event carries `{ profile }`. The `error` event carries `{ message, error }`, and the component also displays the message. Both events bubble across the shadow boundary. A hardware WebGL2 context and Type C profile are required for rendering.

## Imperative Three.js API

```js
import { createLightViewer } from 'ies-viewer';

const viewer = createLightViewer(document.querySelector('#viewport'), { height: 2, exposure: 1 });
viewer.load(iesText);
viewer.setExposure(2);
// When the host view is destroyed:
viewer.dispose();
```

`height` is the luminaire's distance above the floor in meters; size the host element with CSS. `setProfile(profile)` accepts a previously parsed document. The returned `renderer` exposes the Three.js WebGLRenderer for integrations and hardware diagnostics.

Three.js's `IESLoader` is also exported by `ies-viewer` for applications that use its native photometric textures. Its texture representation differs from the viewer's calibrated candela table; consult the Three.js loader contract when integrating it with Three.js lighting.

The currently pinned Three.js loader has known texture layout limitations for some bilateral and full-azimuth files. The shared viewer uses its own validated candela sampler, and tests verify finite receiver textures for every bundled fixture. The native loader export is provided for interoperability, not as a substitute for core validation.
