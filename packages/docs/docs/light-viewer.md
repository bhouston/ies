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

`photometryText` accepts raw IES or LDT source text. `data` and `iesText` are compatibility aliases for that property, avoiding the need to host an uploaded file. Attach listeners before setting a source. Fetched URLs must be accessible to your page under normal browser CORS rules.

`src` changes cancel previous requests; removing the element cancels loading and releases GPU resources. Reinserting the element recreates its viewer. `exposure` controls display brightness and must be a finite nonnegative number. The element defaults to a 480-pixel height and black background.

The `load` event carries `{ profile, document, sourceFormat }`; the existing profile field remains available. The `error` event carries `{ message, error }`, and the component also displays the message. Both events bubble across the shadow boundary. A hardware WebGL2 context and Type C profile are required for rendering.

## Imperative Three.js API

```js
import { createLightViewer } from 'ies-viewer';

const viewer = createLightViewer(document.querySelector('#viewport'), { height: 2, exposure: 1 });
viewer.load(iesOrLdtText);
viewer.setExposure(2);
// When the host view is destroyed:
viewer.dispose();
```

`height` is the luminaire's distance above the floor in meters; size the host element with CSS. `setProfile(profile)` accepts a previously parsed compatible profile. `setDocument(document)` accepts a shared native-source document directly. The returned `renderer` exposes the Three.js WebGLRenderer for integrations and hardware diagnostics.

Three.js's `IESLoader` is also exported by `ies-viewer` for applications that use its native photometric textures. Its texture representation differs from the viewer's calibrated candela table; consult the Three.js loader contract when integrating it with Three.js lighting.

The currently pinned Three.js loader has known texture layout limitations for some bilateral and full-azimuth files. The shared viewer uses its own validated candela sampler, and tests verify finite receiver textures for every bundled fixture. The native loader export is provided for interoperability, not as a substitute for core validation.

## EULUMDAT and source hints

```html
<light-viewer src="/lights/luminaire.ldt" format="ldt" lamp-set-index="1"></light-viewer>
```

`format` optionally forces `ies` or `ldt`; without it, file content is detected. `lamp-set-index` is a **zero-based** LDT configuration index and must be supplied for files containing multiple alternative lamp sets. It is not a lamp count or a brightness multiplier. Single-set files need no index. Invalid formats and indices produce the normal error event and visible status message.

```js
import { parsePhotometry } from 'ies-core';
viewer.photometryText = ldtText; // automatically detected
viewer.photometry = parsePhotometry(ldtText, 'ldt', { lampSetIndex: 1 });
viewer.addEventListener('load', (event) => {
  console.log(event.detail.sourceFormat, event.detail.document.source);
});
```

The `photometry` property accepts a shared in-memory document and preserves its source geometry and metadata without converting to an IES string. Assigning raw text replaces that document input; changing `src` replaces both explicit text and document inputs. Source changes cancel older fetches, and stale responses cannot replace a newer selection. Removing the element cancels loading and disposes the controller; reconnecting recreates it with the selected input.

The imperative controller keeps its original `load(text)` return value, a compatible `IESProfile`, while accepting either source format. Use `loadDocument(text, format?, { lampSetIndex? })` to receive the complete native-source document, or read the controller's `document` after loading. `load(text, format?, { lampSetIndex? })` accepts the same optional input hint and zero-based selection.
