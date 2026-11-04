import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkThresholds, summarizePackages } from './coverage-report.mjs';

const entry = (total: number, covered: number) =>
  Object.fromEntries(['statements', 'branches', 'functions', 'lines'].map((m) => [m, { total, covered }]));
const floors = (minimum: number) => ({
  core: { statements: minimum, branches: minimum, functions: minimum, lines: minimum },
});

describe('package coverage reporting', () => {
  it('weights counters by source size, isolates packages and handles platform paths', () => {
    const packages = summarizePackages(
      {
        total: entry(1000, 1000),
        '/repo/packages/core/src/a.ts': entry(90, 90),
        'C:\\repo\\packages\\core\\src\\b.ts': entry(10, 0),
        '/repo/packages/viewer/src/a.ts': entry(100, 0),
      },
      ['core'],
    );
    expect(packages.core.statements).toEqual({ total: 100, covered: 90, pct: 90 });
    expect(checkThresholds(packages, floors(90))).toEqual([]);
    expect(checkThresholds(packages, floors(91))).toHaveLength(4);
  });

  it('fails closed for missing source coverage or malformed counters', () => {
    expect(() => summarizePackages({}, ['core'])).toThrow('No coverage entries');
    expect(() => summarizePackages({ '/repo/packages/core/src/a.ts': entry(1, 2) }, ['core'])).toThrow('Invalid');
    expect(() => checkThresholds({}, floors(0))).toThrow('Missing or invalid');
  });

  it('reports unexecuted source as zero and empty metric sets as fully covered', () => {
    const packages = summarizePackages({ '/repo/packages/core/src/a.ts': entry(10, 0) }, ['core']);
    expect(packages.core.lines.pct).toBe(0);
    const empty = summarizePackages({ '/repo/packages/core/src/a.ts': entry(0, 0) }, ['core']);
    expect(empty.core.functions.pct).toBe(100);
  });

  it('exits nonzero and names the package when coverage is below its floor', async () => {
    const script = fileURLToPath(new URL('./coverage-report.mjs', import.meta.url));
    const thresholds = JSON.parse(await readFile(new URL('./coverage-thresholds.json', import.meta.url), 'utf8'));
    const run = async (cliCovered: number) => {
      const cwd = await mkdtemp(join(tmpdir(), 'coverage-report-'));
      try {
        // 100/100 for every package except the CLI, whose statements sit at the given count of 10 000.
        const summary = Object.fromEntries(
          Object.keys(thresholds).map((name) => [
            `/repo/packages/${name}/src/a.ts`,
            name === 'cli'
              ? { ...entry(100, 100), statements: { total: 10_000, covered: cliCovered } }
              : entry(100, 100),
          ]),
        );
        await mkdir(join(cwd, 'coverage'));
        await writeFile(join(cwd, 'coverage/coverage-summary.json'), JSON.stringify(summary));
        const env = { ...process.env, GITHUB_STEP_SUMMARY: '' };
        return spawnSync(process.execPath, [script], { cwd, env, encoding: 'utf8' });
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    };
    const floor = thresholds.cli.statements * 100;
    const below = await run(floor - 1);
    expect(below.status).toBe(1);
    expect(below.stdout).toContain(
      `cli statements: ${((floor - 1) / 100).toFixed(2)}% < ${thresholds.cli.statements}%`,
    );
    const at = await run(floor);
    expect(at.status).toBe(0);
    expect(at.stdout).toContain('All package coverage floors passed.');
  });
});
