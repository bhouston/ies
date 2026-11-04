/** LM-63-2019 Table 1 luminous-opening shapes, plus the legacy circular encodings. */
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
  | 'vertical-circle-facing-width'
  | 'vertical-ellipse-facing-width';

/**
 * A classified luminous opening with absolute sizes in metres. Type C axes: length runs along
 * C0–C180 (+X), width along C90–C270 (+Z) and height is vertical (+Y). `solid` is the primitive that
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
// Files round their dimensions; treat values within 0.1% as equal.
const same = (a: number, b: number) => Math.abs(Math.abs(a) - Math.abs(b)) <= 1e-3 * Math.max(Math.abs(a), Math.abs(b));

/**
 * Classify signed IES luminous-opening dimensions (negative values describe round shapes).
 * `units` is the IES units type of the dimensions; the result is always in metres. Sign combinations
 * outside Table 1 fall back to a rectangle (or box) of their absolute extents.
 */
export function luminousShape(
  dimensions: { width: number; length: number; height: number },
  units: 'feet' | 'meters' = 'meters',
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
  switch (sign(w) + sign(l) + sign(h)) {
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
    // Before 2019 (and in LDT conversions) a circle is a negative diameter with the other side zero.
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
