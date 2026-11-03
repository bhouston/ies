// Verify actual published tarballs in a clean production consumer.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const consumer = mkdtempSync(join(tmpdir(), 'ies-release-'));
try {
  const tarballs = ['core', 'viewer', 'cli'].map((name) => {
    const cwd = join(root, 'packages', name);
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    execFileSync('pnpm', ['pack', '--pack-destination', consumer], { cwd, stdio: 'pipe' });
    return join(consumer, `${pkg.name}-${pkg.version}.tgz`);
  });
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync(
    'npm',
    ['install', '--omit=dev', '--no-audit', '--no-fund', ...tarballs, 'react@^19.0.0', 'react-dom@^19.0.0'],
    {
      cwd: consumer,
      stdio: 'inherit',
    },
  );
  for (const name of ['core', 'viewer', 'cli']) {
    const files = readdirSync(join(consumer, 'node_modules', `ies-${name}`, 'dist'), { recursive: true });
    assert.ok(files.includes('index.js'), `${name} has an entry point`);
    assert.ok(
      files.every((file) => !String(file).includes('.test.') && !String(file).endsWith('.tsbuildinfo')),
      `${name} excludes tests and build metadata`,
    );
  }
  writeFileSync(
    join(consumer, 'check.mjs'),
    `
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseIES, parsePhotometry, sampleIntensity, serializeIES, serializeLDT, inspectPhotometry, validatePhotometry } from 'ies-core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as viewer from 'ies-viewer';
import * as react from 'ies-viewer/react';
import * as graphs from 'ies-viewer/graphs';
const profile = parseIES(readFileSync(process.argv[2], 'utf8'));
assert.ok(sampleIntensity(profile, 0, 0) >= 0);
assert.ok(Object.keys(viewer).length > 0);
assert.ok(react.LightViewer);
assert.ok(react.IntensityGraph);
assert.ok(react.IsoluxGraph);
assert.ok(react.ViewerSettingsPanel);
assert.ok(react.PhotometryInfoPanel);
assert.match(readFileSync(new URL(import.meta.resolve('ies-viewer/styles.css')), 'utf8'), /tailwindcss/);
const styles = await import(new URL('./elementStyles.js', import.meta.resolve('ies-viewer')).href);
assert.ok(styles.ELEMENT_STYLES.length > 100);
const sourceText = readFileSync(process.argv[2], 'utf8');
const validation = validatePhotometry(sourceText, 'ies');
const inspection = inspectPhotometry(sourceText, 'ies');
assert.match(renderToStaticMarkup(createElement(react.PhotometryInfoPanel, { inspection, validation })), /Integrated luminaire flux/);
assert.ok(graphs.buildIntensityCurves(profile, { principalPlanes: true }).curves.length === 2);
const ground = graphs.buildIsoluxGrid(profile, { resolution: 5 });
assert.ok(Number.isFinite(ground.maximum));
assert.ok(Array.isArray(graphs.extractContours(ground, [1])));
const nativeLDT = serializeLDT(profile).value;
const ldt = parsePhotometry(nativeLDT);
assert.equal(ldt.sourceFormat, 'ldt');
assert.equal(ldt.source.format, 'ldt');
const loaded = await viewer.createPhotometrySourceLoader().load({ text: nativeLDT });
assert.equal(loaded.sourceFormat, 'ldt');
const roundtrip = parseIES(serializeIES(ldt).value);
assert.ok(Math.abs(sampleIntensity(roundtrip, 30, 0) - sampleIntensity(profile, 30, 0)) < 1e-6);
writeFileSync('fixture.ldt', nativeLDT);
await import('ies-viewer/element'); // SSR-safe registration import, no renderer construction.
`,
  );
  execFileSync(process.execPath, ['check.mjs', join(root, 'fixtures/007cfb11e343e2f42e3b476be4ab684e.ies')], {
    cwd: consumer,
    stdio: 'inherit',
  });
  const help = execFileSync(join(consumer, 'node_modules', '.bin', 'ies'), ['--help'], {
    cwd: consumer,
    encoding: 'utf8',
  });
  assert.match(help, /inspect/);
  assert.match(help, /validate/);
  const cli = join(consumer, 'node_modules', '.bin', 'ies');
  const inspect = JSON.parse(
    execFileSync(cli, ['inspect', 'fixture.ldt', '--json'], { cwd: consumer, encoding: 'utf8' }),
  );
  assert.equal(inspect.sourceFormat, 'ldt');
  assert.equal(inspect.format, 'EULUMDAT LDT');
  const native = JSON.parse(
    execFileSync(cli, ['convert', 'fixture.ldt', '--to', 'json'], { cwd: consumer, encoding: 'utf8' }),
  );
  assert.equal(native.format, 'ldt');
  assert.ok(native.lampSets.length > 0);
  console.log('Production tarballs, IES/LDT models, source loading, React exports and CLI entry points verified.');
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
