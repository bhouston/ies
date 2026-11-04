# Contributing

These rules apply to every contributor, human or AI agent (Claude, Codex, and others). This file is the single source of truth for the workflow; `AGENTS.md` and `CLAUDE.md` only point here.

## Issue → branch → PR

1. **Start with an issue.** Before a feature, fix, or other tracked change, open a GitHub issue (or reuse one that already covers it) with the problem, motivation, constraints, and testable acceptance criteria. Agents use `gh issue create` with the same sections.
2. **Branch from `main`.** Fetch and branch from current `origin/main`, named `<type>/<issue>-<short-description>` (for example `feat/42-batch-export`). Never commit directly to `main`. Use a separate worktree when you have unrelated local changes.
3. **Commit with Conventional Commits** (see below). Reference the issue in the commit body where useful.
4. **Run the local checks** below and fix failures before opening the PR.
5. **Open a PR against `main`** with a Conventional Commit title, `Closes #<issue>` in the body, a description of the resulting behavior, and the validation you ran.
6. **Merge only on green CI.** Every required check must pass. PRs are merged with merge commits (`gh pr merge --merge`); never squash or rebase-merge. Do not merge your own PR unless the maintainer asked you to.

`main` is the default branch and the only integration branch. There are no long-lived release, promotion, or sync branches.

## Commit format

Use `type(optional-scope): description` in the imperative mood. Allowed types: `feat`, `fix`, `perf`, `docs`, `chore`, `refactor`, `test`, `style`, `build`, `ci`, `revert`.

- `feat:` produces a minor release.
- `fix:` and `perf:` produce a patch release.
- `feat!:` (any type with `!`) or a `BREAKING CHANGE:` footer produces a major release.
- Other types do not trigger a release on their own.

Husky runs commitlint on every commit after `pnpm install`. CI checks the PR title and every commit in the PR. Git-generated merge commits are exempt.

## Local checks

