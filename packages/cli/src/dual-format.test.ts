import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseIES, parseLDT, parsePhotometry, sampleIntensity } from 'ies-core';
import { iesSource } from '../../core/test/iesSource.js';
import { ldtSource } from '../../viewer/test/photometryFixtures.js';
import { servePreview } from './index.js';

const bin = resolve('packages/cli/bin/cli.js');
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
async function input(text: string, extension = 'ldt') {
  const directory = await mkdtemp(join(tmpdir(), 'ies-dual-format-'));
  directories.push(directory);
  const file = join(directory, `profile.${extension}`);
  await writeFile(file, text);
  return file;
}
const cli = (...args: string[]) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });

describe('dual-format CLI entry points', () => {
  it('reports the native format, selected declared flux and correctly normalized absolute candela', async () => {
    const file = await input(ldtSource({ absolute: true }));
    const result = cli('inspect', file, '--json');
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const summary = JSON.parse(result.stdout);
    expect(summary.sourceFormat).toBe('ldt');
    expect(summary.format).toBe('EULUMDAT LDT');
    expect(summary.photometry).toBe('absolute');
    expect(summary.peakCandela).toBe(100);
    expect(summary.declaredLampFluxLumens).toBeNull();
    expect(summary.declaredLuminaireFluxLumens).toBe(2000);
    expect(summary.integratedFluxLumens).toBeCloseTo(400 * Math.PI, 9);
    expect(cli('inspect', file).stdout).toContain('Declared luminaire flux: 2000 lm (source rating)');
  });
  it('inspects all native alternatives without summing or silently selecting them', async () => {
    const file = await input(ldtSource({ alternatives: true }));
    const result = cli('inspect', file, '--json');
    expect(result.status).toBe(0);
    const summary = JSON.parse(result.stdout);
    expect(summary.lampSets).toHaveLength(2);
    expect(summary.selectedLampSetIndex).toBeNull();
    expect(summary.peakCandela).toBeNull();
    expect(summary.integratedFluxLumens).toBeNull();
    expect(summary.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LDT_LAMP_SET_SELECTION_REQUIRED', severity: 'info' }),
    );
    const selected = cli('inspect', file, '--json', '--lamp-set', '2');
    expect(selected.status).toBe(0);
    const chosen = JSON.parse(selected.stdout);
    expect(chosen.selectedLampSetIndex).toBe(1);
    expect(chosen.peakCandela).toBe(25);
    expect(chosen.declaredLampFluxLumens).toBe(500);
    expect(chosen.inputWatts).toBe(5);
    const text = cli('inspect', file).stdout;
    expect(text).toContain('Lamp configuration 1: First configuration; 2000 lm; 20 W');
    expect(text).toContain('Lamp configuration 2: Second configuration; 500 lm; 5 W');
    expect(text).not.toContain('null cd');
  });
  it('validates native alternatives without requiring rendering selection', async () => {
    const file = await input(ldtSource({ alternatives: true }));
    const result = cli('validate', file, '--json', '--strict');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, sourceFormat: 'ldt' });
    const invalid = cli('validate', file, '--json', '--lamp-set', '3');
    expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stdout).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LDT_INVALID_LAMP_SET', severity: 'error' }),
    );
  });
  it('emits structured LDT parse errors and documented usability warnings in strict mode', async () => {
    const malformed = await input('Malformed EULUMDAT');
    const error = cli('validate', malformed, '--json');
    expect(error.status).toBe(1);
    expect(error.stderr).toBe('');
    expect(JSON.parse(error.stdout)).toMatchObject({
      valid: false,
      sourceFormat: 'ldt',
      diagnostics: [{ code: 'LDT_PARSE_ERROR', severity: 'error' }],
    });
    const missing = await input(ldtSource({ emptyDescriptions: true }));
    expect(cli('validate', missing, '--json').status).toBe(0);
    const strict = cli('validate', missing, '--strict', '--json');
    expect(strict.status).toBe(1);
    expect(JSON.parse(strict.stdout).diagnostics).toHaveLength(2);
  });
  it('exports the original native JSON model and all alternatives, rather than mislabeled normalized IES data', async () => {
    const file = await input(ldtSource({ alternatives: true }));
    const result = cli('convert', file);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const native = JSON.parse(result.stdout);
    expect(native.format).toBe('ldt');
    expect(native.lampSets).toHaveLength(2);
    expect(native.conversionFactor).toBe(0.5);
    expect(native.intensities).toEqual([[100, 100, 100]]);
    expect(native.candelaValues).toBeUndefined();
    expect(native.version).toBeUndefined();
  });
  it('converts both directions with exclusive payload stdout and loss warnings on stderr', async () => {
    const ldt = await input(ldtSource());
    const iesResult = cli('convert', ldt, '--to', 'ies');
    expect(iesResult.status).toBe(0);
    expect(iesResult.stdout).toMatch(/^IESNA:LM-63-2002/);
    expect(iesResult.stdout).not.toContain('warning');
    expect(iesResult.stderr).toContain('warning [LDT_GEOMETRY_REDUCED]');
    expect(sampleIntensity(parseIES(iesResult.stdout), 45, 20)).toBeCloseTo(100, 8);
    const ies = await input(iesSource(), 'ies');
    const ldtResult = cli('convert', ies, '--to', 'ldt');
    expect(ldtResult.status).toBe(0);
    expect(ldtResult.stderr).toContain('warning [');
    expect(ldtResult.stdout).not.toContain('warning');
    expect(sampleIntensity(parsePhotometry(ldtResult.stdout).profile, 45, 20)).toBeCloseTo(100, 8);
    expect(parseLDT(ldtResult.stdout).format).toBe('ldt');
  });
  it('retains native multiple configurations for LDT-to-LDT and requires a selection for IES conversion', async () => {
    const file = await input(ldtSource({ alternatives: true }));
    const native = cli('convert', file, '--to', 'ldt');
    expect(native.status).toBe(0);
    expect(parseLDT(native.stdout).lampSets).toHaveLength(2);
    const unselected = cli('convert', file, '--to', 'ies');
    expect(unselected.status).toBe(1);
    expect(unselected.stderr).toContain('--lamp-set');
    const selected = cli('convert', file, '--to', 'ies', '--lamp-set', '2');
    expect(selected.status).toBe(0);
    expect(sampleIntensity(parseIES(selected.stdout), 0, 0)).toBe(25);
  });
  it('never overwrites outputs and supports explicit input hints or content detection', async () => {
    const file = await input(ldtSource(), 'data');
    expect(JSON.parse(cli('inspect', file, '--json').stdout).sourceFormat).toBe('ldt');
    const wrongExtension = await input(ldtSource(), 'ies');
    expect(cli('inspect', wrongExtension).status).toBe(1);
    expect(cli('inspect', wrongExtension, '--format', 'ldt').status).toBe(0);
    const output = join(directories[0]!, 'converted.ies');
    const first = cli('convert', file, '--to', 'ies', '-o', output);
    expect(first.status).toBe(0);
    expect(first.stdout).toBe('');
    expect(parseIES(await readFile(output, 'utf8')).photometricType).toBe(1);
    expect(cli('convert', file, '--to', 'ies', '-o', output).stderr).toContain('EEXIST');
  });
  it('rejects invalid format/target/selection options and keeps inspect as the statistics command', async () => {
    const file = await input(ldtSource());
    for (const args of [
      ['inspect', file, '--format', 'bad'],
      ['convert', file, '--to', 'bad'],
      ['inspect', file, '--lamp-set', '0'],
      ['inspect', file, '--lamp-set', '1.5'],
      ['stats', file],
    ])
      expect(cli(...args).status).toBe(1);
    expect(cli('--help').stdout).toContain('--lamp-set N');
    expect(cli('--help').stdout).toContain('--to ies|ldt|json');
  });
});

describe('original-format local preview routing', () => {
  it('serves unmodified LDT text at a correctly named route with explicit lamp configuration', async () => {
    const text = ldtSource({ alternatives: true });
    const preview = await servePreview(text, 0, { lampSetIndex: 1 });
    try {
      const html = await (await fetch(preview.url)).text();
      expect(html).toContain('src="/profile.ldt" format="ldt" lamp-set-index="1"');
      const response = await fetch(`${preview.url}profile.ldt`);
      expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(await response.text()).toBe(text);
      expect((await fetch(`${preview.url}profile.ies`)).status).toBe(404);
    } finally {
      preview.server.closeAllConnections();
      await new Promise<void>((done) => preview.server.close(() => done()));
    }
  });
  it('requires a lamp configuration before opening a multi-alternative LDT preview', async () => {
    await expect(servePreview(ldtSource({ alternatives: true }))).rejects.toThrow(/lampSetIndex/);
  });
});
