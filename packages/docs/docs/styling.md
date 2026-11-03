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

The element brings its own styles, so you don't need to import a stylesheet. Its settings panel reads colour tokens from the page, and uses a dark theme for any you don't set:

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

Changing these, for example when the user switches your site's theme, restyles the controls straight away without reloading the viewer or losing its settings.

## Tokens

| Token                               | Used for                                                     |
| ----------------------------------- | ------------------------------------------------------------ |
| `--background`, `--foreground`      | Panel background and text                                    |
| `--card`                            | Information panel sections                                   |
| `--popover`, `--popover-foreground` | The settings panel                                           |
| `--primary`                         | Checkboxes and other accented controls                       |
| `--muted-foreground`                | Secondary text                                               |
| `--destructive`                     | Errors                                                       |
| `--border`, `--input`, `--ring`     | Borders, input backgrounds and focus rings                   |
| `--radius`                          | Corner radius                                                |
| `--viewer-font-family`              | UI font; defaults to the inherited or system sans-serif font |

The stylesheet also defines `--card-foreground`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--accent` and `--accent-foreground`, so you can set the full palette in one place.

In VS Code, the extension maps these tokens to your editor theme's colours, so the panels follow light and dark themes.
