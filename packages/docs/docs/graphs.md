---
sidebar_position: 4
sidebar_label: Charts
title: Charts
---

# Charts

ies-tools draws the standard photometric charts for any Type C IES or LDT file. This page explains what each chart shows and how to read it, then how to get it.

You can see every chart in three places:

- **The viewer's tabs**, in [VS Code](./vscode.md#charts), [`ies view`](./cli.md#preview-in-a-browser) and [`<light-viewer charts="true">`](./light-viewer.mdx#chart-tabs).
- **`ies chart`**, which saves a chart as SVG or PNG. See [Export charts](./cli.md#export-charts).
- **React components** from `@ies-tools/viewer/react`, which draw SVG and need no GPU. See [React components](./react.md).

Most examples below use an asymmetric BEGA luminaire; the log-scale examples use a narrow-beam track light.

## Intensity curves (polar and Cartesian)

<p>
<img src="/img/charts/polar.png" alt="Polar luminous intensity chart of the C0–C180 and C90–C270 planes with beam and field markers" width="49%" />
<img src="/img/charts/cartesian.png" alt="Cartesian luminous intensity chart of the C0–C180 and C90–C270 planes with beam and field markers" width="49%" />
</p>

_Principal planes of the BEGA luminaire, with dashed beam (50 %) and dotted field (10 %) markers._

These charts show how bright the light is, in candela, in each direction through a vertical slice. 0° points straight down and the curve's distance from the centre is the intensity.

- **Planes.** Each curve is one complete slice through the light. The C0–C180 plane runs along the luminaire and C90–C270 across it. A symmetric light draws two matching halves; an asymmetric one, like the BEGA luminaire above, doesn't. Both halves are measured data, not a mirror image.
- **Beam and field markers.** The dashed lines mark where the intensity drops to 50 % of the peak: the angle between them is the **beam angle**. The dotted lines mark 10 % of the peak: the **field angle**. Lights with several lobes or no clear edge get no markers.
- **Polar vs Cartesian.** The polar chart is the familiar view. The Cartesian chart plots the same curves on angle and candela axes, which makes narrow beams easier to read.

The caption gives the peak of the curves shown, which can be lower than the peak of the whole light if its brightest direction is in another plane.

**Get it:**

- Viewer: the **Polar** and **Cartesian** tabs.
- CLI: `ies chart luminaire.ies -o polar.svg` or `--type cartesian`. Add `--angle 45` for one plane, or `--axis horizontal --angle 60` to sweep around the light at a fixed vertical angle.
- React:

```tsx
import { IntensityGraph } from '@ies-tools/viewer/react';

// Both principal planes, C0–C180 and C90–C270.
<IntensityGraph profile={profile} principalPlanes />;

// Three planes overlaid on Cartesian axes.
<IntensityGraph profile={profile} projection="cartesian" planes={[0, 45, 90]} />;

// Sweep around the light at three fixed vertical angles.
<IntensityGraph profile={profile} axis="horizontal" planes={[30, 60, 90]} />;
```

| Prop              | Meaning                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `projection`      | `polar` (default), `cartesian` or `topology`                                                                   |
| `axis`            | `vertical` (default) slices through a C-plane; `horizontal` sweeps C from 0° to 360° at a fixed vertical angle |
| `angle`           | The C-plane (vertical axis) or vertical angle (horizontal axis) in degrees; default 0                          |
| `planes`          | One to eight angles to overlay; takes precedence over `angle` and `principalPlanes`                            |
| `principalPlanes` | Show C0–C180 and C90–C270                                                                                      |
| `logScale`        | Log intensity scale (see below)                                                                                |
| `samples`         | Points per curve; default 361, 3–1441, odd for vertical slices                                                 |
| `lampTilt`        | IES `TILT` lamp-tilt correction angle in degrees; default 0                                                    |

### Log scale

<p>
<img src="/img/charts/polar-log.png" alt="Log-scale polar intensity chart of a narrow-beam track light" width="49%" />
<img src="/img/charts/cartesian-log.png" alt="Log-scale Cartesian intensity chart of a narrow-beam track light" width="49%" />
</p>

_`--log-scale` on a rotationally symmetric 15° track light, so both planes coincide; the shoulders below 1 % of the peak become visible._

On a normal scale, a narrow beam is a thin spike and everything outside it looks like zero. The log scale spreads intensity over three decades, from the peak down to 1/1000 of it, so you can see dim spill and glare outside the beam. The rings are labelled 1, 2 and 5 times each power of ten.

**Get it:** tick **Log scale** on the Polar or Cartesian tab, pass `--log-scale` to `ies chart`, or set `logScale` on `IntensityGraph`.

## Intensity topology

<p>
<img src="/img/charts/topology.png" alt="3D luminous intensity topology surface" width="49%" />
</p>

_Candela-scaled surface of the BEGA luminaire, orthographic, Y up._

The topology is a 3D surface whose distance from the centre in each direction is the intensity in that direction. Colour also shows intensity. It gives you the shape of the whole distribution at once, rather than one slice at a time.

**Get it:**

- Viewer: the **Topology** tab.
- CLI: `ies chart luminaire.ies -o topology.png --type topology --up-axis z`.
- React:

```tsx
<IntensityGraph
  profile={profile}
  projection="topology"
  upAxis="z"
  topologyProjection="perspective"
  viewAzimuth={35}
  viewElevation={25}
  surface="both"
/>
```

| Prop                                     | Meaning                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `upAxis`                                 | Which axis points up: `x`, `y` (default) or `z`                         |
| `surface`                                | `filled`, `wireframe` or `both` (default)                               |
| `topologyProjection`                     | `orthographic` (default) or `perspective`                               |
| `viewAzimuth`, `viewElevation`           | Camera angles in degrees; default 45° and 30°                           |
| `horizontalSegments`, `verticalSegments` | Surface resolution; default 36 each. Increase it for very narrow beams. |

## Isolux ground plot

<p>
<img src="/img/charts/isolux.png" alt="Isolux ground illuminance plot with labelled contours at 2 m mounting height" width="49%" />
<img src="/img/charts/isolux-area.png" alt="Isolux plot of a 30 m site at 6 m mounting height with 1-2-5 lux contours" width="49%" />
</p>

_Left: 2 m mounting height over 10 m. Right: `--mounting-height 6 --extent 30 --resolution 121`, with 1–50 lx contours._

The isolux plot shows how much light lands on the ground, in lux, with the luminaire mounted above the centre. Colour shows illuminance, and a marker shows the point directly below the light.

- **Contours.** Each labelled line joins points with the same illuminance, like the contour lines on a map. By default they follow a 1, 2, 5, 10, 20, 50 lux series, starting at 1 lx.
- **Colour scale.** By default, colour follows a log scale so faint spill at 1–5 lx is still visible next to a bright centre. Choose a linear scale to compare bright areas.
- **Statistics.** The caption lists the peak, minimum and mean illuminance over the plotted area, and the uniformity **U0 = Emin / Eavg**. A U0 close to 1 means even lighting.

The plot counts direct light only. It doesn't include reflections from walls, obstructions or the size of the luminaire.

**Get it:**

- Viewer: the **Isolux** tab, using the floor distance from the gear menu as the mounting height.
- CLI: `ies chart luminaire.ies -o floor.png --type isolux --mounting-height 6 --extent 30`, with `--contours 5,10,20` for your own levels or `--min-contour 0.5` to start the series lower.
- React:

```tsx
import { IsoluxGraph } from '@ies-tools/viewer/react';

<IsoluxGraph
  profile={profile}
  mountingHeight={3}
  extent={[12, 8]}
  resolution={61}
  aimAngle={30}
  azimuth={90}
  contourLevels={[5, 10, 20, 50]}
/>;
```

| Prop                 | Meaning                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `mountingHeight`     | Height of the light above the ground in metres; default 2; 0.01–10,000                                                        |
| `extent`             | Width and depth of the plotted area in metres, centred below the light: a number for a square or `[width, depth]`; default 10 |
| `resolution`         | Grid points per side: a number or `[columns, rows]`; default 51; 2–201                                                        |
| `aimAngle`           | Tilts the light away from straight down, 0–180°; default 0                                                                    |
| `azimuth`            | Turns the light (and its C0 plane) around the vertical axis, −360–360°; default 0                                             |
| `lampTilt`           | IES `TILT` lamp-tilt correction angle, −180–180°; default 0. Aiming doesn't change it.                                        |
| `contourLevels`      | Your own increasing lux levels, up to 32; `[]` hides contours                                                                 |
| `minContour`         | Lowest level of the automatic 1-2-5 series in lux; default 1                                                                  |
| `colorScale`         | `log` (default) or `linear`                                                                                                   |
| `heatmap`            | Show the coloured grid; default true                                                                                          |
| `className`, `style` | SVG styling                                                                                                                   |

## Cone diagram

<p>
<img src="/img/charts/cone.png" alt="Cone diagram with centre illuminance and beam and field diameters by distance" width="49%" />
</p>

The cone diagram answers "how big is the pool of light, and how bright is it, at a given distance?" For each distance from 1 m up to 5 m, it lists:

- **E centre:** the illuminance at the centre of the beam, on a surface facing the light;
- the **beam diameter** (50 % of peak) and **field diameter** (10 % of peak), in both the C0–C180 and C90–C270 planes.

The drawing shows the beam and field cones from the side. A diameter shows as — when the beam has no clear edge or spreads past horizontal.

**Get it:** the **Cone** tab, `ies chart luminaire.ies -o cone.svg --type cone --max-distance 8`, or `<ConeDiagramGraph profile={profile} maxDistance={8} />`. Pass `distances` instead for your own list.

## Glare luminance table

<p>
<img src="/img/charts/luminance.png" alt="Glare-angle average luminance and intensity tables" width="49%" />
</p>

This table shows how bright the luminaire looks, in cd/m², when seen from the angles where glare matters: 45° to 85° from straight down, all the way around. It divides the intensity by the visible area of the luminous opening declared in the file. A second table shows the intensity at the same angles.

If the file declares no luminous area, the table shows a message instead of luminance values.

**Get it:** the **Luminance** tab, `ies chart luminaire.ies -o glare.png --type luminance`, or `<LuminanceTableGraph profile={profile} />`. Change the angles with the `gammas` and `cPlanes` props.

## Intensity table

<p>
<img src="/img/charts/intensity-table.png" alt="Heat-tinted luminous intensity table" width="49%" />
</p>

_The intensity table thinned with `--max-columns 10 --max-rows 19`._

The intensity table lists the measured values: vertical angles (γ) down the side, C-planes across the top. Cells are tinted by brightness. Show values in candela (`cd`) or per 1000 lamp lumens (`cd/klm`); files with absolute photometry have no lamp rating, so they stay in candela.

Large tables scroll in the viewer tab. For a fixed-size image, keep fewer evenly spaced angles; the first and last angles are always kept.

**Get it:** the **Intensity table** tab, `ies chart luminaire.ies -o table.png --type intensity-table --unit cd/klm --max-columns 12 --max-rows 19`, or:

```tsx
import { IntensityTableGraph } from '@ies-tools/viewer/react';

<IntensityTableGraph profile={profile} unit="cd/klm" maxColumns={12} />;
```

The cone, luminance and intensity-table charts need Type C photometry; other types show a message instead of values.

## Chart data in your own code

The numbers behind every chart come from `@ies-tools/core`, which runs in Node and the browser without React or a GPU. Use it to draw charts with another library or to export the values. See [Chart data](./core.md#chart-data).

## How it's calculated

All charts use absolute candela, after the file's multipliers, and the same interpolation between measured angles. Angles are in degrees and lengths in metres.

**Intensity curves.** A vertical slice at C = `angle` uses the measured C-plane on one side of nadir and C = `angle + 180°` on the other. Curves are sampled uniformly (361 points by default) plus every measured angle, so narrow peaks on irregular grids aren't missed.

**Beam and field angles.** In each slice, the peak is the brightest measured direction. The beam edges are where intensity crosses 50 % of that peak on each side, and the field edges where it crosses 10 %, interpolated between measured angles. These follow the [IES beam-angle](https://ies.org/definitions/beam-angle/) and [field-angle](https://ies.org/definitions/field-angle/) definitions. They're estimates from the two principal planes, not certified manufacturer values.

**Log scale.** radius = log10(I / Imin) / 3 × R, with Imin = Imax / 1000. Intensities at or below Imin sit at the centre.

**Topology.** The surface is sampled on a regular angular grid (36 × 36 by default), so its caption reports the sampled peak.

**Isolux.** The light is at height h above the ground. For each grid point, the direction to it is turned into the luminaire's own angles, allowing for aiming, and:

```text
E (lux) = I (candela) × cos(angle of incidence) / distance²
```

Aiming tilts the light by `aimAngle` from straight down towards `azimuth`, measured from +X towards +Z. The mean and U0 use the grid points, not an integrated area average. Contours are traced through the grid with marching squares, so finer `resolution` gives smoother lines. The automatic series runs from `minContour` up to just below the peak, at most 10 levels, dropping the lowest first.

**Cone diagram.** E centre = I(γ = 0) / d². Each diameter is d × (tan γright − tan γleft), where γleft and γright are the signed 50 % or 10 % crossing angles on each side of the peak.

**Glare luminance.** L(C, γ) = I(C, γ) / A, where A is the projected area of the luminous opening seen from that direction: A = A_bottom × cos γ + A_side(C) × sin γ. For a rectangular opening, the side silhouette from plane C is height × (width × |cos C| + length × |sin C|), with length along C0–C180. A circular opening of diameter d has bottom area π d² / 4 and side area height × d. Dimensions in feet are converted to metres.

**Intensity table.** `cd/klm` divides by the declared lamp flux in thousands of lumens. Each cell's tint is proportional to √(value / peak).
