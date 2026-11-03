import { type CSSProperties } from 'react';
import { type IESProfile } from '@ies-tools/core';
import {
  buildIsoluxGrid,
  extractContours,
  formatGraphValue,
  graphFrame,
  niceTicks,
  type IsoluxOptions,
} from '../graphs.js';

/** Props for {@link IsoluxGraph}. */
export interface IsoluxGraphProps extends IsoluxOptions {
  /** Type C profile to evaluate. */
  profile: IESProfile;
  /** Absolute lux levels. Omit to choose rounded levels from the grid maximum. */
  contours?: readonly number[];
  /** Draw the lux heatmap beneath the contours. Defaults to true. */
  heatmap?: boolean;
  /** Viewbox width / height; the background fills it and the graph is centered. Defaults to the native layout. */
  aspectRatio?: number;
  className?: string;
  style?: CSSProperties;
}
/**
 * SVG ground-plane illuminance heatmap with lux contours, for a fixture at a mounting height and aim.
 *
 * @param props - See {@link IsoluxGraphProps}.
 *
 * @example
 * ```tsx
 * <IsoluxGraph profile={profile} mountingHeight={3} extent={[12, 8]} aimAngle={30} />
 * ```
 */
export function IsoluxGraph({
  profile,
  contours,
  heatmap = true,
  aspectRatio,
  className,
  style,
  ...options
}: IsoluxGraphProps) {
  const grid = buildIsoluxGrid(profile, options);
  const levels = contours ?? niceTicks(grid.maximum).filter((value) => value > 0 && value < grid.maximum);
  if (levels.some((level) => level < 0)) throw new RangeError('Isolux contour levels must be nonnegative lux values');
  const lines = extractContours(grid, levels);
  const legendRows = Array.from({ length: Math.max(1, Math.ceil(lines.length / 5)) }, (_, i) =>
    lines.slice(i * 5, i * 5 + 5),
  );
  const extraHeight = (legendRows.length - 1) * 18;
  const frame = graphFrame(520, 560 + extraHeight, aspectRatio);
  const [width, depth] = grid.extent;
  const scale = 370 / Math.max(width, depth),
    plotWidth = width * scale,
    plotHeight = depth * scale;
  const left = 260 - plotWidth / 2,
    bottom = 250 + plotHeight / 2;
  const screenX = (x: number) => left + (x + width / 2) * scale;
  const screenZ = (z: number) => bottom - (z + depth / 2) * scale;
  const title = `Ground illuminance isolux graph, mounting height ${grid.mountingHeight} metres, maximum ${formatGraphValue(grid.maximum)} lux`;
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
      // SVG contains the graph itself, with a textual image description.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill="#111" />
      <text x="24" y="28" fill="currentColor" fontSize="14">
        Ground illuminance · lux
      </text>
      <text x="24" y="48" fill="#b7c1ce" fontSize="11">
        {grid.mountingHeight} m high · aim {options.aimAngle ?? 0}° · azimuth {options.azimuth ?? 0}°
      </text>
      <rect x={left} y={bottom - plotHeight} width={plotWidth} height={plotHeight} fill="#101b36" stroke="#64748b" />
      {heatmap &&
        grid.values.slice(0, -1).flatMap((row, z) =>
          row.slice(0, -1).map((value, x) => {
            const average = value / 4 + row[x + 1]! / 4 + grid.values[z + 1]![x]! / 4 + grid.values[z + 1]![x + 1]! / 4;
            const intensity = average / (grid.maximum || 1);
            return (
              <rect
                key={`${x}-${z}`}
                x={screenX(grid.xs[x]!)}
                y={screenZ(grid.zs[z + 1]!)}
                width={(grid.xs[x + 1]! - grid.xs[x]!) * scale + 0.1}
                height={(grid.zs[z + 1]! - grid.zs[z]!) * scale + 0.1}
                fill={`hsl(${235 - intensity * 195} 80% ${15 + intensity * 50}%)`}
              />
            );
          }),
        )}
      {lines.map((line) => (
        <g key={line.level}>
          <path
            data-level={line.level}
            d={line.segments
              .map(([a, b]) => `M${screenX(a[0])} ${screenZ(a[1])}L${screenX(b[0])} ${screenZ(b[1])}`)
              .join(' ')}
            fill="none"
            stroke="#fff"
            strokeWidth="1"
            strokeOpacity="0.8"
          />
          <title>{`${formatGraphValue(line.level)} lux contour`}</title>
        </g>
      ))}
      <path
        d={`M${screenX(0) - 5} ${screenZ(0)}h10M${screenX(0)} ${screenZ(0) - 5}v10`}
        stroke="#fff"
        strokeWidth="1.5"
      />
      {[-0.5, -0.25, 0, 0.25, 0.5].map((fraction) => (
        <g key={fraction}>
          <text x={screenX(fraction * width)} y={bottom + 19} textAnchor="middle" fill="currentColor" fontSize="10">
            {formatGraphValue(fraction * width)}
          </text>
          <text x={left - 8} y={screenZ(fraction * depth) + 3} textAnchor="end" fill="currentColor" fontSize="10">
            {formatGraphValue(fraction * depth)}
          </text>
        </g>
      ))}
      <text x="260" y={bottom + 40} textAnchor="middle" fill="currentColor" fontSize="12">
        X (m)
      </text>
      <text x="20" y="250" transform="rotate(-90 20 250)" textAnchor="middle" fill="currentColor" fontSize="12">
        Z (m)
      </text>
      <text x="24" y="500" fill="currentColor" fontSize="12">
        Grid peak {formatGraphValue(grid.maximum)} lx · min {formatGraphValue(grid.minimum)} lx · grid mean{' '}
        {formatGraphValue(grid.average)} lx
      </text>
      {legendRows.map((row, i) => (
        <text key={i} x="24" y={522 + i * 18} fill="#b7c1ce" fontSize="10">
          {`${i === 0 ? 'Contours: ' : ''}${row.length ? row.map((line) => `${formatGraphValue(line.level)} lx`).join(' · ') : 'none in this range'}`}
        </text>
      ))}
      <text x="24" y={545 + extraHeight} fill="#9ca3af" fontSize="10">
        Inverse-square + receiver cosine · fixture aim is separate from lamp TILT
      </text>
    </svg>
  );
}
