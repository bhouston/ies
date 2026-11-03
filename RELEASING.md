# Releases

Releases follow the mtlx workflow: merge reviewed changes with green CI, then manually dispatch `release.yml` against `main`. Merging never publishes packages.

```sh
gh workflow run release.yml --ref main -f dry_run=true
gh workflow run release.yml --ref main
```

Semantic-release determines a shared version from Conventional Commits, publishes `ies-core`, `ies-viewer`, and `ies-cli` in dependency order, creates a GitHub Release with package tarballs, and publishes the extension to VS Code Marketplace and Open VSX.

## One-time registry setup

1. Claim the npm package names `ies-core`, `ies-viewer`, and `ies-cli` under the intended npm account. If a name is unavailable, rename it consistently before releasing. The repository being public does not reserve npm names.
2. Configure npm trusted publishing for each package: GitHub owner `bhouston`, repository `ies`, workflow `release.yml`, environment `npm`. Create the repository's `npm` environment and configure any desired reviewers. First publication may require registry-side setup or an initial authenticated publication before trusted publishing can be registered.
3. Ensure the VS Code Marketplace publisher `benhouston3d` and matching Open VSX namespace permit this extension. Add `VSCE_PAT` and `OVSX_PAT` repository secrets. Tokens are never stored in source.
4. Enable GitHub Pages with source **GitHub Actions** for documentation. Builds are also uploaded as GitHub artifacts in CI.

The release workflow validates its ref, reruns CI and refuses a stale `main` dispatch. It needs `contents: write` and `id-token: write` for GitHub releases and npm OIDC. Node 24 and the pinned pnpm version are installed by Actions.

Run `pnpm check:release` to pack production tarballs and exercise them in a clean temporary Node consumer. Run `pnpm --filter ies-vscode-extension exec vsce package --no-dependencies` to verify extension packaging. Run `pnpm docs:build` to verify documentation links.

Do not manually edit versions, changelogs or release tags. A dry run publishes nothing. Registry credentials and trusted publishing must be configured before the first real release.
