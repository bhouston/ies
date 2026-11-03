import { build } from 'esbuild';
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
});
