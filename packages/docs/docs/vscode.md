---
sidebar_position: 2
sidebar_label: VS Code extension
---

# VS Code extension

**An IES & EULUMDAT Viewer, Inspector, and Syntax Highlighter.**

The **IES and LDT Light Viewer** extension previews IES and EULUMDAT files in VS Code. It shows the light on a floor and wall, draws photometric charts, lists the file's properties and validation results, and converts between formats.

![The light viewer's 3D view of a track light 3 m above the floor beside a wall, switching to Measurement mode with isolux contours and a legend, then stepping through the polar, Cartesian, topology, isolux, cone, luminance and intensity table tabs](/img/vscode-extension.gif)

## Install

Install **IES and LDT Light Viewer** from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=benhouston3d.ies-vscode-extension), or search for it in the Extensions view. From a terminal:

```sh
code --install-extension benhouston3d.ies-vscode-extension
```

VSCodium, Cursor and other editors that use Open VSX can install it from [Open VSX](https://open-vsx.org/extension/benhouston3d/ies-vscode-extension). The extension needs VS Code 1.85 or later.

## Preview a light

1. Open an `.ies` or `.ldt` file. The light preview is the default editor for these files.
2. Drag the scene to orbit and scroll to zoom. Click the light and drag it to change its height and distance from the wall; the arrow keys nudge a selected light and Escape deselects it.
3. Open the **gear menu** to show or hide the back wall and the blue beam guide lines, change the wall and floor distances, and choose tone mapping and exposure.

If a file opens as text instead, select **Open Light Preview** in the editor title bar, run **IES: Open Light Preview** from the Command Palette, or right-click the file in the Explorer and choose **Open Light Preview**.

From the preview, **Open as Text** in the title bar switches to the source. To edit while you watch, split the editor and keep the preview open in one group: it updates as you type, without saving.

## Charts

The tabs above the preview switch between the 3D view and these charts:

- **Polar** and **Cartesian:** intensity curves for the two main planes, with beam and field markers. Tick **Log scale** to see dim shoulders of the beam.
- **Topology:** a 3D surface of the intensity in every direction.
- **Isolux:** illuminance on the floor, using the floor distance from the gear menu as the mounting height.
- **Cone:** illuminance and beam and field diameters at 1 to 5 m.
- **Luminance:** average luminance at glare angles.
- **Intensity table:** the measured candela values.

See [Charts](./graphs.md) for how to read each one.

## File information and validation

The **File information** panel sits to the right of the preview, or below it in a narrow window. Its sections expand and collapse. It shows:

- format and version, photometric type, manufacturer, luminaire and lamp descriptions;
- power, declared lamp flux, and the luminaire flux calculated from the intensity table;
- efficacy, peak and nadir intensity, beam and field angles;
- downward and upward flux, light output ratios, downward flux fraction and the CIE flux code;
- zonal lumens, angle counts, dimensions, tilt and every metadata keyword.

Values declared in the file and values calculated from the intensity table are labelled separately.

The **Validation** section lists each error and warning with its code and field. Turn on **Strict validation** to treat warnings as failures too. If an edit breaks the file, the panel shows the new errors instead of the old statistics.

## Syntax highlighting

Open a file as text to see it highlighted. IES files use the **IES Photometric (LM-63)** language mode. It colors the format line, `[KEYWORD]` tags and values, user `[_KEYWORDS]`, `[MORE]` continuations, `TILT=` lines and numbers:

<img src="/img/vscode/ies-syntax.png" alt="Syntax highlighting of an IES LM-63 file header in the Dark Modern theme: the format line, bracketed keywords and values, a user keyword, a MORE continuation, the TILT=NONE line and numeric header and angle lines in distinct colors" width="686" />

LDT files use the **EULUMDAT (LDT)** language mode, which colors numeric lines differently from text lines:

<img src="/img/vscode/ldt-syntax.png" alt="Syntax highlighting of the top of an EULUMDAT file in the Dark Modern theme: text lines such as the manufacturer and luminaire name colored differently from the numeric lines between them" width="334" />

## Problems, hover, outline and CodeLens

In the text editor, the extension helps you read and fix the file:

- **Problems:** errors and warnings are underlined at the token that caused them and listed in the Problems panel with their codes. They update as you type.
- **Hover:** point at a number or header line to see which field it is and what it means, for example `Candela at horizontal 45°, vertical 30° (before multiplier)`.
- **Outline:** the Outline view and breadcrumbs list one entry per header field. Angle and intensity arrays appear as single entries, such as **Vertical angles (37)**.
- **CodeLens:** the first line shows a summary of flux, peak intensity, beam angles and efficacy, with an **Open Light Preview** link. If the file has errors, it shows the error count and opens the Problems panel instead.

These features work in untrusted workspaces. Turn each one off in [Settings](#settings).

## Convert files

Right-click one or more `.ies` or `.ldt` files in the Explorer and open **Convert Photometric File**. Choose **Convert to IES (LM-63)**, **Convert to EULUMDAT (.ldt)** or **Convert to JSON**. The option for the file's own format is hidden.

The same commands are in the Command Palette for the open file. They convert what's in the editor, including unsaved changes.

To convert a whole folder, right-click it and choose **Convert Folder…**. Pick a target format and whether to include subfolders. Files already in the target format are skipped, as are dot-folders and `node_modules`.

Each converted file is saved next to its source. If that file already exists, you choose:

- **Overwrite** the existing file;
- **Keep Both**, which saves `name (1).ies`, `name (2).ies` and so on;
- **Skip** this file.

To stop being asked, change `iesTools.convert.overwrite`.

When you convert an LDT file with several lamp configurations to IES, pick the configuration to use. Cancelling skips that file.

A notification reports how many files were converted and how many warnings there were. Warnings, such as fields the target format can't hold, are listed in the **IES Tools** output channel. A file that fails is reported without stopping the rest. See [Conversion](./conversion.md) for what each format keeps.

## Settings

| Setting                       | Default | What it does                                                                                                                    |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `iesTools.convert.overwrite`  | `ask`   | When a converted file already exists: `ask` (overwrite, keep both or skip), `always` overwrite, or `never` overwrite (skip it). |
| `iesTools.validation.enabled` | `true`  | Show validation errors and warnings in the editor and the Problems panel.                                                       |
| `iesTools.validation.strict`  | `false` | Report validation warnings as errors.                                                                                           |
| `iesTools.hover.enabled`      | `true`  | Explain the field under the cursor on hover.                                                                                    |
| `iesTools.codeLens.enabled`   | `true`  | Show the photometric summary and **Open Light Preview** link on the first line.                                                 |

## Requirements and diagnostics

The 3D preview needs hardware WebGL2 and Type C photometry. Type A and B files support inspection and validation in the information panel.

Initialization failures explain recovery steps directly in the preview. Parse errors also appear in the Problems panel with source locations. For LDT files with alternative lamp configurations, the selector above the preview lists the available choices; statistics and rendering use the chosen configuration rather than adding alternatives together.
