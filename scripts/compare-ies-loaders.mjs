// CPU-only texture diagnostics. This does not create a GPU context or verify rendering.
// Optional argument: a Three.js source checkout for comparison with the installed package.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseIES, sampleIntensity } from '../packages/core/dist/index.js';
import { createCandelaTexture } from '../packages/viewer/dist/index.js';

const root = resolve(import.meta.dirname, '..');
const threeRoot = process.argv[2] ? resolve(process.argv[2]) : join(root, 'packages/viewer/node_modules/three');
const { IESLoader } = await import(pathToFileURL(join(threeRoot, 'examples/jsm/loaders/IESLoader.js')).href);
const { FloatType } = await import(pathToFileURL(join(threeRoot, 'build/three.module.js')).href);
const version = JSON.parse(readFileSync(join(threeRoot, 'package.json'), 'utf8')).version;
function metrics(texture) {
  let nonfinite = 0,
    negative = 0,
    minimum = Infinity,
    maximum = -Infinity;
  for (const value of texture.image.data) {
    if (!Number.isFinite(value)) nonfinite++;
    else {
      if (value < 0) negative++;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  }
  return {
    width: texture.image.width,
    height: texture.image.height,
    values: texture.image.data.length,
    shapeMatches: texture.image.width * texture.image.height === texture.image.data.length,
    nonfinite,
    negative,
    minimum,
    maximum,
  };
}
const directory = join(root, 'fixtures');
const external = JSON.parse(readFileSync(join(directory, 'eulumdat-rs/manifest.json'), 'utf8'));
const files = [
  ...readdirSync(directory).filter((file) => file.endsWith('.ies')),
  ...external.files.map(({ file }) => `eulumdat-rs/${file}`),
];
const results = files.map((file) => {
  const text = readFileSync(join(directory, file), 'utf8');
  const profile = parseIES(text);
  const loader = new IESLoader();
  loader.type = FloatType;
  let native;
  let nativeResult;
  try {
    native = loader.parse(text);
    nativeResult = metrics(native);
  } catch (error) {
    nativeResult = { error: error.message };
  }
  const calibrated = createCandelaTexture(profile);
  try {
    return { file, native: nativeResult, calibrated: metrics(calibrated) };
  } finally {
    native?.dispose();
    calibrated.dispose();
  }
});
const synthetic = 'IESNA:LM-63-2002\nTILT=NONE\n1 1000 1 3 1 1 2 0 0 0\n1 1 1\n0 90 180\n0\n100 50 0\n';
const loader = new IESLoader();
loader.type = FloatType;
const texture = loader.parse(synthetic);
const index = Math.floor(texture.image.width / 2);
const angle = (index * 180) / (texture.image.width - 1);
const ratio = {
  verticalAngle: angle,
  native: texture.image.data[index],
  expected: sampleIntensity(parseIES(synthetic), angle, 0) / 100,
};
texture.dispose();
console.log(JSON.stringify({ threeVersion: version, cpuOnly: true, normalizedRatio: ratio, results }, null, 2));
