import { sampleIntensity, type IESProfile } from '@ies-tools/core';

/** Type C uses nadir (down) as zero vertical angle; azimuth zero is +X. */
export function directionAngles(x: number, y: number, z: number): [number, number] {
  const length = Math.hypot(x, y, z);
  if (length === 0) return [0, 0];
  return [
    (Math.acos(Math.max(-1, Math.min(1, -y / length))) * 180) / Math.PI,
    ((Math.atan2(z, x) * 180) / Math.PI + 360) % 360,
  ];
}

export function illuminance(
  profile: IESProfile,
  point: [number, number, number],
  normal: [number, number, number],
  height = 2,
): number {
  const [x, y, z] = [point[0], point[1] - height, point[2]];
  const distance = Math.hypot(x, y, z);
  if (distance === 0) return 0;
  const cosine = Math.max(0, -(x * normal[0] + y * normal[1] + z * normal[2]) / distance);
  return (sampleIntensity(profile, ...directionAngles(x, y, z)) * cosine) / (distance * distance);
}

export function intensitySamples(
  profile: IESProfile,
  axis: 'vertical' | 'horizontal' = 'vertical',
  angle = 0,
  count = 181,
): { angle: number; intensity: number }[] {
  if (!Number.isInteger(count) || count < 2) throw new RangeError('Sample count must be an integer of at least two');
  const range = axis === 'vertical' ? 180 : 360;
  return Array.from({ length: count }, (_, i) => {
    const position = (i * range) / (count - 1);
    return {
      angle: position,
      intensity:
        axis === 'vertical' ? sampleIntensity(profile, position, angle) : sampleIntensity(profile, angle, position),
    };
  });
}
