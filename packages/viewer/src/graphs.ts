import { sampleIntensity, type IESProfile } from '@ies-tools/core';

export type GraphAxis = 'vertical' | 'horizontal';
export type UpAxis = 'x' | 'y' | 'z';
export type Point2 = [number, number];
export type Point3 = [number, number, number];

function finite(value: number, name: string, min = -Infinity, max = Infinity): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be finite and in [${min}, ${max}]`);
  }
  return value;
}
function count(value: number, name: string, min: number, max: number): number {
  finite(value, name, min, max);
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be an integer`);
  return value;
}
function choice<T extends string>(value: T, options: readonly T[], name: string): T {
  if (!options.includes(value)) throw new RangeError(`${name} must be one of ${options.join(', ')}`);
  return value;
}
function typeC(profile: IESProfile): void {
  if (profile.photometricType !== 1) throw new Error('Photometric graphs support Type C photometry only (type 1)');
}
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const wrapped = (angle: number) => ((angle % 360) + 360) % 360;
function sample(profile: IESProfile, vertical: number, horizontal: number, lampTilt: number): number {
  return finite(sampleIntensity(profile, vertical, horizontal, lampTilt), 'Sampled candela', 0);
}

/** Rounded positive ticks suitable for candela or lux axes, including zero. */
export function niceTicks(maximum: number, intervals = 4): number[] {
  finite(maximum, 'Maximum', 0);
  count(intervals, 'Tick intervals', 2, 10);
  const raw = (maximum || 1) / intervals;
  if (raw === 0) return [0, maximum];
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  const last = Math.ceil((maximum || 1) / step);
  if (!Number.isFinite(last * step)) return Array.from({ length: intervals + 1 }, (_, i) => (i / intervals) * maximum);
  return Array.from({ length: last + 1 }, (_, i) => Number((i * step).toPrecision(12)));
}
export function formatGraphValue(value: number): string {
  if (value !== 0 && (Math.abs(value) < 0.01 || Math.abs(value) >= 100000)) return value.toExponential(1);
  return Number(value.toPrecision(4)).toString();
}
export interface IntensityCurveOptions {
  axis?: GraphAxis;
  angle?: number;
  /** Fixed planes: azimuth for vertical sweeps; vertical angle for horizontal sweeps. */
  planes?: readonly number[];
  /** Use C0–C180 and C90–C270 when planes are omitted and axis is vertical. */
  principalPlanes?: boolean;
  /** Odd sample count includes nadir in complete opposed-plane vertical cuts. */
  samples?: number;
  /** Lamp-dependent IES correction angle, independent of fixture aiming. */
  lampTilt?: number;
}
export interface IntensityCurve {
  plane: number;
  oppositePlane?: number;
  label: string;
  points: { angle: number; intensity: number }[];
}
export interface IntensityCurves {
  axis: GraphAxis;
  curves: IntensityCurve[];
  maximum: number;
  angleRange: Point2;
  angleTicks: number[];
  intensityTicks: number[];
}
/** Complete opposed-plane vertical cuts use negative gamma for C+180 and positive gamma for C. */
export function buildIntensityCurves(profile: IESProfile, options: IntensityCurveOptions = {}): IntensityCurves {
  typeC(profile);
  const axis = choice(options.axis ?? 'vertical', ['vertical', 'horizontal'], 'Graph axis');
  const angle = finite(options.angle ?? 0, 'Fixed angle', 0, axis === 'vertical' ? 360 : 180);
  const samples = count(options.samples ?? 361, 'Curve samples', 3, 1441);
  if (axis === 'vertical' && samples % 2 === 0)
    throw new RangeError('Vertical curve samples must be odd to include nadir');
  const lampTilt = finite(options.lampTilt ?? 0, 'Lamp tilt', -180, 180);
  const planes = options.planes ?? (options.principalPlanes && axis === 'vertical' ? [0, 90] : [angle]);
  count(planes.length, 'Plane count', 1, 8);
  const angles = new Set(
    Array.from({ length: samples }, (_, i) =>
      axis === 'vertical' ? -180 + (i * 360) / (samples - 1) : (i * 360) / (samples - 1),
    ),
  );
  if (axis === 'vertical') {
    for (const value of profile.verticalAngles) {
      angles.add(value);
      angles.add(-value);
    }
  } else {
    const base = profile.horizontalAngles[0]!,
      span = profile.horizontalAngles.at(-1)! - base;
    for (const value of profile.horizontalAngles) {
      angles.add(wrapped(value));
      if (span > 0 && span <= 180)
        for (let cycle = -2; cycle <= 2; cycle++) {
          angles.add(wrapped(value + cycle * 2 * span));
          angles.add(wrapped(2 * (base + span) - value + cycle * 2 * span));
        }
    }
  }
  const positions = [...angles].toSorted((a, b) => a - b);
  const curves = planes.map((plane): IntensityCurve => {
    finite(plane, 'Plane angle', 0, axis === 'vertical' ? 360 : 180);
    const fixed = axis === 'vertical' ? wrapped(plane) : plane;
    const oppositePlane = axis === 'vertical' ? wrapped(fixed + 180) : undefined;
    return {
      plane: fixed,
      oppositePlane,
      label:
        axis === 'vertical'
          ? `C${formatGraphValue(fixed)}°–C${formatGraphValue(oppositePlane!)}°`
          : `γ ${formatGraphValue(fixed)}°`,
      points: positions.map((position) => {
        const cd =
          axis === 'vertical'
            ? sample(profile, Math.abs(position), position < 0 ? oppositePlane! : fixed, lampTilt)
            : sample(profile, fixed, position, lampTilt);
        return { angle: position, intensity: cd };
      }),
    };
  });
  const maximum = curves.reduce(
    (max, curve) => curve.points.reduce((value, point) => Math.max(value, point.intensity), max),
    0,
  );
  return {
    axis,
    curves,
    maximum,
    angleRange: axis === 'vertical' ? [-180, 180] : [0, 360],
    angleTicks: axis === 'vertical' ? [-180, -90, 0, 90, 180] : [0, 90, 180, 270, 360],
    intensityTicks: niceTicks(maximum),
  };
}

