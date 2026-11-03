# ies-viewer

Shared Three.js viewer, React components, and `<light-viewer>` for IES Type C photometry. The scene has a black background, a ground plane, and a wall. A fixture two metres above the floor faces down. Receiver shaders use the measured IES candela distribution, incidence cosine, and inverse square distance on both surfaces. Values use metres; exposure maps 100 lux to linear display value 1 before ACES tone mapping. This is a direct diffuse light preview without indirect light or occlusion simulation.

```sh
npm install ies-viewer ies-core three
```

```ts
import { createLightViewer } from 'ies-viewer';
const viewer = createLightViewer(document.querySelector('#preview'));
viewer.load(iesText);
// viewer.setProfile(parsedProfile); viewer.setExposure(2);
// Call viewer.dispose() when unmounting.
```

```tsx
import { LightViewer, IntensityGraph, IsoluxGraph } from 'ies-viewer/react';
<LightViewer src="/fixture.ies" exposure={1} onLoad={setProfile} />;
<IntensityGraph profile={profile} axis="vertical" angle={90} projection="polar" />;
<IntensityGraph profile={profile} projection="topology" upAxis="z" surface="both" />;
<IntensityGraph profile={profile} principalPlanes />;
<IsoluxGraph profile={profile} mountingHeight={3} extent={10} aimAngle={30} />;
```

React accepts `profile`, `iesText`, or `src` in that precedence order and emits `onLoad(profile)` / `onError(error)`. `style` and `className` control the container; default height is 480 pixels. Graph `axis` is `vertical` (complete opposed-plane −180–180° cut at a fixed azimuth) or `horizontal` (sweep 0–360°, fixed vertical angle). `angle` is the fixed angle in degrees. `projection` is `polar`, `cartesian`, or `topology`; topology shows the full candela surface with `upAxis` `x`, `y`, or `z`.

```html
<script type="module" src="https://unpkg.com/ies-viewer/dist/light-viewer.js"></script>
<light-viewer src="/fixture.ies" exposure="1" style="height: 600px"></light-viewer>
```

For bundlers, `import 'ies-viewer/element'`. Set the element's `iesText` (or `data`) property to raw file text instead of fetching `src`. `load` events contain `event.detail.profile`; `error` events contain `event.detail.message` and `.error`. Cross-origin source URLs require CORS. Removed elements abort fetches and release their GPU resources; reconnecting restores the current document. WebGL2 on a real GPU is required for rendering. Types A and B are explicitly rejected by the 3D viewer.

The `dist/light-viewer.js` bundle includes Three.js and the parser for standalone scripts, CLI previews, and VS Code webviews. React is an optional peer for the React entry point only. SVG graphs also work without WebGL.

`IESLoader` is also re-exported from Three.js for applications using Three.js native IES lighting. Its normalized map is intended for Three.js `IESSpotLight`; it has the loader's own texture layout. `createCandelaTexture(profile)` instead creates this viewer's 361×181 float receiver map with **absolute candela**, U = horizontal 0–360°, V = vertical 0–180°, sampled at pixel centers. These maps are not interchangeable. The calibrated map is tested against every repository IES fixture without creating a GPU context. Native-loader compatibility is tested on the original examples and can be diagnosed across the expanded fixture set with `node scripts/compare-ies-loaders.mjs`; consumers dispose returned textures.

Installed Three.js **0.186.1** native-loader limitation: its symmetry expansion leaves holes/nonfinite float values in the maps for the `02a…` (90–270° azimuth) and `06b…` (0–345°) example fixtures. Compatibility tests record this explicitly. Use this package's `createCandelaTexture` and `createLightViewer` for those distributions; both preserve finite, absolute photometry across all bundled examples. The native loader also fails to parse the dense `Preliminar` fixture because of line-boundary assumptions. The re-export is the upstream loader unchanged, so applications choosing native `IESSpotLight` maps must check their inputs and Three.js version. See the documentation compatibility plan for the complete comparison.

`planes` overlays selected cuts; `principalPlanes` shows C0–C180 and C90–C270. Topology supports filled/wireframe rendering and orthographic/perspective projection with configurable view angles. `IsoluxGraph` computes actual ground lux using the measured distribution, inverse-square falloff and receiver cosine, with height, fixture aim/azimuth and contours. Fixture aiming and the optional `lampTilt` correction are separate. Pure calculation/geometry helpers are exported from `ies-viewer/graphs` without React or Three.js dependencies. See [the graph documentation](https://bhouston.github.io/ies/graphs) for defaults, bounds and coordinates.
