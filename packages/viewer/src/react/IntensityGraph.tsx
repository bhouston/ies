import { type CSSProperties } from 'react';
import { type IESProfile } from '@ies-tools/core';
import {
  buildIntensityCurves,
  buildIntensityTopology,
  formatGraphValue,
  graphFrame,
  type IntensityCurveOptions,
  type UpAxis,
} from '../graphs.js';

const colors = ['#7dd3fc', '#fbbf24', '#86efac', '#f9a8d4', '#c4b5fd', '#5eead4', '#fdba74', '#d9f99d'];
/** Props for {@link IntensityGraph}. */
export interface IntensityGraphProps extends IntensityCurveOptions {
  /** Type C profile to plot. */
  profile: IESProfile;
  /** Polar or Cartesian intensity cuts, or a 3D intensity topology. Defaults to `polar`. */
  projection?: 'polar' | 'cartesian' | 'topology';
  /** Vertical axis of the topology view. */
  upAxis?: UpAxis;
  /** Camera projection of the topology view. */
  topologyProjection?: 'orthographic' | 'perspective';
  /** Topology camera azimuth in degrees. */
  viewAzimuth?: number;
  /** Topology camera elevation in degrees. */
  viewElevation?: number;
  /** Topology surface style. */
  surface?: 'filled' | 'wireframe' | 'both';
  /** Topology mesh segments around the horizontal C angle. */
  horizontalSegments?: number;
  /** Topology mesh segments along the vertical gamma angle. */
  verticalSegments?: number;
  /** Viewbox width / height; the background fills it and the graph is centered (Cartesian plots widen). Defaults to the native layout. */
  aspectRatio?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * SVG photometric intensity diagrams: complete polar or Cartesian cuts, or a 3D intensity topology.
 * Needs no GPU; all geometry is also available through `@ies-tools/viewer/graphs`.
 *
 * @param props - See {@link IntensityGraphProps}.
 *
 * @example
 * ```tsx
 * <IntensityGraph profile={profile} principalPlanes />
 * <IntensityGraph profile={profile} projection="cartesian" planes={[0, 45, 90]} />
 * ```
 */
export function IntensityGraph({
  profile,
  projection = 'polar',
  upAxis = 'y',
  topologyProjection = 'orthographic',
  viewAzimuth = 45,
  viewElevation = 30,
  surface = 'both',
  horizontalSegments,
  verticalSegments,
  aspectRatio,
  className,
  style,
  ...curvesOptions
}: IntensityGraphProps) {
  if (!['polar', 'cartesian', 'topology'].includes(projection))
    throw new RangeError('Graph projection must be polar, cartesian, or topology');
  if (!['filled', 'wireframe', 'both'].includes(surface))
    throw new RangeError('Topology surface must be filled, wireframe, or both');
  const diagram = projection === 'topology' ? undefined : buildIntensityCurves(profile, curvesOptions);
  const topology =
    projection === 'topology'
      ? buildIntensityTopology(profile, {
          upAxis,
          projection: topologyProjection,
          azimuth: viewAzimuth,
          elevation: viewElevation,
          horizontalSegments,
          verticalSegments,
          lampTilt: curvesOptions.lampTilt,
        })
      : undefined;
  const maximum = topology?.maximum ?? diagram!.maximum;
  const axis = curvesOptions.axis ?? 'vertical';
  const fixedAngle = curvesOptions.angle ?? 0;
  const title = `${projection} luminous intensity graph, ${axis} axis, ${fixedAngle} degrees, ${topology ? 'sampled surface' : 'shown curves'} maximum ${formatGraphValue(maximum)} candela`;
  const tickMaximum = diagram?.intensityTicks.at(-1) ?? 1;
  const layoutWidth = projection === 'cartesian' && aspectRatio ? Math.max(520, 560 * aspectRatio) : 520;
  const frame = graphFrame(layoutWidth, 560, aspectRatio);
  const plot = { left: 72, top: 64, width: layoutWidth - 120, height: 330 };
  const center = { x: 260, y: 240, radius: 170 };
  const mapX = (angle: number) =>
    plot.left + ((angle - diagram!.angleRange[0]) / (diagram!.angleRange[1] - diagram!.angleRange[0])) * plot.width;
  const mapY = (cd: number) => plot.top + plot.height - (cd / tickMaximum) * plot.height;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={frame.width}
      height={frame.height}
      className={className}
      style={{
        width: '100%',
        height: 'auto',
        fontFamily: 'sans-serif',
        maxWidth: 620,
        background: '#111',
        color: '#ddd',
        ...style,
      }}
      viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
      // SVG contains accessible image geometry directly.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill="#111" />
      <text x="24" y="28" fill="currentColor" fontSize="14">
        Luminous intensity · {projection}
      </text>
      <text x="24" y="48" fill="#a5adb7" fontSize="11">
        {topology ? 'Sampled surface peak' : 'Shown curves peak'} {formatGraphValue(maximum)} cd
        {topology ? ` · ${upAxis.toUpperCase()} up · ${topologyProjection}` : ''}
      </text>
      {projection === 'polar' && (
        <>
          {diagram!.intensityTicks.slice(1).map((tick) => (
            <g key={tick}>
              <circle
                cx={center.x}
                cy={center.y}
                r={(tick / tickMaximum) * center.radius}
                fill="none"
                stroke="#374151"
              />
              <text
                x={center.x + 5}
                y={center.y - (tick / tickMaximum) * center.radius - 3}
                fontSize="10"
                fill="#b7c1ce"
              >
                {formatGraphValue(tick)} cd
              </text>
            </g>
          ))}
          <path
            d={`M${center.x - center.radius} ${center.y}H${center.x + center.radius}M${center.x} ${center.y - center.radius}V${center.y + center.radius}`}
            stroke="#4b5563"
          />
          <text x={center.x + center.radius + 6} y={center.y + 4} fontSize="11" fill="currentColor">
            90°
          </text>
          <text x={center.x - center.radius - 35} y={center.y + 4} fontSize="11" fill="currentColor">
            {axis === 'vertical' ? '−90°' : '270°'}
          </text>
          <text x={center.x - 10} y={center.y + center.radius + 18} fontSize="11" fill="currentColor">
            0°
          </text>
          <text x={center.x - 16} y={center.y - center.radius - 14} fontSize="11" fill="currentColor">
            180°
          </text>
          {diagram!.curves.map((curve, i) => (
            <polyline
              key={`${curve.plane}-${i}`}
              data-plane={curve.plane}
              points={curve.points
                .map((point) => {
                  const theta = (point.angle * Math.PI) / 180,
                    r = (point.intensity / tickMaximum) * center.radius;
                  return `${center.x + Math.sin(theta) * r},${center.y + Math.cos(theta) * r}`;
                })
                .join(' ')}
              fill="none"
              stroke={colors[i]}
              strokeWidth="2"
            />
          ))}
        </>
      )}
      {projection === 'cartesian' && (
        <>
          {diagram!.intensityTicks.map((tick) => (
            <g key={tick}>
              <path d={`M${plot.left} ${mapY(tick)}h${plot.width}`} stroke="#374151" />
              <text x={plot.left - 9} y={mapY(tick) + 4} textAnchor="end" fill="currentColor" fontSize="11">
                {formatGraphValue(tick)}
              </text>
            </g>
          ))}
          {diagram!.angleTicks.map((tick) => (
            <g key={tick}>
              <path d={`M${mapX(tick)} ${plot.top}v${plot.height}`} stroke="#28313f" />
              <text
                x={mapX(tick)}
                y={plot.top + plot.height + 20}
                textAnchor="middle"
                fill="currentColor"
                fontSize="11"
              >
                {tick}°
              </text>
            </g>
          ))}
          <text
            x={plot.left + plot.width / 2}
            y={plot.top + plot.height + 44}
            textAnchor="middle"
            fill="currentColor"
            fontSize="12"
          >
            {axis === 'vertical' ? 'Signed vertical angle γ (°)' : 'Horizontal angle C (°)'}
          </text>
          <text x="18" y="235" transform="rotate(-90 18 235)" textAnchor="middle" fill="currentColor" fontSize="12">
            Intensity (cd)
          </text>
          {diagram!.curves.map((curve, i) => (
            <polyline
              key={`${curve.plane}-${i}`}
              data-plane={curve.plane}
              points={curve.points.map((point) => `${mapX(point.angle)},${mapY(point.intensity)}`).join(' ')}
              fill="none"
              stroke={colors[i]}
              strokeWidth="2"
            />
          ))}
        </>
      )}
      {topology && (
        <>
          {topology.faces.map((face, index) => {
            const cd = face.reduce((sum, vertex) => sum + topology.vertices[vertex]!.intensity / 3, 0);
            const fraction = cd / (topology.maximum || 1);
            return (
              <polygon
                key={index}
                points={face
                  .map((vertex) => {
                    const p = topology.vertices[vertex]!.projected;
                    return `${260 + p[0] * 185},${250 - p[1] * 185}`;
                  })
                  .join(' ')}
                fill={surface === 'wireframe' ? 'none' : `hsl(${230 - fraction * 190} 75% ${32 + fraction * 28}%)`}
                stroke={surface === 'filled' ? 'none' : '#9bc7e8'}
                strokeOpacity="0.45"
                strokeWidth="0.55"
              />
            );
          })}
          <text x="24" y="480" fill="#b7c1ce" fontSize="12">
            Candela-scaled surface · {upAxis.toUpperCase()} up
          </text>
          <text x="24" y="500" fill="#b7c1ce" fontSize="11">
            View azimuth {viewAzimuth}° · elevation {viewElevation}°
          </text>
        </>
      )}
      {diagram?.curves.map((curve, i) => (
        <g key={`${curve.plane}-${i}`} transform={`translate(${24 + (i % 2) * 248} ${470 + Math.floor(i / 2) * 20})`}>
          <path d="M0 0h22" stroke={colors[i]} strokeWidth="2" />
          <text x="28" y="4" fill="currentColor" fontSize="12">
            {curve.label}
          </text>
        </g>
      ))}
      {diagram && (
        <text x="24" y="550" fill="#9ca3af" fontSize="10">
          {axis === 'vertical'
            ? 'Negative γ: opposite C-plane · positive γ: selected C-plane'
            : 'Each curve sweeps 0–360° at the indicated fixed vertical angle'}
        </text>
      )}
    </svg>
  );
}