export interface TopologyOptions {
  upAxis?: UpAxis;
  projection?: 'orthographic' | 'perspective';
  azimuth?: number;
  elevation?: number;
  horizontalSegments?: number;
  verticalSegments?: number;
  lampTilt?: number;
}
export interface TopologyVertex {
  /** Actual candela-scaled position, in the source luminaire's Y-up coordinates. */
  position: Point3;
  /** Projected coordinates normalized to the peak intensity. Positive Y points up. */
  projected: Point2;
  depth: number;
  intensity: number;
}
export interface IntensityTopology {
  vertices: TopologyVertex[];
  /** Triangles ordered far to near for SVG painting; indices address vertices. */
  faces: [number, number, number][];
  maximum: number;
}
/** Proper axis rotations preserve orientation and lengths, rather than reflecting the surface. */
export function orientGraphPoint([x, y, z]: Point3, upAxis: UpAxis = 'y'): Point3 {
  choice(upAxis, ['x', 'y', 'z'], 'Up axis');
  return upAxis === 'x' ? [-y, x, z] : upAxis === 'z' ? [x, z, -y] : [x, y, z];
}
export function buildIntensityTopology(profile: IESProfile, options: TopologyOptions = {}): IntensityTopology {
  typeC(profile);
  const upAxis = choice(options.upAxis ?? 'y', ['x', 'y', 'z'], 'Up axis');
  const projection = choice(
    options.projection ?? 'orthographic',
    ['orthographic', 'perspective'],
    'Topology projection',
  );
  const azimuth = radians(finite(options.azimuth ?? 45, 'View azimuth', -360, 360));
  const elevation = radians(finite(options.elevation ?? 30, 'View elevation', -90, 90));
  const hs = count(options.horizontalSegments ?? 36, 'Horizontal segments', 4, 144);
  const vs = count(options.verticalSegments ?? 36, 'Vertical segments', 2, 144);
  const lampTilt = finite(options.lampTilt ?? 0, 'Lamp tilt', -180, 180);
  let maximum = 0;
  const vertices: TopologyVertex[] = [];
  for (let v = 0; v <= vs; v++) {
    const theta = (v * Math.PI) / vs;
    for (let h = 0; h <= hs; h++) {
      const phi = (h * Math.PI * 2) / hs;
      const intensity = sample(profile, (v * 180) / vs, (h * 360) / hs, lampTilt);
      maximum = Math.max(maximum, intensity);
      const position: Point3 = [
        Math.sin(theta) * Math.cos(phi) * intensity,
        -Math.cos(theta) * intensity,
        Math.sin(theta) * Math.sin(phi) * intensity,
      ];
      vertices.push({ position, projected: [0, 0], depth: 0, intensity });
    }
  }
  for (const vertex of vertices) {
    const [x, y, z] = orientGraphPoint(vertex.position, upAxis).map((value) => value / (maximum || 1)) as Point3;
    const sx = Math.cos(azimuth) * x - Math.sin(azimuth) * z;
    const plane = Math.sin(azimuth) * x + Math.cos(azimuth) * z;
    const sy = Math.cos(elevation) * y - Math.sin(elevation) * plane;
    vertex.depth = Math.sin(elevation) * y + Math.cos(elevation) * plane;
    const factor = projection === 'perspective' ? 3 / (3 - vertex.depth) : 1;
    vertex.projected = [sx * factor, sy * factor];
  }
  const faces: [number, number, number][] = [];
  for (let v = 0; v < vs; v++)
    for (let h = 0; h < hs; h++) {
      const a = v * (hs + 1) + h,
        b = a + 1,
        c = a + hs + 1,
        d = c + 1;
      faces.push([a, c, b], [b, c, d]);
    }
  const depth = (face: [number, number, number]) => face.reduce((sum, index) => sum + vertices[index]!.depth, 0);
  faces.sort((a, b) => depth(a) - depth(b));
  return { vertices, faces, maximum };
}

