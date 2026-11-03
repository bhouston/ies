import { DataTexture, FloatType, LinearFilter, RedFormat } from 'three';
import { sampleIntensity, type IESProfile } from '@ies-tools/core';

/** Absolute candela texture for this viewer's receiver shader, not an IESSpotLight map.
 * 361 azimuth samples across U (0–360°), 181 vertical samples across V (0–180°).
 * Endpoint samples are stored at pixel centers. Caller owns and must dispose the texture.
 */
export function createCandelaTexture(profile: IESProfile): DataTexture {
  if (profile.photometricType !== 1) throw new Error('Candela receiver textures require Type C photometry');
  const data = new Float32Array(361 * 181);
  for (let v = 0; v <= 180; v++) for (let h = 0; h <= 360; h++) data[v * 361 + h] = sampleIntensity(profile, v, h);
  const texture = new DataTexture(data, 361, 181, RedFormat, FloatType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
