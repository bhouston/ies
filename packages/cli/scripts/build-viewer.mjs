import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('media', { recursive: true });
await build({
  stdin: { contents: "import 'ies-viewer/element';", resolveDir: process.cwd(), loader: 'js' },
  outfile: 'media/light-viewer.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  sourcemap: true,
  target: 'es2022',
});
