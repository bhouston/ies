# IES Light Viewer for VS Code

Open an `.ies` file to preview its measured photometric distribution on a floor and wall against a black background. The preview uses the same `ies-viewer` rendering engine and `<light-viewer>` component as the browser and React packages.

- Drag to orbit and scroll to zoom.
- Use **Reopen Editor With → Text Editor** to inspect or edit the source. Opening the file side by side keeps the preview synchronized with unsaved edits.
- Run **IES: Open Light Preview** from the command palette or the Explorer context menu.
- Invalid or unsupported files display an error in the preview status bar.

The extension processes files locally. Its webview loads bundled resources with a restrictive Content Security Policy; it does not require authentication or a network service. Hardware WebGL is required for the 3D preview.

## Development

From the repository root, run `pnpm install` and `pnpm build`. Run `pnpm --filter ies-vscode-extension package` to create the VSIX, then install it with **Extensions: Install from VSIX**. For an Extension Development Host, launch VS Code with `--extensionDevelopmentPath` pointing to this package.

Publishing uses the repository's manually dispatched release workflow. Marketplace publisher: `benhouston3d`. Marketplace and Open VSX credentials are configured as repository secrets; see the root release guide.
