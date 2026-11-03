---
sidebar_position: 6
---

# VS Code extension

Build and package from the workspace:

```sh
pnpm install
pnpm build
pnpm --filter ies-vscode-extension package
code --install-extension packages/vscode-extension/ies-vscode-extension-0.1.0.vsix
```

Open an `.ies` file to use the IES Light Viewer custom editor, or run **IES: Open Light Preview**. **Reopen Editor With → Text Editor** lets you edit the source; the preview refreshes with unsaved text changes.

The preview reuses the shared Three.js `<light-viewer>` element, with a floor, wall and black background. Its script is bundled into the extension, with no CDN or authentication dependency. File text is sent through the webview message protocol rather than interpolated into HTML. The webview uses a content security policy and restricts local resources to its media directory.

If a file cannot be parsed, the preview displays an error. Rendering requires hardware WebGL2 and Type C photometry. An invalid file remains editable in VS Code's text editor.

Marketplace and Open VSX publication run through the manual Release workflow after the publisher credentials are configured; see RELEASING.md in the repository.
