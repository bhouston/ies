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
