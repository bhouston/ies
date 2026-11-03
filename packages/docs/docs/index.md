---
slug: /
sidebar_position: 1
---

# ies

JavaScript and TypeScript tools for IES LM-63 photometric lighting files. Parse and inspect real luminaire data, preview light on a floor and wall, and embed the same viewer in a browser, React app, or VS Code.

The pnpm workspace follows [mtlx](https://github.com/bhouston/mtlx): `packages/core`, `packages/cli`, `packages/viewer`, and `packages/vscode-extension`, plus a React demo in `packages/website` and these Docusaurus docs.

- **ies-core**: parsing, validation, interpolation and photometric summaries, usable in Node and browsers.
- **ies-cli**: terminal inspection, validation, JSON conversion and a local preview.
- **ies-viewer**: Three.js viewer, `<light-viewer>` custom element and React components.
- **VS Code**: a local `.ies` preview that updates when the file changes.

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

The demo accepts a local IES file. Representative files from the three.js examples are in `fixtures/` with attribution.

Documentation builds produce a `github-pages` artifact in CI; the Documentation workflow deploys it on `main`. See the repository's CONTRIBUTING.md and RELEASING.md for contribution and release procedures.
