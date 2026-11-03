import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { servePreview } from './index.js';

const bin = resolvePath('packages/cli/bin/cli.js');
const fixture = resolvePath('fixtures/007cfb11e343e2f42e3b476be4ab684e.ies');
const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
function cli(...args: string[]) {
  return execFileSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
}

describe('CLI', () => {
  it('shows help and version', () => {
    expect(cli('--help')).toContain('ies view');
    expect(cli('--version').trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
  it('validates and inspects real photometry as JSON', () => {
    expect(JSON.parse(cli('validate', fixture, '--json')).valid).toBe(true);
    const summary = JSON.parse(cli('inspect', fixture, '--json'));
    expect(summary.peakCandela).toBeGreaterThan(100);
    expect(summary.photometricType).toBe(1);
  });
  it('exports JSON without overwriting existing files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ies-cli-'));
    temporaryDirectories.push(directory);
    const output = join(directory, 'profile.json');
    cli('convert', fixture, '-o', output);
    expect(JSON.parse(await readFile(output, 'utf8')).candelaValues).toHaveLength(1);
    const repeat = spawnSync(process.execPath, [bin, 'convert', fixture, '-o', output], { encoding: 'utf8' });
    expect(repeat.status).toBe(1);
    expect(repeat.stderr).toContain('EEXIST');
  });
  it('supports stdout JSON conversion', () => expect(JSON.parse(cli('convert', fixture)).units).toBe('meters'));
  it.each([
    ['unknown'],
    ['validate'],
    ['validate', fixture, '--bad'],
    ['inspect', fixture, fixture],
    ['view', fixture, '--port', '-1'],
    ['validate', 'missing-file.ies'],
  ])('reports command errors for %j', (...args) => {
    const result = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ies:');
  });
});

describe('local preview server', () => {
  it('serves only the selected IES and bundled viewer, with no arbitrary file access', async () => {
    const input = await readFile(fixture, 'utf8');
    const preview = await servePreview(input);
    try {
      expect(preview.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
      const page = await fetch(preview.url);
      expect(page.headers.get('content-security-policy')).toContain("script-src 'self'");
      expect(await page.text()).toContain('<light-viewer src="/profile.ies">');
      expect(await (await fetch(`${preview.url}profile.ies`)).text()).toBe(input);
      expect((await fetch(`${preview.url}light-viewer.js`)).headers.get('content-type')).toContain('javascript');
      expect((await fetch(`${preview.url}package.json`)).status).toBe(404);
      expect((await fetch(preview.url, { method: 'POST' })).status).toBe(405);
      expect(await (await fetch(preview.url, { method: 'HEAD' })).text()).toBe('');
    } finally {
      preview.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        preview.server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it('rejects malformed input before opening a port', async () =>
    expect(servePreview('invalid')).rejects.toThrow('TILT'));
  it('rejects invalid port values', async () =>
    expect(servePreview(await readFile(fixture, 'utf8'), 99999)).rejects.toThrow('Port'));
});
