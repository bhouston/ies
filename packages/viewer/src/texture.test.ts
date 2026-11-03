import { readFileSync, readdirSync } from 'node:fs';
import { FloatType } from 'three';
import { IESLoader } from 'three/addons/loaders/IESLoader.js';
import { parseIES, sampleIntensity } from 'ies-core';
import { describe, expect, it } from 'vitest';
import { createCandelaTexture } from './texture.js';

const directory = new URL('../../../fixtures/', import.meta.url);
describe('Three.js IES texture interoperability', () => {
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.ies'))) {
    it(`loads ${file} with the absolute candela receiver map and records native loader compatibility`, () => {
      const text = readFileSync(new URL(file, directory), 'utf8');
      const loader = new IESLoader();
      loader.type = FloatType;
      const native = loader.parse(text);
      expect(native.image.data.length).toBeGreaterThan(0);
      // Three.js 0.186 rewrites the output index during symmetry expansion, leaving
      // sparse array holes for these azimuth ranges. Keep this limitation explicit.
      const nativeFinite = Array.from(native.image.data).every((value) => Number.isFinite(value));
      const nativeHasSymmetryHoles = file.startsWith('02a') || file.startsWith('06b');
      // Do not require upstream bugs to remain unfixed. Assert native finiteness on
      // supported fixtures; our own map below must be finite for every fixture.
      if (!nativeHasSymmetryHoles) expect(nativeFinite).toBe(true);
      const profile = parseIES(text);
      const receiver = createCandelaTexture(profile);
      expect(receiver.image.width).toBe(361);
      expect(receiver.image.height).toBe(181);
      expect(Array.from(receiver.image.data).every((value) => Number.isFinite(value))).toBe(true);
      expect(receiver.image.data[90 * 361 + 180]).toBeCloseTo(sampleIntensity(profile, 90, 180), 3);
      native.dispose();
      receiver.dispose();
    });
  }
});

const externalDirectory = new URL('../../../fixtures/eulumdat-rs/', import.meta.url);
const externalManifest = JSON.parse(readFileSync(new URL('manifest.json', externalDirectory), 'utf8')) as {
  files: { file: string }[];
};
describe('external measured profiles in the receiver texture', () => {
  for (const fixture of externalManifest.files) {
    it(`keeps ${fixture.file} finite, nonnegative and correctly oriented`, () => {
      const profile = parseIES(readFileSync(new URL(fixture.file, externalDirectory), 'utf8'));
      const texture = createCandelaTexture(profile);
      try {
        expect(texture.image.data.length).toBe(texture.image.width * texture.image.height);
        expect(Array.from(texture.image.data).every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
        for (const [vertical, horizontal] of [
          [0, 0],
          [45, 90],
          [90, 180],
          [120, 270],
          [180, 360],
        ]) {
          const expected = sampleIntensity(profile, vertical!, horizontal!);
          const actual = texture.image.data[vertical! * 361 + horizontal!]!;
          expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(1e-6, Math.abs(expected) * 1e-6));
        }
      } finally {
        texture.dispose();
      }
    });
  }
});
