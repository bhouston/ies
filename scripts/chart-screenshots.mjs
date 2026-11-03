#!/usr/bin/env node
// Regenerates the chart screenshots in packages/docs/static/img/charts/ with the built CLI.
// Usage: pnpm build && pnpm docs:charts
// Not run in CI. Keep the alt text in sync with graphs.md and packages/cli/README.md.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = join(root, 'packages/cli/bin/cli.js');
const outDir = join(root, 'packages/docs/static/img/charts');

// Fixtures come from three.js examples (fixtures/THREE-LICENSE). The eulumdat-rs
// fixtures are AGPL test data and stay out of the docs (see THIRD_PARTY_NOTICES.md).
const BEGA_ASYMMETRIC = 'fixtures/02a7562c650498ebb301153dbbf59207.ies';
const TRACK_LIGHT = 'fixtures/1a936937a49c63374e6d4fbed9252b29.ies';
const SIZE = ['--width', '780', '--height', '840'];

const charts = [
  {
    name: 'polar',
    fixture: BEGA_ASYMMETRIC,
    args: ['--type', 'polar', ...SIZE],
    alt: 'Polar luminous intensity chart of the C0–C180 and C90–C270 planes with beam and field markers',
  },
  {
    name: 'cartesian',
    fixture: BEGA_ASYMMETRIC,
    args: ['--type', 'cartesian', ...SIZE],
    alt: 'Cartesian luminous intensity chart of the C0–C180 and C90–C270 planes with beam and field markers',
  },
  {
    name: 'polar-log',
    fixture: TRACK_LIGHT,
    args: ['--type', 'polar', '--log-scale', ...SIZE],
    alt: 'Log-scale polar intensity chart of a narrow-beam track light',
  },
  {
    name: 'cartesian-log',
    fixture: TRACK_LIGHT,
    args: ['--type', 'cartesian', '--log-scale', ...SIZE],
    alt: 'Log-scale Cartesian intensity chart of a narrow-beam track light',
  },
  {
    name: 'topology',
    fixture: BEGA_ASYMMETRIC,
    args: ['--type', 'topology', ...SIZE],
    alt: '3D luminous intensity topology surface',
  },
  {
    name: 'isolux',
    fixture: BEGA_ASYMMETRIC,
    args: ['--type', 'isolux', ...SIZE],
    alt: 'Isolux ground illuminance plot with labelled contours at 2 m mounting height',
  },
  {
    name: 'isolux-area',
    fixture: BEGA_ASYMMETRIC,
    args: ['--type', 'isolux', '--mounting-height', '6', '--extent', '30', '--resolution', '121', ...SIZE],
    alt: 'Isolux plot of a 30 m site at 6 m mounting height with 1-2-5 lux contours',
  },
  {
    name: 'cone',
    fixture: BEGA_ASYMMETRIC,
    args: ['--type', 'cone', '--width', '780', '--height', '900'],
    alt: 'Cone diagram with centre illuminance and beam and field diameters by distance',
  },
  {
    name: 'luminance',
    fixture: BEGA_ASYMMETRIC,
    args: ['--type', 'luminance', ...SIZE],
    alt: 'Glare-angle average luminance and intensity tables',
  },
  {
    name: 'intensity-table',
    fixture: BEGA_ASYMMETRIC,
    args: ['--type', 'intensity-table', '--max-columns', '10', '--max-rows', '19', '--width', '780', '--height', '640'],
    alt: 'Heat-tinted luminous intensity table',
  },
];

// The CLI never overwrites, so render into a temp directory and copy over the targets.
const tmp = mkdtempSync(join(tmpdir(), 'ies-charts-'));
try {
  for (const { name, fixture, args } of charts) {
    const file = join(tmp, `${name}.png`);
    execFileSync(process.execPath, [cli, 'chart', join(root, fixture), '-o', file, ...args], { stdio: 'inherit' });
    copyFileSync(file, join(outDir, `${name}.png`));
    console.log(`wrote packages/docs/static/img/charts/${name}.png`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
