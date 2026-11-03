import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { iesSource } from '../../core/test/iesSource.js';

const directories: string[] = [];
const bin = resolve('packages/cli/bin/cli.js');
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
async function input(text: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'ies-modern-cli-'));
  directories.push(directory);
  const file = join(directory, 'profile.ies');
  await writeFile(file, text);
  return file;
}
function run(...args: string[]) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
}

describe('modern photometric CLI', () => {
  it('inspects 2019 provenance and distinguishes declared and integrated flux in JSON and text', async () => {
    const file = await input(iesSource({ lamps: 2, lumens: 1000, vertical: [0, 180], factors: '1 1.10100 20' }));
    const result = run('inspect', file, '--json');
    expect(result.status).toBe(0);
    const summary = JSON.parse(result.stdout);
    expect(summary.version).toBe('LM-63-2019');
    expect(summary.fileGenerationType).toBe(1.101);
    expect(summary.peakCandela).toBe(100);
    expect(summary.declaredLampFluxLumens).toBe(2000);
    expect(summary.integratedFluxLumens).toBeCloseTo(400 * Math.PI, 10);
    expect(summary.luminousEfficacyLumensPerWatt).toBeCloseTo(20 * Math.PI, 10);
    expect(summary.diagnostics).toEqual([]);
    expect(summary.beamAngles[0].beamAngleDegrees).toBeNull();
    const text = run('inspect', file).stdout;
    expect(text).toContain('Declared lamp flux: 2000 lm (lamp rating, not luminaire output)');
    expect(text).toContain('Integrated luminaire flux: 1256.637 lm (angular table estimate)');
    expect(text).toContain('Integrated luminous efficacy: 62.832 lm/W');
    expect(text).toContain('File generation type: 1.10100 (provenance, not an intensity multiplier)');
    expect(text).toContain('unavailable (no-crossing)');
  });
  it('emits structured invalid-file diagnostics as clean JSON and exits nonzero', async () => {
    const file = await input('Malformed file');
    const result = run('validate', file, '--json');
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      valid: false,
      file,
      diagnostics: [{ code: 'IES_MISSING_TILT', severity: 'error' }],
    });
  });
  it('strict validation fails on warnings while retaining their severity', async () => {
    const file = await input(iesSource({ metadata: '[MANUFAC] Example' }));
    const tolerant = run('validate', file, '--json');
    expect(tolerant.status).toBe(0);
    expect(JSON.parse(tolerant.stdout).valid).toBe(true);
    const strict = run('validate', file, '--json', '--strict');
    expect(strict.status).toBe(1);
    const diagnostics = JSON.parse(strict.stdout).diagnostics;
    expect(diagnostics).toHaveLength(3);
    expect(
      diagnostics.every(
        (diagnostic: { severity: string; code: string }) =>
          diagnostic.severity === 'warning' && diagnostic.code === 'IES_REQUIRED_METADATA',
      ),
    ).toBe(true);
    expect(run('validate', file, '--strict').stderr).toContain('warning [IES_REQUIRED_METADATA]');
  });
  it.each([2, 3])('inspects unsupported Type %s metrics without crashing or inventing numbers', async (type) => {
    const file = await input(iesSource({ type, vertical: [-90, 0, 90] }));
    const result = run('inspect', file, '--json');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      metricsSupported: false,
      integratedFluxLumens: null,
      beamAngles: [],
    });
    expect(run('inspect', file).stdout).toContain('Integrated luminaire flux: unavailable (Type C only)');
    expect(run('validate', file, '--strict').status).toBe(0);
  });
});