export interface IsoluxOptions {
  mountingHeight?: number;
  /** Full ground width/depth in metres, centered below the fixture. */
  extent?: number | Point2;
  /** Grid points per axis, not cells; default 51, maximum 201. */
  resolution?: number | Point2;
  /** Aim away from nadir toward azimuth, in degrees. Does not alter the lamp correction. */
  aimAngle?: number;
  /** Ground direction measured from +X toward +Z; also orients the C0 plane. */
  azimuth?: number;
  lampTilt?: number;
}
export interface ContourGrid {
  xs: number[];
  zs: number[];
  values: number[][];
}
export interface IsoluxGrid extends ContourGrid {
  maximum: number;
  minimum: number;
  average: number;
  mountingHeight: number;
  extent: Point2;
}
function isoluxParameters(options: IsoluxOptions) {
  return {
    mountingHeight: finite(options.mountingHeight ?? 2, 'Mounting height', 0.01, 10000),
    aimAngle: radians(finite(options.aimAngle ?? 0, 'Fixture aim', 0, 180)),
    azimuth: radians(finite(options.azimuth ?? 0, 'Fixture azimuth', -360, 360)),
    lampTilt: finite(options.lampTilt ?? 0, 'Lamp tilt', -180, 180),
  };
}
function groundLux(profile: IESProfile, x: number, z: number, parameters: ReturnType<typeof isoluxParameters>): number {
  const { mountingHeight: height, aimAngle: aim, azimuth, lampTilt } = parameters;
  const distance = Math.hypot(x, height, z);
  // Inverse of Ry(-azimuth) Rz(aim): transform world receiver direction into the fixture frame.
  const p = Math.cos(azimuth) * x + Math.sin(azimuth) * z;
  const localX = Math.cos(aim) * p - Math.sin(aim) * height;
  const localY = -Math.sin(aim) * p - Math.cos(aim) * height;
  const localZ = -Math.sin(azimuth) * x + Math.cos(azimuth) * z;
  const vertical = (Math.acos(Math.max(-1, Math.min(1, -localY / distance))) * 180) / Math.PI;
  const horizontal = wrapped((Math.atan2(localZ, localX) * 180) / Math.PI);
  const lux = (sample(profile, vertical, horizontal, lampTilt) * (height / distance)) / distance ** 2;
  if (!Number.isFinite(lux)) throw new RangeError('Ground illuminance exceeds the supported numeric range');
  return lux;
}
/** Absolute ground-plane illuminance: I(direction) × receiver cosine / distance². */
export function groundIlluminance(profile: IESProfile, x: number, z: number, options: IsoluxOptions = {}): number {
  typeC(profile);
  finite(x, 'Ground X');
  finite(z, 'Ground Z');
  return groundLux(profile, x, z, isoluxParameters(options));
}
export function buildIsoluxGrid(profile: IESProfile, options: IsoluxOptions = {}): IsoluxGrid {
  typeC(profile);
  const parameters = isoluxParameters(options);
  const extent = typeof options.extent === 'number' ? [options.extent, options.extent] : (options.extent ?? [10, 10]);
  if (extent.length !== 2) throw new RangeError('Ground extent must have two dimensions');
  const width = finite(extent[0]!, 'Ground width', 0.01, 100000);
  const depth = finite(extent[1]!, 'Ground depth', 0.01, 100000);
  const resolution =
    typeof options.resolution === 'number'
      ? [options.resolution, options.resolution]
      : (options.resolution ?? [51, 51]);
  if (resolution.length !== 2) throw new RangeError('Grid resolution must have two dimensions');
  const columns = count(resolution[0]!, 'Grid columns', 2, 201),
    rows = count(resolution[1]!, 'Grid rows', 2, 201);
  const xs = Array.from({ length: columns }, (_, i) => -width / 2 + (i * width) / (columns - 1));
  const zs = Array.from({ length: rows }, (_, i) => -depth / 2 + (i * depth) / (rows - 1));
  let maximum = 0,
    minimum = Infinity,
    average = 0,
    seen = 0;
  const values = zs.map((z) =>
    xs.map((x) => {
      const lux = groundLux(profile, x, z, parameters);
      maximum = Math.max(maximum, lux);
      minimum = Math.min(minimum, lux);
      seen++;
      average += (lux - average) / seen;
      return lux;
    }),
  );
  return {
    xs,
    zs,
    values,
    maximum,
    minimum,
    average,
    mountingHeight: parameters.mountingHeight,
    extent: [width, depth],
  };
}
export interface Contour {
  level: number;
  segments: [Point2, Point2][];
}
/** Marching squares with a center-value saddle decision. Segments use the grid's physical coordinates. */
export function extractContours(grid: ContourGrid, levels: readonly number[]): Contour[] {
  count(grid.xs.length, 'Contour columns', 2, 201);
  count(grid.zs.length, 'Contour rows', 2, 201);
  for (const [name, coordinates] of [
    ['X', grid.xs],
    ['Z', grid.zs],
  ] as const) {
    coordinates.forEach((value, i) => {
      finite(value, `${name} coordinate`);
      if (i && value <= coordinates[i - 1]!) throw new RangeError('Contour coordinates must be strictly increasing');
    });
  }
  if (
    grid.values.length !== grid.zs.length ||
    grid.values.some((row) => row.length !== grid.xs.length || row.some((value) => !Number.isFinite(value)))
  )
    throw new RangeError('Contour values must form a finite rectangular grid');
  count(levels.length, 'Contour level count', 0, 32);
  levels.forEach((level, i) => {
    finite(level, 'Contour level');
    if (i && level <= levels[i - 1]!) throw new RangeError('Contour levels must be strictly increasing');
  });
  return levels.map((level) => {
    const segments: [Point2, Point2][] = [];
    for (let z = 0; z < grid.zs.length - 1; z++)
      for (let x = 0; x < grid.xs.length - 1; x++) {
        const corners: Point2[] = [
          [grid.xs[x]!, grid.zs[z]!],
          [grid.xs[x + 1]!, grid.zs[z]!],
          [grid.xs[x + 1]!, grid.zs[z + 1]!],
          [grid.xs[x]!, grid.zs[z + 1]!],
        ];
        const values = [
          grid.values[z]![x]!,
          grid.values[z]![x + 1]!,
          grid.values[z + 1]![x + 1]!,
          grid.values[z + 1]![x]!,
        ];
        const mask = values.reduce((bits, value, i) => bits | (value >= level ? 1 << i : 0), 0);
        if (mask === 0 || mask === 15) continue;
        const intersections: { edge: number; point: Point2 }[] = [];
        for (let edge = 0; edge < 4; edge++) {
          const next = (edge + 1) % 4,
            a = values[edge]!,
            b = values[next]!;
          if (a >= level === b >= level) continue;
          const t = (level - a) / (b - a),
            p = corners[edge]!,
            q = corners[next]!;
          intersections.push({ edge, point: [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])] });
        }
        const add = (a: number, b: number) => {
          const p = intersections[a]!.point,
            q = intersections[b]!.point;
          if (p[0] !== q[0] || p[1] !== q[1]) segments.push([p, q]);
        };
        if (intersections.length === 2) add(0, 1);
        else if (intersections.length === 4) {
          const centerInside = values.reduce((sum, value) => sum + value / 4, 0) >= level;
          if ((mask === 5) === centerInside) {
            add(0, 1);
            add(2, 3);
          } else {
            add(0, 3);
            add(1, 2);
          }
        }
      }
    return { level, segments };
  });
}
