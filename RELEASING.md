# Releasing

Releases are manual and maintainer-only. Merging to `main` never publishes.

## Running a Release

```sh
gh workflow run release.yml --ref main                  # release
gh workflow run release.yml --ref main -f dry_run=true  # preview only, publishes nothing
```

When there are no release-worthy commits since the last `v*` tag, the run is a no-op.

## What the Workflow Does

1. Refuses any ref other than `main`.
2. Runs the full CI workflow on the dispatched commit.
3. Stops if `main` has moved since the dispatch.
4. Installs, builds, and runs `pnpm release`, which is semantic-release.
5. semantic-release computes the next version, creates the `v<version>` tag and GitHub Release, and publishes.

Releases run one at a time and never cancel a publish in progress. npm packages publish through npm trusted publishing (GitHub OIDC), so no `NPM_TOKEN` is stored.

## Versioning

The version comes from the Conventional Commits since the last `v*` tag. The highest change wins:

- `feat` produces a minor release.
- `fix` and `perf` produce a patch release.
- `!` or a `BREAKING CHANGE:` footer produces a major release.
- Other types do not trigger a release.

Everything this repository publishes shares one version. `package.json` versions in source are development snapshots; the Git tag and the registry hold the released version. [GitHub Releases](https://github.com/bhouston/ies-tools/releases) is the changelog of record.

## One-Time Setup

1. On npmjs.com, open each package's Trusted Publisher settings, choose GitHub Actions, and enter organization or user `bhouston`, repository `ies-tools`, workflow filename `release.yml`, and environment name `npm`.
2. Protect `main`: require pull requests and the CI checks, allow merge commits, and block force pushes and deletion.
3. If the repository uploads coverage to Codecov, add the `CODECOV_TOKEN` repository secret.

## Recovery

Publishing is not atomic. If a run fails part way, compare the registry versions, the `v<version>` tag, and the workflow log, then finish what is missing from the same release commit. If publishing succeeded but the GitHub Release failed, create the release from the existing tag. Never republish a version, delete a published version, or move a release tag. Resolve the failure before dispatching another release.

## Repository Specifics

### Published Artifacts

- npm: `@ies-tools/core`, `@ies-tools/viewer`, and `@ies-tools/cli`, published in that order with `pnpm publish`. Each GitHub Release attaches their tarballs.
- VS Code Marketplace and Open VSX: `ies-vscode-extension` (`packages/vscode-extension`), published by `benhouston3d`.

The root `ies-monorepo` package is private and never published. Add each npm package's Trusted Publisher in One-Time Setup step 1. npm only attaches a trusted publisher to an existing package, so a new package needs one authenticated first publish.

### VS Code Extension

The extension shares the release version, which `release.config.js` pins in its `package.json`, but it is never published to npm. `scripts/release-vscode-extension.mjs` builds it, packages it with `vsce`, and publishes it to both registries. Add these repository secrets:

- `VSCE_PAT`: Azure DevOps personal access token for the `benhouston3d` publisher.
- `OVSX_PAT`: Open VSX access token.

### Website

After a real release (not a dry run), the `website` job calls `docs.yml` to build and deploy the documentation from the new `v*` tag. To redeploy the latest release, run `gh workflow run docs.yml --ref main` (optionally with `-f ref=v<version>`).

Enable GitHub Pages with source **GitHub Actions**, set the custom domain `ies-tools.ben3d.ca` in Settings, then Pages, and enforce HTTPS. Add a DNS `CNAME` record from `ies-tools.ben3d.ca` to `bhouston.github.io`. With Actions-based Pages the domain lives in repository settings, not a `CNAME` file.

### Local Validation

- `pnpm check:release` packs the production tarballs and exercises them in a clean temporary Node consumer.
- `pnpm --filter ies-vscode-extension exec vsce package --no-dependencies` verifies extension packaging.
- `pnpm docs:build` verifies documentation links.
