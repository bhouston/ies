---
sidebar_position: 9
---

# Styling and themes

The settings panel and file information panel use a shared set of colour tokens, so you can match them to your site or app. The 3D scene's background is always black; themes only change the controls and panels.

## React apps

Import the compiled stylesheet once:

```tsx
import '@ies-tools/viewer/styles.css';
import { LightViewer, PhotometryInfoPanel } from '@ies-tools/viewer/react';

<div className="dark">
  <LightViewer src="/luminaire.ies" settingsPanel="closed" />
</div>;
```

The stylesheet has a light palette by default and a dark one under a `.dark` ancestor. Override the [tokens](#tokens) after the import to use your own colours.

### Using your own Tailwind v4 build

If your app already compiles Tailwind v4, import the source theme instead of the compiled sheet:

```css
@import 'tailwindcss';
@import '@ies-tools/viewer/styles/viewer.css';
```

It maps utilities such as `bg-popover`, `text-foreground`, `border-border` and `ring-ring` to your tokens. Use either the compiled sheet or your own build, not both.

## The `<light-viewer>` element

The element brings its own styles, so you don't need to import a stylesheet. Its controls and panels read the `--ies-viewer-*` [tokens](#tokens) from the element or any ancestor, and use a dark theme for any you don't set:

```css
light-viewer {
  --ies-viewer-popover: #ffffff;
  --ies-viewer-popover-foreground: #202124;
  --ies-viewer-foreground: #202124;
  --ies-viewer-input: #f3f4f6;
  --ies-viewer-border: #9ca3af;
  --ies-viewer-ring: #2563eb;
}
```

Changing these, for example when the user switches your site's theme, restyles the controls straight away without reloading the viewer or losing its settings.

### Using your site's existing theme variables

The viewer ignores generic variables such as `--background` or `--foreground`, so your site's own theme never changes the viewer by accident. To use your palette, map it to the viewer's tokens. Each token must be a complete CSS colour. If your variables hold HSL channels such as `222 39% 11%`, wrap them in `hsl()`:

```css
light-viewer {
  --ies-viewer-background: hsl(var(--background));
  --ies-viewer-foreground: hsl(var(--foreground));
  --ies-viewer-card: hsl(var(--card));
  --ies-viewer-input: hsl(var(--input));
  --ies-viewer-primary: hsl(var(--primary));
  --ies-viewer-primary-foreground: hsl(var(--primary-foreground));
}
```

## Tokens

All tokens use the `--ies-viewer-` prefix. Colour tokens take a complete CSS colour, for example `#fff`, `rgb(…)`, `hsl(…)` or `oklch(…)`.

| Token                                                            | Used for                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `--ies-viewer-background`, `--ies-viewer-foreground`             | Panel background and text, and the selected chart tab        |
| `--ies-viewer-card`                                              | Chart tab bar and information panel sections                 |
| `--ies-viewer-popover`, `--ies-viewer-popover-foreground`        | The settings panel                                           |
| `--ies-viewer-primary`, `--ies-viewer-primary-foreground`        | Selected toggle buttons, checkboxes and other accents        |
| `--ies-viewer-muted-foreground`                                  | Secondary text and unselected tabs                           |
| `--ies-viewer-destructive`                                       | Errors                                                       |
| `--ies-viewer-border`, `--ies-viewer-input`, `--ies-viewer-ring` | Borders, toggle and input backgrounds, and focus rings       |
| `--ies-viewer-radius`                                            | Corner radius                                                |
| `--viewer-font-family`                                           | UI font; defaults to the inherited or system sans-serif font |

The stylesheet also defines `--ies-viewer-card-foreground`, `--ies-viewer-secondary`, `--ies-viewer-secondary-foreground`, `--ies-viewer-muted`, `--ies-viewer-accent` and `--ies-viewer-accent-foreground`, so you can set the full palette in one place.

In VS Code, the extension maps these tokens to your editor theme's colours, so the panels follow light and dark themes.
