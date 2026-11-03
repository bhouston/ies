import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
execFileSync('pnpm', ['exec', 'tailwindcss', '-i', 'styles/element.css', '-o', 'dist/viewer.css', '--minify'], {
  cwd: root,
  stdio: 'inherit',
});
const css = readFileSync(new URL('../dist/viewer.css', import.meta.url), 'utf8');
// tsc emits this module's declaration; published JS is a static, SSR-safe string.
writeFileSync(
  new URL('../dist/elementStyles.js', import.meta.url),
  `export const ELEMENT_STYLES = ${JSON.stringify(css)};\n`,
);
await build({
  entryPoints: [new URL('../src/element.ts', import.meta.url).pathname],
  outfile: new URL('../dist/light-viewer.js', import.meta.url).pathname,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  legalComments: 'eof',
  define: { __IES_VIEWER_STYLES__: JSON.stringify(css), 'process.env.NODE_ENV': '"production"' },
});
