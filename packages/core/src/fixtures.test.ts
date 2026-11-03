import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseIES, sampleIntensity, summarizeIES } from './index.js';

const directory = new URL('../../../fixtures/eulumdat-rs/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8')) as {
  files: { file: string; sha256: string }[];
};
// Golden properties of the upstream measurement files, independent of serialization.
const measurements = [
  { vertical: 181, horizontal: 9, peak: 3115.993, nadir: 2992.018 },
  { vertical: 361, horizontal: 1, peak: 1917.08681806, nadir: 1917.08681806 },
  { vertical: 361, horizontal: 73, peak: 5891.81, nadir: 2775.125 },
  { vertical: 263, horizontal: 361, peak: 6844.25474688, nadir: 1256.73461975 },
  { vertical: 181, horizontal: 73, peak: 5613.79, nadir: 2171.96 },
  { vertical: 91, horizontal: 73, peak: 424.691, nadir: 179.714 },
  { vertical: 91, horizontal: 73, peak: 424.691, nadir: 179.714 },
];

describe('attributed real-world eulumdat-rs IES measurements', () => {
  it('covers all seven pinned files', () => expect(manifest.files).toHaveLength(measurements.length));
  for (const [index, fixture] of manifest.files.entries()) {
    it(`preserves and samples ${fixture.file}`, () => {
      const source = readFileSync(new URL(fixture.file, directory));
      expect(createHash('sha256').update(source).digest('hex')).toBe(fixture.sha256);
      const profile = parseIES(source.toString('utf8'));
      const expected = measurements[index]!;
      expect(profile.photometricType).toBe(1);
      expect(profile.verticalAngles).toHaveLength(expected.vertical);
      expect(profile.horizontalAngles).toHaveLength(expected.horizontal);
      expect(summarizeIES(profile).peakCandela).toBeCloseTo(expected.peak, 6);
      expect(sampleIntensity(profile, 0, 0)).toBeCloseTo(expected.nadir, 6);
      // Check interpolation within a real measured interval, including the irregular grid.
      const low = profile.verticalAngles[1]!;
      const high = profile.verticalAngles[2]!;
      expect(sampleIntensity(profile, (low + high) / 2, 0)).toBeCloseTo(
        (profile.candelaValues[0]![1]! + profile.candelaValues[0]![2]!) / 2,
        6,
      );
      expect(sampleIntensity(profile, 30, 0)).toBeCloseTo(sampleIntensity(profile, 30, 360), 6);
      if (expected.vertical === 91) expect(sampleIntensity(profile, 120, 0)).toBe(0);
    });
  }
  it('retains measured azimuth differences between CIE and IESNA named files', () => {
    const cie = parseIES(readFileSync(new URL(manifest.files[5]!.file, directory), 'utf8'));
    const iesna = parseIES(readFileSync(new URL(manifest.files[6]!.file, directory), 'utf8'));
    expect(sampleIntensity(cie, 45, 0)).toBeCloseTo(210.747, 3);
    expect(sampleIntensity(iesna, 45, 0)).toBeCloseTo(274.048, 3);
  });
});
