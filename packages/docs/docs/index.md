---
slug: /
sidebar_position: 1
---

# ies

JavaScript and TypeScript tools for IES LM-63 and EULUMDAT photometric lighting files. Parse and inspect real luminaire data, preview light on a floor and wall, and embed the same viewer in a browser, React app, or VS Code.

The pnpm workspace follows [mtlx](https://github.com/bhouston/mtlx): `packages/core`, `packages/cli`, `packages/viewer`, and `packages/vscode-extension`, plus a React demo in `packages/website` and these Docusaurus docs.

- **@ies-tools/core**: IES/LDT parsing, validation, conversion, interpolation and photometric summaries, usable in Node and browsers.
- **@ies-tools/cli**: terminal inspection, validation, IES/LDT/JSON conversion, local previews, hardware-rendered PNGs and SVG/PNG chart exports.
- **@ies-tools/viewer**: Three.js viewer, `<light-viewer>` custom element and React components.
- **VS Code**: a local `.ies` or `.ldt` preview that updates when the file changes.

No account, authentication service, MCP server or cloud download service is required. File URLs fetched by browser components must allow access from your page's origin (CORS).

## Development

```sh
pnpm install
pnpm build
pnpm tsc
pnpm lint
pnpm test
pnpm dev
pnpm docs:build
```

See [Core](./core.md), [Conversion](./conversion.md), [Graphs](./graphs.md) and [CLI](./cli.md) for the current APIs and commands.

The demo accepts local IES and LDT files. Representative files from the three.js examples are in `fixtures/` with attribution.

Documentation builds produce a `github-pages` artifact in CI; the Documentation workflow deploys it on `main`. See the repository's CONTRIBUTING.md and RELEASING.md for contribution and release procedures.
