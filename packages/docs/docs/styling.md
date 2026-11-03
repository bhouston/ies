---
sidebar_position: 9
---

# Styling and themes

The extension, React viewer and custom-element options panel share React UI components, Tailwind v4 utilities and theme tokens. This follows the styling infrastructure of mtlx. The Three.js scene always has a black background; UI color themes affect controls and information panels.

## React and Tailwind hosts

Import the compiled stylesheet once:

```tsx
import 'ies-viewer/styles.css';
import { LightViewer, PhotometryInfoPanel } from 'ies-viewer/react';

<div className="dark">
  <LightViewer src="/luminaire.ies" settingsPanel="closed" />
</div>;
```

The shared stylesheet defines light `:root` defaults and a `.dark` palette. Override the tokens after the stylesheet import to match your application. Apps with a Tailwind v4 build can use the source theme instead of the compiled sheet:

```css
@import 'tailwindcss';
@import 'ies-viewer/styles/viewer.css';
```

The source theme scans the published React components. Its `@theme inline` mappings make utilities such as `bg-popover`, `text-foreground`, `border-border` and `ring-ring` use host tokens. Import either the compiled entry or your own compiled Tailwind entry; do not load both unnecessarily.

## Custom-element controls

The self-contained `dist/light-viewer.js` bundle includes React and the compiled stylesheet. `import 'ies-viewer/element'` uses the same compiled CSS as a static JavaScript string, so bundler consumers need no runtime CSS loader. These consumers must install the React and React DOM peers. Importing the built module on a server without `HTMLElement` is supported.

The shadow-root stylesheet does not redefine the host's theme colors. It reads inherited custom properties with dark standalone fallbacks. For example:

```css
light-viewer {
  --popover: #ffffff;
  --popover-foreground: #202124;
  --foreground: #202124;
  --input: #f3f4f6;
  --border: #9ca3af;
  --ring: #2563eb;
}
```

Theme changes propagate through CSS without recreating the renderer or losing its settings. The built-in gear panel and the React `LightViewer` both use the exported `ViewerSettingsPanel` component. Source changes retain the React viewer's existing GPU controller and settings; removing a viewer releases its rendering resources and React controls.

## Shared tokens

The UI uses `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--border`, `--input`, `--ring` and `--radius`. `--viewer-font-family` can override the UI font; otherwise controls use the inherited VS Code font or a system sans-serif font.

The extension maps these tokens to VS Code editor, sidebar, input, dropdown, focus, link and validation colors. It bundles the resulting Tailwind CSS locally under its content security policy. No UI stylesheet or font is fetched from a CDN. Both light and dark editor themes therefore use the same components and layout with the editor's colors.
