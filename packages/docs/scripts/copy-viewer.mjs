import { copyFile, mkdir } from 'node:fs/promises';

// Serve the standalone build unchanged: webpack transpilation breaks its native custom-element class.
const destination = new URL('../static/viewer/', import.meta.url);
await mkdir(destination, { recursive: true });
await Promise.all(
  ['light-viewer.js', 'light-viewer.js.map'].map((file) =>
    copyFile(new URL(`../../viewer/dist/${file}`, import.meta.url), new URL(file, destination)),
  ),
);
