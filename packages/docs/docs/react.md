---
sidebar_position: 6
sidebar_label: React
---

# React components

![The light viewer in Realistic mode, seen from low beside the light: an auto-exposed downlight mounted 3 m high glows with a soft glare halo above a cone of light that pools on the floor and washes the wall, with floor and mounting-height rulers, chart tabs, and Realistic/Measurement and Metric/Imperial toggles](/img/light-viewer.png)

`@ies-tools/viewer/react` provides the 3D light viewer, every photometric chart, and the file information panel as React components.

```sh
npm install @ies-tools/viewer @ies-tools/core three react react-dom
```

For a first integration with a supplied fixture, follow [Show the sample in React](./quick-start.md#show-the-sample-in-react).

## Show a file the user picks

```tsx
import { useState } from 'react';
import { parsePhotometry, type PhotometricDocument } from '@ies-tools/core';
import { LightViewer, IntensityGraph } from '@ies-tools/viewer/react';
import '@ies-tools/viewer/styles.css';

export function Photometry() {
  const [document, setDocument] = useState<PhotometricDocument>();
  const [error, setError] = useState<string>();
  const profile = document?.profile;
  return (
    <>
      <input
        type="file"
        accept=".ies,.ldt"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try {
            setDocument(parsePhotometry(await file.text()));
            setError(undefined);
          } catch (cause) {
            setDocument(undefined);
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        }}
      />
      {error && <p role="alert">{error}</p>}
      {document && <LightViewer document={document} onError={console.error} />}
      {profile && <IntensityGraph profile={profile} projection="topology" upAxis="y" />}
    </>
  );
}
```

`parsePhotometry` throws for invalid files, so catch the error to show your own message. It also throws for an LDT file with several lamp configurations until you choose one; see [Lamp configurations](#lamp-configurations).

## LightViewer

`LightViewer` shows the luminaire lighting a floor and wall against a black background. Drag to orbit and scroll to zoom; click and drag the light to change its height and wall distance, which reports the new distances through `onSettingsChange`. It needs hardware WebGL2 and Type C photometry.

```tsx
<LightViewer src="/lights/luminaire.ies" />
```

Give it one source. If you pass more than one, the first in this order wins: `document`, `profile`, `text`, `iesText`, `src`.

| Prop                 | Meaning                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `document`           | A `PhotometricDocument` from `parsePhotometry`, keeping the original file's details |
| `profile`            | A parsed `IESProfile`                                                               |
| `text`               | Raw IES or LDT text; the format is detected                                         |
| `iesText`            | Alias for `text`                                                                    |
| `src`                | URL to fetch; changing it or unmounting cancels the request                         |
| `format`             | Force `ies` or `ldt` for `text` and `src`                                           |
| `lampSetIndex`       | Zero-based LDT lamp configuration; needed when there are several                    |
| `onLoad`             | Called with `(profile, { document, sourceFormat })`                                 |
| `onError`            | Called with an `Error`; the message is also shown in the viewer                     |
| `className`, `style` | Wrapper styling; the default height is 480 pixels                                   |

### Scene settings

These props set the scene. They update the view without reloading the file.

| Prop               | Meaning                                                                      | Default     |
| ------------------ | ---------------------------------------------------------------------------- | ----------- |
| `showWall`         | Show the back wall                                                           | `true`      |
| `wallDistance`     | Distance from the light to the wall in metres                                | `2`         |
| `floorDistance`    | Height of the light above the floor in metres                                | `2`         |
| `lightOffset`      | Deprecated, removed in the next major version. Sideways position in metres   | `0`         |
| `toneMapping`      | `aces`, `agx`, `neutral`, `reinhard`, `cineon`, `linear` or `none`           | `aces`      |
| `autoExposure`     | Meter the exposure from the brightest floor or wall point                    | `true`      |
| `exposure`         | Camera exposure in EV100, −6 to 20, when `autoExposure` is `false`           | `6`         |
| `helper`           | Blue lines showing the beam's extent                                         | `true`      |
| `photometricSolid` | Amber 3D shape of the candela distribution                                   | `false`     |
| `rulers`           | Floor distance rulers and the mounting height                                | `true`      |
| `viewMode`         | `realistic`, or `measurement` for false-color illuminance with isolux lines  | `realistic` |
| `units`            | `metric` (lux, metres) or `imperial` (footcandles, feet) for display only    | `metric`    |
| `settingsPanel`    | Gear panel: `closed`, `open` or `hidden`                                     | `closed`    |
| `onSettingsChange` | Called with `{ settings, previousSettings }` when the user changes a setting |             |

If you leave a setting prop out, the user controls it from the gear panel.

The scene shows direct light only: it doesn't compute reflections between surfaces or shadows from the luminaire's body.

## Charts

All charts draw SVG and work without a GPU. They take a Type C `profile`.

```tsx
import {
  ConeDiagramGraph,
  IntensityGraph,
  IntensityTableGraph,
  IsoluxGraph,
  LuminanceTableGraph,
} from '@ies-tools/viewer/react';

<IntensityGraph profile={profile} principalPlanes />;
<IntensityGraph profile={profile} projection="cartesian" planes={[0, 45, 90]} logScale />;
<IntensityGraph profile={profile} projection="topology" surface="both" upAxis="z" />;
<IsoluxGraph profile={profile} mountingHeight={3} extent={[12, 8]} aimAngle={30} />;
<ConeDiagramGraph profile={profile} maxDistance={6} />;
<LuminanceTableGraph profile={profile} />;
<IntensityTableGraph profile={profile} unit="cd/klm" maxColumns={12} />;
```

See [Charts](./graphs.md) for what each one shows and its props.

## File information panel

`PhotometryInfoPanel` and `ValidationChecks` show a file's properties and validation results, the same as the VS Code information panel. They take the inspection and validation results from `@ies-tools/core`.

The panel leads with the luminaire identity and a compact overview of light output, input power, efficacy, and peak intensity. Light source characteristics and available beam widths are expanded; flux accounting, distribution ratios, zonal lumens, file geometry, and raw metadata are collapsed. Successful validation stays compact with visible issue counts, while failures expand automatically. Alternative LDT configurations expand when a selection is needed, and calculated summary cards stay hidden until a configuration is selected.

**Color** shows explicit source temperature metadata only, including recognized custom IES keywords. Missing values are omitted; the 3D renderer's 6500 K fallback is never inserted into inspection data. Calculated output is labeled as an estimate and kept distinct from declared lamp ratings. Numbers use a compact display format; the core inspection model retains its original precision.

```tsx
import { inspectParsedPhotometry, validatePhotometry } from '@ies-tools/core';
import { PhotometryInfoPanel } from '@ies-tools/viewer/react';
import '@ies-tools/viewer/styles.css';

export function FileInfo({ text, strict }: { text: string; strict: boolean }) {
  const validation = validatePhotometry(text, 'ies', strict);
  const inspection = validation.profile ? inspectParsedPhotometry(validation.profile) : null;
  return <PhotometryInfoPanel inspection={inspection} validation={validation} strict={strict} />;
}
```

Pass `onStrictChange` to show a **Strict validation** checkbox, and `fileName` or `fileSize` to show them in the panel. See the [API reference](./api/react/index.md) for every prop.

## Lamp configurations

An LDT file can hold several alternative lamp configurations. They are never added together. Single-configuration files need no choice. For several, either pass `lampSetIndex` (counting from 0) to `LightViewer`, or let the user pick:

```tsx
import { parseLDT, parsePhotometry } from '@ies-tools/core';

const native = parseLDT(text);
// Show native.lampSets to the user, then:
const document = parsePhotometry(text, 'ldt', { lampSetIndex: chosenIndex });
```

```tsx
<LightViewer
  src="/lights/luminaire.ldt"
  format="ldt"
  lampSetIndex={1}
  onLoad={(profile, info) => console.log(info.sourceFormat, info.document.source)}
/>
```

## Styling

Import the compiled stylesheet once for the settings panel and information panel:

```tsx
import '@ies-tools/viewer/styles.css';
```

A `.dark` ancestor switches to the dark palette. To match your app's colours, or to use your own Tailwind v4 build, see [Styling and themes](./styling.md). `ViewerSettingsPanel`, the gear panel's contents, is also exported for use on its own.

See the [`@ies-tools/viewer/react` API reference](./api/react/index.md) for every component and prop.
