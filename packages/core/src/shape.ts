/**
 * Luminous-opening shapes. The first 15 are the rows of LM-63 Table 1 ("Shapes of Luminous Areas and
 * Solids"; introduced in LM-63-2002 and kept unchanged in LM-63-2019). Two kinds are not in Table 1:
 * the `-facing-width` kinds (0, -, -). They are the mirror of Table 1's (-, 0, -) disk, using the
 * standard's rule that two negative dimensions make the plane they span round.
 * Cross-checked against Radiance ies2rad: https://github.com/LBNL-ETA/pyradiance/blob/main/src/radiance/cv/ies2rad.c
 */
export type LuminousShapeKind =
  | 'point'
  | 'rectangular'
  | 'rectangular-luminous-sides'
  | 'circular'
  | 'ellipse'
  | 'vertical-cylinder'
  | 'vertical-ellipsoidal-cylinder'
  | 'horizontal-cylinder-along-length'
  | 'horizontal-ellipsoidal-cylinder-along-length'
  | 'horizontal-cylinder-along-width'
  | 'horizontal-ellipsoidal-cylinder-along-width'
  | 'sphere'
  | 'ellipsoidal-spheroid'
  | 'vertical-circle-facing-length'
  | 'vertical-ellipse-facing-length'
  // Not in Table 1 (see above).
  | 'vertical-circle-facing-width'
  | 'vertical-ellipse-facing-width';

/**
 * A classified luminous opening with absolute sizes in metres. Type C axes (LM-63 §5.11–5.13, Figure 1):
 * length is parallel to the 0° photometric plane, along C0–C180 (+X). Width is perpendicular to it,
 * along C90–C270 (+Z). Height is vertical (+Y). `solid` is the primitive that
 * bounds the shape; a cylinder's `axis` is its extruded direction (a disk is a cylinder of zero extent).
 */
export interface LuminousShape {
  kind: LuminousShapeKind;
  solid: 'box' | 'ellipsoid' | 'cylinder';
  axis: 'x' | 'y' | 'z';
  width: number;
  length: number;
  height: number;
}

const ZERO = 1e-9;
const sign = (value: number) => (value > ZERO ? '+' : value < -ZERO ? '-' : '0');
// LM-63 gives no equality tolerance for "diameter" cells. Files round, so values within 0.1% count as equal.
const same = (a: number, b: number) => Math.abs(Math.abs(a) - Math.abs(b)) <= 1e-3 * Math.max(Math.abs(a), Math.abs(b));

/**
 * Classify signed IES luminous-opening dimensions (negative values describe round shapes).
 * `units` is the IES units type of the dimensions; the result is always in metres. `version` is the
 * profile's `version` (for example `LM-63-1995`); LM-63-1986/1991/1995 files use the older sign
 * encodings that Radiance ies2rad decodes, and anything else uses Table 1. Sign combinations outside
 * the encodings fall back to a rectangle (or box) of their absolute extents.
 */
