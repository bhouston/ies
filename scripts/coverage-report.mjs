import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const metrics = ['statements', 'branches', 'functions', 'lines'];

// Sum covered/total counts, not file percentages: large and small files carry their actual weight.
export function summarizePackages(summary, packageNames) {
  return Object.fromEntries(
    packageNames.map((name) => {
      const files = Object.entries(summary).filter(([file]) =>
        file.replaceAll('\\', '/').includes(`/packages/${name}/src/`),
      );
      if (!files.length) throw new Error(`No coverage entries for ${name}`);
      const values = Object.fromEntries(
        metrics.map((metric) => {
          const total = files.reduce((sum, [, entry]) => sum + entry[metric].total, 0);
          const covered = files.reduce((sum, [, entry]) => sum + entry[metric].covered, 0);
          if (!Number.isFinite(total) || !Number.isFinite(covered) || covered > total || covered < 0)
            throw new Error(`Invalid ${metric} coverage for ${name}`);
          return [metric, { total, covered, pct: total ? (100 * covered) / total : 100 }];
        }),
      );
      return [name, values];
    }),
  );
}

export function checkThresholds(packages, thresholds) {
  return Object.entries(thresholds).flatMap(([name, floors]) =>
    metrics.flatMap((metric) => {
      const actual = packages[name]?.[metric]?.pct;
      const minimum = floors[metric];
      if (!Number.isFinite(actual) || !Number.isFinite(minimum) || minimum < 0 || minimum > 100)
        throw new Error(`Missing or invalid ${name} ${metric} coverage/threshold`);
      return actual < minimum ? [`${name} ${metric}: ${actual.toFixed(2)}% < ${minimum}%`] : [];
    }),
  );
}

async function main() {
  const summary = JSON.parse(await readFile('coverage/coverage-summary.json', 'utf8'));
  const thresholds = JSON.parse(await readFile(new URL('./coverage-thresholds.json', import.meta.url), 'utf8'));
  const packages = summarizePackages(summary, Object.keys(thresholds));
  const failures = checkThresholds(packages, thresholds);
  await mkdir('coverage/packages', { recursive: true });
  const rows = Object.entries(packages).map(
    ([name, values]) => `| ${name} | ${metrics.map((metric) => `${values[metric].pct.toFixed(2)}%`).join(' | ')} |`,
  );
  const revision = process.env.GITHUB_SHA;
  const source = revision ? `Commit: ${revision}` : 'Local working tree';
  const markdown = [
    '## Package coverage',
    '',
    source,
    '',
    '| Package | Statements | Branches | Functions | Lines |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    'Includes untested source files. Code coverage does not establish rendering correctness. The website currently has no test coverage.',
    '',
    failures.length ? `Coverage floors failed:\n${failures.join('\n')}` : 'All package coverage floors passed.',
    '',
  ].join('\n');
  await writeFile('coverage/packages/summary.json', JSON.stringify({ revision, packages }, null, 2) + '\n');
  await writeFile('coverage/packages/summary.md', markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  for (const [name, values] of Object.entries(packages)) {
    const percent = values.statements.pct;
    const color = percent >= 90 ? '#238636' : percent >= 70 ? '#9f6b00' : '#b62324';
    await writeFile(
      `coverage/packages/${name}.svg`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="170" height="20" role="img" aria-label="Statement coverage: ${percent.toFixed(1)}%"><title>Statement coverage: ${percent.toFixed(1)}%</title><rect width="170" height="20" rx="3" fill="#555"/><path fill="${color}" d="M113 0h54q3 0 3 3v14q0 3-3 3h-54z"/><g fill="white" font-family="Verdana,sans-serif" font-size="11" text-anchor="middle"><text x="56" y="14">statement coverage</text><text x="141" y="14">${percent.toFixed(1)}%</text></g></svg>\n`,
    );
  }
  console.log(markdown);
  if (failures.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
