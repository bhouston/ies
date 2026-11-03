---
sidebar_position: 6
---

# VS Code extension

![The light preview in VS Code cycling through the 3D view and chart tabs](/img/vscode-extension.gif)

Build and package from the workspace:

```sh
pnpm install
pnpm build
pnpm --filter ies-vscode-extension package
code --install-extension packages/vscode-extension/ies-vscode-extension-0.1.0.vsix
```

Open an `.ies` or `.ldt` file to use the IES and LDT Light Viewer custom editor, or run **IES: Open Light Preview**. **Reopen Editor With → Text Editor** lets you edit the source; the preview refreshes with unsaved text changes.

The preview reuses the shared Three.js `<light-viewer>` element, with a floor, wall and black background, plus tabs for polar, Cartesian, topology and isolux charts. Its script is bundled into the extension, with no CDN or authentication dependency. File text is sent through the webview message protocol rather than interpolated into HTML. The webview uses a content security policy and restricts local resources to its media directory.

If a file cannot be parsed, the preview displays an error. Rendering requires hardware WebGL2 and Type C photometry. An invalid file remains editable in VS Code's text editor.

Marketplace and Open VSX publication run through the manual Release workflow after the publisher credentials are configured; see RELEASING.md in the repository.

EULUMDAT files with multiple alternative lamp configurations show a configuration selector above the preview. Choose a configuration explicitly; configurations are never summed and the first is not selected automatically. Single-configuration files display directly. Changing the file's source text refreshes its configuration labels; an out-of-range prior selection is cleared.

File text, format hints and configuration labels travel as validated structured messages. Labels are assigned through `textContent`, so manufacturer or lamp descriptions cannot become HTML or scripts. Source loading uses the shared parser and in-memory profile, with no intermediate IES serialization.

## File information and validation

The right-hand panel shares the core inspection/validation model with `ies inspect` and `ies validate`. It includes format/version, coordinate type, source and lamp descriptions, power, peak candela, declared and integrated flux, efficacy, downward/upward flux, light output ratios, downward flux fraction, CIE flux code, peak and nadir intensity, collapsible zonal lumens, principal-plane beam/field estimates, angular counts, dimensions, tilt, generation provenance and every metadata keyword. Native LDT alternative configurations remain separate and require a selection for calculated output.

Validation lists codes, severity, fields and messages. **Strict validation** makes warnings fail validation without changing their original severity. Invalid unsaved edits replace old statistics with the current errors; unsupported 3D coordinates can still be inspected. The layout places the panel to the right on wider webviews and below the preview on narrow ones.

The webview uses React, Tailwind v4 and `@ies-tools/viewer`'s shared theme stylesheet, with theme tokens mapped to VS Code's editor colors. Its scripts and compiled styles ship inside the VSIX and do not need a CDN.
