import { DataTexture, FloatType, LinearFilter, RedFormat } from 'three';
import { projectedLuminousArea, sampleIntensity, type IESProfile, type LuminousShape } from '@ies-tools/core';

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

/** Average luminance (cd/m²) toward each texel direction of a candela texture: I / projected area.
 * Same layout as {@link createCandelaTexture}. Caller owns and must dispose the texture. */
export function createLuminanceTexture(candela: DataTexture, shape: LuminousShape): DataTexture {
  const source = candela.image.data as Float32Array;
  const data = new Float32Array(361 * 181);
  for (let v = 0; v <= 180; v++) {
    const theta = (v * Math.PI) / 180;
    for (let h = 0; h <= 360; h++) {
      const phi = (h * Math.PI) / 180;
      const direction: [number, number, number] = [
        Math.sin(theta) * Math.cos(phi),
        -Math.cos(theta),
        Math.sin(theta) * Math.sin(phi),
      ];
      const area = projectedLuminousArea(shape, direction);
      // Displayed shapes always have area; the 1 cm² floor only guards degenerate inputs.
      data[v * 361 + h] = source[v * 361 + h]! / Math.max(area, 1e-4);
    }
  }
  const texture = new DataTexture(data, 361, 181, RedFormat, FloatType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