export function luminousShape(
  dimensions: { width: number; length: number; height: number },
  units: 'feet' | 'meters' = 'meters',
  version?: string,
): LuminousShape {
  const scale = units === 'feet' ? 0.3048 : 1;
  const { width: w, length: l, height: h } = dimensions;
  const size = { width: Math.abs(w) * scale, length: Math.abs(l) * scale, height: Math.abs(h) * scale };
  const shape = (kind: LuminousShapeKind, solid: LuminousShape['solid'], axis: LuminousShape['axis'] = 'y') => ({
    kind,
    solid,
    axis,
    ...size,
  });
  const key = sign(w) + sign(l) + sign(h);
  // Pre-2002 encodings, per ies2rad makeiesshape (signs below are width, length, height).
  if (version === 'LM-63-1995')
    switch (key) {
      case '-0-': // Sphere of diameter |width|.
        return same(w, h)
          ? { ...shape('sphere', 'ellipsoid'), length: size.width }
          : { ...shape('ellipsoidal-spheroid', 'ellipsoid'), length: size.width };
      case '0+-': // Horizontal cylinder along length, diameter |height|.
        return { ...shape('horizontal-cylinder-along-length', 'cylinder', 'x'), width: size.height };
      case '+0-': // Horizontal cylinder along width, diameter |height|.
        return { ...shape('horizontal-cylinder-along-width', 'cylinder', 'z'), length: size.height };
      case '-++':
      case '+-+':
        return shape('vertical-ellipsoidal-cylinder', 'cylinder');
      case '-+-':
      case '+--':
        return shape('ellipsoidal-spheroid', 'ellipsoid');
    }
  if (version === 'LM-63-1986' || version === 'LM-63-1991')
    switch (key) {
      case '-+0':
        return shape('ellipse', 'cylinder');
      case '-++':
        return shape('ellipsoidal-spheroid', 'ellipsoid');
    }
  switch (key) {
    case '000':
      return shape('point', 'ellipsoid');
    case '++0':
      return shape('rectangular', 'box');
    case '+++':
      return shape('rectangular-luminous-sides', 'box');
    case '--0':
      return shape(same(w, l) ? 'circular' : 'ellipse', 'cylinder');
    case '--+':
      return shape(same(w, l) ? 'vertical-cylinder' : 'vertical-ellipsoidal-cylinder', 'cylinder');
    case '---':
      return shape(same(w, l) && same(l, h) ? 'sphere' : 'ellipsoidal-spheroid', 'ellipsoid');
    case '-+-':
      return shape(
        same(w, h) ? 'horizontal-cylinder-along-length' : 'horizontal-ellipsoidal-cylinder-along-length',
        'cylinder',
        'x',
      );
    case '+--':
      return shape(
        same(l, h) ? 'horizontal-cylinder-along-width' : 'horizontal-ellipsoidal-cylinder-along-width',
        'cylinder',
        'z',
      );
    case '-0-':
      return shape(same(w, h) ? 'vertical-circle-facing-length' : 'vertical-ellipse-facing-length', 'cylinder', 'x');
    case '0--':
      return shape(same(l, h) ? 'vertical-circle-facing-width' : 'vertical-ellipse-facing-width', 'cylinder', 'z');
    // LM-63-1986/1991/1995 write a circle as one negative diameter with the other side zero; accepted
    // in any version, since such 2002+ files exist (ies2rad does the same).
    case '-00':
    case '-0+':
    case '0-0':
    case '0-+': {
      const diameter = size.width || size.length;
      return { ...shape(h > ZERO ? 'vertical-cylinder' : 'circular', 'cylinder'), width: diameter, length: diameter };
    }
    default:
      return shape(size.height > ZERO ? 'rectangular-luminous-sides' : 'rectangular', 'box');
  }
}

/**
 * Silhouette area in m² of the luminous shape seen from the unit direction `[x, y, z]` (Y up, +X = C0).
 * Divide an intensity in that direction by this area for the average luminance in cd/m².
 */
export function projectedLuminousArea(shape: LuminousShape, [x, y, z]: [number, number, number]): number {
  // Semi-axes / half-extents along X (length), Y (height) and Z (width).
  const a = shape.length / 2;
  const b = shape.height / 2;
  const c = shape.width / 2;
  if (shape.solid === 'box') return 4 * (a * c * Math.abs(y) + b * c * Math.abs(x) + a * b * Math.abs(z));
  if (shape.solid === 'ellipsoid') return Math.PI * Math.hypot(b * c * x, a * c * y, a * b * z);
  // Cylinder: an elliptical cap of semi-axes (p, q) plus the extruded side of length 2·s along the axis.
  const [d, p, q, s, dp, dq] =
    shape.axis === 'x' ? [x, b, c, a, y, z] : shape.axis === 'y' ? [y, a, c, b, x, z] : [z, a, b, c, x, y];
  return Math.PI * p * q * Math.abs(d) + 4 * s * Math.hypot(p * dq, q * dp);
}
