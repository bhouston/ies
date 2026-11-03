import { mkdir, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist', { recursive: true });
await mkdir('media', { recursive: true });
await build({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  sourcemap: true,
});
await build({
  entryPoints: ['src/preview/index.ts'],
  outfile: 'media/preview.js',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
});
await copyFile('styles/preview.css', 'media/preview.css');
