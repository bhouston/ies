---
sidebar_position: 3
---

# React components

Install `ies-viewer`, `three`, `react` and `react-dom` after publication. The React exports live at `ies-viewer/react`; the core package is usable separately in Node and browsers.

```tsx
import { useState } from 'react';
import { parseIES, type IESProfile } from 'ies-core';
import { LightViewer, IntensityGraph } from 'ies-viewer/react';

export function Photometry() {
  const [profile, setProfile] = useState<IESProfile>();
  return (
    <>
      <input
        type="file"
        accept=".ies"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (file) setProfile(parseIES(await file.text()));
        }}
      />
      <LightViewer profile={profile} exposure={1} onError={console.error} />
      {profile && <IntensityGraph profile={profile} projection="topology" upAxis="y" />}
    </>
  );
}
```

Catch parsing errors in your application to present invalid file feedback. The demo in `packages/website` includes error handling and controls for exposure and graph settings. It uses Vite, React and the React Compiler.

## LightViewer

| Prop                 | Meaning                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| `profile`            | Parsed `IESProfile`, taking precedence over other sources                       |
| `iesText`            | Raw IES source text                                                             |
| `src`                | URL fetched with cancellation when the component unmounts or the source changes |
| `exposure`           | Nonnegative display exposure, default 1                                         |
| `onLoad`             | Called with the successfully displayed profile                                  |
| `onError`            | Called with an Error; errors are also shown in the component                    |
| `className`, `style` | Wrapper styling; default height is 480 pixels                                   |

The Three.js scene has a black background, floor, wall and a downward-facing luminaire above the floor. Orbit with a drag and zoom with the scroll wheel. The renderer samples the Type C intensity table and applies inverse-square falloff and receiver cosine. This is a direct diffuse preview; it does not compute room interreflection or fixture geometry shadows. WebGL2 is required.

## IntensityGraph

| Prop                 | Values and meaning                                                 |
| -------------------- | ------------------------------------------------------------------ |
| `profile`            | Required parsed profile                                            |
| `axis`               | `vertical` (default) or `horizontal`, selecting the angle to sweep |
| `angle`              | Fixed angle for the other axis, in degrees; default 0              |
| `projection`         | `polar` (default), `cartesian`, or `topology`                      |
| `upAxis`             | `x`, `y` (default), or `z` for the projected intensity topology    |
| `className`, `style` | SVG styling                                                        |

The topology is an SVG projection of the full angular candela surface. Polar and Cartesian views show a configurable slice. Intensity values are in candela. Graphs are SVG and can render without a GPU; the 3D scene needs a real hardware GPU.
