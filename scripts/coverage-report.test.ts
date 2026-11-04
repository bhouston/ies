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
});