Use the Node version in `.nvmrc` and the pnpm version pinned in `package.json` (`packageManager`).

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm tsc
pnpm lint
pnpm test
```

The Husky pre-commit hook formats and lints staged files (`oxfmt`, `oxlint --fix`) and type-checks the workspace. CI runs the same checks plus any repository-specific gates, such as coverage floors, bundle-size budgets, package-content checks, and a dependency audit; see `.github/workflows/ci.yml`. Explain any intentional threshold change in the PR.

### Hardware GPU capture test

`packages/cli/src/capture.gpu.test.ts` drives `<light-viewer>` `whenReady()`/`toBlob()` in a real browser. CI has no GPU, so it only runs when you opt in:

```sh
pnpm build
IES_GPU_TESTS=1 pnpm test capture.gpu
```

It needs an installed Chrome or Edge (set `IES_BROWSER` to another executable) and a hardware GPU; it fails if WebGL reports a software renderer such as SwiftShader. Run it before a release and after any change to the viewer's rendering, capture or readiness code (`packages/viewer/src/viewer.ts`, `readiness.ts`, `element.ts` or the React `LightViewer`). The React handle shares the element's readiness and capture code, which jsdom tests cover with a mocked GPU.

## Releases

Merging to `main` never publishes. A release is a separate, deliberate step that the maintainer triggers whenever the changes accumulated on `main` should ship:

```sh
gh workflow run release.yml --ref main                  # release
gh workflow run release.yml --ref main -f dry_run=true  # preview only, publishes nothing
```

The Release workflow refuses any ref other than `main`, re-runs CI on the dispatched commit, and then uses semantic-release to compute the next version from the Conventional Commits since the last release tag, generate release notes, create the tag and GitHub Release, and publish:

- npm packages, through npm trusted publishing (GitHub OIDC, no `NPM_TOKEN`);
- VS Code extensions, where the repository has one, to the VS Code Marketplace and Open VSX.

When there are no release-worthy commits, the run is a no-op. Never bump versions, edit changelogs, or push release tags by hand.

## Security

Report vulnerabilities privately through GitHub's private vulnerability reporting (see `SECURITY.md` where present), never in a public issue.

## Workspace and documentation

| Directory                   | Role                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| `packages/core`             | Dependency-free parsing, validation, conversion and calculations |
| `packages/viewer`           | Three.js renderer, custom element and React UI                   |
| `packages/cli`              | Terminal commands and image exports                              |
| `packages/vscode-extension` | VS Code language features and preview                            |
| `packages/website`          | Vite/React workbench; run `pnpm dev`                             |
| `packages/docs`             | User documentation; run `pnpm --filter ies-docs start`           |

Use the root and published-package READMEs to help developers evaluate and install the tools. Keep Docusaurus guides focused on user tasks; generate API and CLI reference from source comments and command definitions. Put contributor setup here and registry administration in RELEASING.md.

Run `pnpm docs:build` to generate reference pages and check documentation links. The Documentation workflow deploys the site on pushes to `main`. Its live viewer demos use the standalone viewer built from the same commit, copied into the documentation static assets during generation. Run `pnpm build` before starting or building the docs. This deployment does not publish npm packages; those still require the Release workflow. Representative fixtures and their licenses are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Regenerate chart screenshots with `pnpm build && pnpm docs:charts`; this is not run in CI. To try the extension from source, run `pnpm --filter ies-vscode-extension package` after building, then install the resulting VSIX from `packages/vscode-extension/` using VS Code's **Install from VSIX** action.

### Consuming the packages

- **Published packages (recommended).** Install `@ies-tools/core` and `@ies-tools/viewer` from npm. They ship compiled JavaScript and declarations and need no TypeScript configuration from this repository.
- **Source integration (supported for `core`, `viewer`, `cli` and `vscode-extension`).** You can add this repository as a submodule and list those packages in a parent pnpm workspace. Install `@types/node` and `typescript` in the parent workspace; TypeScript finds them through normal ancestor `node_modules` resolution, so no symlinks or submodule edits are needed. Build with the parent's filters, for example `pnpm --filter @ies-tools/cli... build` or `pnpm --filter ies-vscode-extension... build`, or add the packages to the parent's `tsc -b` references. `core`, `viewer` and `cli` are `composite`; `viewer` references `core`, and `cli` and `vscode-extension` reference both. `tsc -b` only type-checks and emits declarations: the viewer's custom-element bundle (`dist/light-viewer.js`), the CLI's `media/light-viewer.js` and the extension's esbuild bundles and CSS come from each package's `build` script, so run `build` when you need them. The extension is a `noEmit` leaf project, so nothing can reference it. Packages still extend `tsconfig.node.json` and `tsconfig.base.json` from the repository root, so keep the whole checkout.
- **Checking source integration.** There is no automated check. To verify by hand, export a clean copy into `submodules/ies-tools` of an empty directory, add a root `package.json` with only `@types/node` and `typescript`, and a `pnpm-workspace.yaml` that lists the four packages and allows the same builds as this repository (`esbuild`, `sharp`). Then run `pnpm install`, both filtered builds, and `tsc -b` on `packages/cli` and `packages/vscode-extension` with every `dist` removed.

### VS Code extension internals

- The preview is a webview that reuses the bundled `<light-viewer>` script; it loads no CDN resources. File text, format hints and lamp-configuration labels are sent as validated structured messages, never interpolated into HTML, and labels are assigned through `textContent`.
- The webview uses a content security policy and restricts local resources to its media directory.
- The webview UI is React with Tailwind v4 and `@ies-tools/viewer`'s theme stylesheet; the compiled CSS ships in the VSIX, and the theme tokens are mapped to VS Code editor colors.
- Diagnostics, hover, outline and CodeLens come from `describePhotometrySource` in `@ies-tools/core`. Parse results are cached per document version, and diagnostics refresh 250 ms after an edit.
- Conversion uses the same `@ies-tools/core` serializers as `ies convert` and writes through `vscode.workspace.fs`, so remote and virtual workspaces work.

## Coverage

Run `pnpm test --coverage && pnpm coverage:report`. Open `coverage/index.html` for file-level HTML and `coverage/packages/summary.md` for package-level statements, branches, functions and lines. CI uploads the full report as the `coverage` artifact and adds the package table to its job summary. The Documentation workflow publishes the same reports at `/coverage/`, with package statement badges under `/coverage/packages/`.

The report counts all included package source, including untested files, and aggregates covered/total counters rather than averaging percentages. Badges describe the current deployed `main` tests, not necessarily the latest published npm version. They measure code execution, not visual correctness or photometric accuracy. Monthly npm downloads include automation and dependencies and should not be described as user counts.

`scripts/coverage-thresholds.json` is the only source of package floors; the report prints each floor beside the measured value and exits nonzero when any package falls below one. The floors started about two percentage points below the initial Node 24 baseline, rounded down to whole percentages for platform differences (for example, the CLI baseline of 61.74% statements became a 59% floor). The website has no tests and is reported at zero with zero floors until coverage is introduced. Raise floors as coverage improves; explain any reduction in the PR. Missing package coverage fails the reporting step.
