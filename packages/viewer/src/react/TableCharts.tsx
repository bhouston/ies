import { type CSSProperties, type ReactNode } from 'react';
import { type IESProfile } from '@ies-tools/core';
import {
  buildConeDiagram,
  buildIntensityTable,
  buildLuminanceTable,
  formatGraphValue,
  graphFrame,
  heatColor,
  type ConeOptions,
  type IntensityTableOptions,
  type LuminanceTableOptions,
} from '../graphs.js';

interface ChartStyleProps {
  /** Viewbox width / height; the background fills it and the chart is centered. Defaults to the native layout. */
  aspectRatio?: number;
  className?: string;
  style?: CSSProperties;
}
const muted = '#b7c1ce';
const format = (value: number | null) => (value === null ? '—' : formatGraphValue(value));
const offset = (distance: number, angle: number) => distance * Math.tan((angle * Math.PI) / 180);
const angles = (left?: number, right?: number) =>
  left === undefined || right === undefined ? '—' : `${formatGraphValue(right - left)}°`;
const fractions = (values: (number | null)[][]) => {
  const max = Math.max(0, ...values.flat().map((v) => v ?? 0));
  return values.map((row) => row.map((v) => (max > 0 && v !== null ? v / max : 0)));
};

function Frame({
  width,
  height,
  label,
  aspectRatio,
  className,
  style,
  children,
}: ChartStyleProps & { width: number; height: number; label: string; children: ReactNode }) {
  const frame = graphFrame(width, height, aspectRatio);
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
        maxWidth: Math.max(620, width),
        background: '#111',
        color: '#ddd',
        ...style,
      }}
      viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
      // SVG contains the chart itself, with a textual image description.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill="#111" />
      {children}
    </svg>
  );
}

/** Non-Type C files get a readable SVG message rather than an exception. */
function TypeCOnly({ name, ...props }: ChartStyleProps & { name: string }) {
  const label = `${name} is available for Type C photometry only`;
  return (
    <Frame width={520} height={120} label={label} {...props}>
      <text x="24" y="64" fill="currentColor" fontSize="14">
        {label}.
      </text>
    </Frame>
  );
}

function Table({
  x,
  y,
  corner,
  columns,
  rows,
  cells,
  tint,
  cellWidth,
  headerWidth = cellWidth,
  cellHeight = 18,
  fontSize = 10,
}: {
  x: number;
  y: number;
  corner: string;
  columns: string[];
  rows: string[];
  cells: string[][];
  /** Value fractions in [0, 1]; alpha follows sqrt(fraction) for a subtle tint. */
  tint?: number[][];
  cellWidth: number;
  headerWidth?: number;
  cellHeight?: number;
  fontSize?: number;
}) {
  const text = (tx: number, ty: number, value: string, fill = 'currentColor', key?: string) => (
    <text
      key={key}
      x={tx}
      y={ty + cellHeight / 2 + fontSize * 0.35}
      textAnchor="middle"
      fill={fill}
      fontSize={fontSize}
    >
      {value}
    </text>
  );
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={headerWidth + columns.length * cellWidth}
        height={(rows.length + 1) * cellHeight}
        fill="#161c26"
        stroke="#334155"
      />
      {text(x + headerWidth / 2, y, corner, muted)}
      {columns.map((column, j) => text(x + headerWidth + (j + 0.5) * cellWidth, y, column, muted, `c${j}`))}
      {rows.map((row, i) => {
        const top = y + (i + 1) * cellHeight;
        return (
          <g key={i}>
            {text(x + headerWidth / 2, top, row, muted)}
            {cells[i]!.map((cell, j) => {
              const fraction = tint?.[i]?.[j] ?? 0;
              return (
                <g key={j}>
                  {fraction > 0 && (
                    <rect
                      x={x + headerWidth + j * cellWidth}
                      y={top}
                      width={cellWidth}
                      height={cellHeight}
                      fill={heatColor(fraction)}
                      fillOpacity={0.6 * Math.sqrt(fraction)}
                    />
                  )}
                  {text(x + headerWidth + (j + 0.5) * cellWidth, top, cell)}
                </g>
              );
            })}
          </g>
        );
      })}
      <path
        d={`M${x} ${y + cellHeight}h${headerWidth + columns.length * cellWidth}M${x + headerWidth} ${y}v${(rows.length + 1) * cellHeight}`}
        stroke="#334155"
      />
    </g>
  );
}

/** Props for {@link ConeDiagramGraph}. */
export interface ConeDiagramGraphProps extends ConeOptions, ChartStyleProps {
  /** Type C profile to evaluate. */
  profile: IESProfile;
}
/**
 * SVG side-view cone diagram: centre illuminance and beam/field diameters at each distance, plus a table.
 *
 * @example
 * ```tsx
 * <ConeDiagramGraph profile={profile} maxDistance={6} />
 * ```
 */
export function ConeDiagramGraph({ profile, aspectRatio, className, style, ...options }: ConeDiagramGraphProps) {
  if (profile.photometricType !== 1)
    return <TypeCOnly name="Cone diagram" aspectRatio={aspectRatio} className={className} style={style} />;
  const cone = buildConeDiagram(profile, options);
  const deepest = Math.max(...cone.rows.map((row) => row.distance));
  const [c0] = cone.planes;
  const crossings = [
    { name: 'Field cone', tone: 0.35, opacity: 0.3, left: c0.beam.fieldLeftDegrees, right: c0.beam.fieldRightDegrees },
    { name: 'Beam cone', tone: 0.85, opacity: 0.45, left: c0.beam.beamLeftDegrees, right: c0.beam.beamRightDegrees },
  ].filter(
    (cut): cut is typeof cut & { left: number; right: number } =>
      cut.left !== undefined && cut.right !== undefined && Math.abs(cut.left) < 90 && Math.abs(cut.right) < 90,
  );
  const widest = Math.max(
    1e-9,
    ...crossings.flatMap((cut) => [cut.left, cut.right]).map((angle) => Math.abs(offset(deepest, angle))),
  );
  const apex = { x: 260, y: 76 };
  const depthScale = 220 / deepest;
  const scale = Math.min(depthScale, 140 / widest);
  const screenY = (distance: number) => apex.y + distance * depthScale;
  const tableTop = 330,
    rowHeight = 20,
    height = tableTop + (cone.rows.length + 1) * rowHeight + 46;
  const title = `Cone diagram, centre intensity ${formatGraphValue(cone.centerIntensity)} candela, distances up to ${formatGraphValue(deepest)} metres`;
  return (
    <Frame width={520} height={height} label={title} aspectRatio={aspectRatio} className={className} style={style}>
      <text x="24" y="28" fill="currentColor" fontSize="14">
        Cone diagram · C0–C180 side view
      </text>
      <text x="24" y="48" fill={muted} fontSize="11">
        I(γ 0°) {formatGraphValue(cone.centerIntensity)} cd · E = I / d² · beam 50 % · field 10 %
      </text>
      {crossings.map((cut) => (
        <polygon
          key={cut.name}
          points={`${apex.x},${apex.y} ${apex.x + offset(deepest, cut.left) * scale},${screenY(deepest)} ${apex.x + offset(deepest, cut.right) * scale},${screenY(deepest)}`}
          fill={heatColor(cut.tone)}
          fillOpacity={cut.opacity}
          stroke={heatColor(cut.tone)}
        >
          <title>{cut.name}</title>
        </polygon>
      ))}
      <circle cx={apex.x} cy={apex.y} r="5" fill="#fde68a" />
      {cone.rows.map((row) => {
        const y = screenY(row.distance);
        return (
          <g key={row.distance}>
            <path d={`M100 ${y}H420`} stroke="#64748b" strokeDasharray="3 3" />
            <text x="92" y={y + 4} textAnchor="end" fill="currentColor" fontSize="11">
              {formatGraphValue(row.distance)} m
            </text>
            <text x="428" y={y - 2} fill="currentColor" fontSize="10">
              {formatGraphValue(row.illuminance)} lx
            </text>
            <text x="428" y={y + 10} fill={muted} fontSize="9">
              Ø {format(row.beamDiameters[0])} / {format(row.fieldDiameters[0])} m
            </text>
          </g>
        );
      })}
      <Table
        x={24}
        y={tableTop}
        corner="Distance"
        columns={['E centre', 'Beam Ø C0', 'Beam Ø C90', 'Field Ø C0', 'Field Ø C90']}
        rows={cone.rows.map((row) => `${formatGraphValue(row.distance)} m`)}
        cells={cone.rows.map((row) => [
          `${formatGraphValue(row.illuminance)} lx`,
          ...[...row.beamDiameters, ...row.fieldDiameters].map((d) => (d === null ? '—' : `${formatGraphValue(d)} m`)),
        ])}
        cellWidth={79}
        headerWidth={77}
        cellHeight={rowHeight}
      />
      <text x="24" y={height - 26} fill={muted} fontSize="10">
        Beam C0–C180 {angles(c0.beam.beamLeftDegrees, c0.beam.beamRightDegrees)} · C90–C270{' '}
        {angles(cone.planes[1].beam.beamLeftDegrees, cone.planes[1].beam.beamRightDegrees)} · Field C0–C180{' '}
        {angles(c0.beam.fieldLeftDegrees, c0.beam.fieldRightDegrees)} · C90–C270{' '}
        {angles(cone.planes[1].beam.fieldLeftDegrees, cone.planes[1].beam.fieldRightDegrees)}
      </text>
      <text x="24" y={height - 10} fill="#9ca3af" fontSize="10">
        Diameters use per-side 50 %/10 % crossings of the peak · — means no crossing below 90°
      </text>
    </Frame>
  );
}

/** Props for {@link LuminanceTableGraph}. */
export interface LuminanceTableGraphProps extends LuminanceTableOptions, ChartStyleProps {
  /** Type C profile to evaluate. */
  profile: IESProfile;
}
/**
 * SVG glare-angle tables: average luminance L(C, γ) in cd/m² over the luminous opening, and intensity I(C, γ).
 *
 * @example
 * ```tsx
 * <LuminanceTableGraph profile={profile} />
 * ```
 */
export function LuminanceTableGraph({ profile, aspectRatio, className, style, ...options }: LuminanceTableGraphProps) {
  if (profile.photometricType !== 1)
    return <TypeCOnly name="Luminance table" aspectRatio={aspectRatio} className={className} style={style} />;
  const table = buildLuminanceTable(profile, options);
  const columns = table.cPlanes.map((c) => `C${formatGraphValue(c)}`);
  const rows = table.gammas.map((g) => `γ ${formatGraphValue(g)}°`);
  const cellWidth = Math.min(80, 424 / columns.length),
    cellHeight = 18;
  const tableHeight = (rows.length + 1) * cellHeight;
  const secondTop = 96 + tableHeight;
  const height = secondTop + 26 + tableHeight + 44;
  const { opening } = table;
  const size =
    opening.shape === 'circular'
      ? `Ø ${formatGraphValue(opening.width)} m`
      : `${formatGraphValue(opening.width)} × ${formatGraphValue(opening.length)} m`;
  const title = table.luminance
    ? `Glare-angle luminance table in candela per square metre, luminous opening ${size}`
    : 'Glare-angle intensity table; luminance is unavailable because the luminous area is zero';
  return (
    <Frame width={520} height={height} label={title} aspectRatio={aspectRatio} className={className} style={style}>
      <text x="24" y="28" fill="currentColor" fontSize="14">
        Average luminance · cd/m²
      </text>
      <text x="24" y="48" fill={muted} fontSize="11">
        L = I / (A_bottom·cos γ + A_side·sin γ) · opening {size}
        {opening.height > 0 ? ` × ${formatGraphValue(opening.height)} m high` : ''}
      </text>
      {table.luminance ? (
        <Table
          x={24}
          y={64}
          corner=""
          columns={columns}
          rows={rows}
          cells={table.luminance.map((row) => row.map(format))}
          tint={fractions(table.luminance)}
          cellWidth={cellWidth}
          headerWidth={48}
          cellHeight={cellHeight}
        />
      ) : (
        <text x="24" y="90" fill="#fca5a5" fontSize="12" role="alert">
          Luminance unavailable: the file declares a zero luminous area (width, length and height are 0).
        </text>
      )}
      <text x="24" y={secondTop + 8} fill="currentColor" fontSize="14">
        Luminous intensity · cd
      </text>
      <Table
        x={24}
        y={secondTop + 18}
        corner=""
        columns={columns}
        rows={rows}
        cells={table.intensity.map((row) => row.map(format))}
        tint={fractions(table.intensity)}
        cellWidth={cellWidth}
        headerWidth={48}
        cellHeight={cellHeight}
      />
      <text x="24" y={height - 12} fill="#9ca3af" fontSize="10">
        Average over the declared luminous opening · A_side follows the opening silhouette seen from each C plane
      </text>
    </Frame>
  );
}

/** Props for {@link IntensityTableGraph}. */
export interface IntensityTableGraphProps extends IntensityTableOptions, ChartStyleProps {
  /** Type C profile to tabulate. */
  profile: IESProfile;
}
/**
 * SVG table of the measured candela grid: γ rows, C columns, with a subtle heat-map tint. Large grids widen the
 * SVG (cells keep a readable minimum width); use `maxColumns`/`maxRows` to thin a grid for a fixed-size image.
 *
 * @example
 * ```tsx
 * <IntensityTableGraph profile={profile} unit="cd/klm" />
 * ```
 */
export function IntensityTableGraph({ profile, aspectRatio, className, style, ...options }: IntensityTableGraphProps) {
  if (profile.photometricType !== 1)
    return <TypeCOnly name="Intensity table" aspectRatio={aspectRatio} className={className} style={style} />;
  const table = buildIntensityTable(profile, options);
  const headerWidth = 48,
    cellWidth = Math.max(40, Math.min(80, 424 / table.cPlanes.length)),
    cellHeight = 16;
  const width = Math.max(520, 48 + headerWidth + table.cPlanes.length * cellWidth);
  const height = 72 + (table.gammas.length + 1) * cellHeight + 34;
  const title = `Luminous intensity table in ${table.unit}, ${table.gammas.length} vertical by ${table.cPlanes.length} horizontal angles, maximum ${formatGraphValue(table.maximum)}`;
  return (
    <Frame width={width} height={height} label={title} aspectRatio={aspectRatio} className={className} style={style}>
      <text x="24" y="28" fill="currentColor" fontSize="14">
        Luminous intensity table · {table.unit}
      </text>
      <text x="24" y="48" fill={muted} fontSize="11">
        Rows γ (vertical) · columns C (horizontal) · shown peak {formatGraphValue(table.maximum)} {table.unit}
        {options.unit === 'cd/klm' && table.unit === 'cd' ? ' · no declared lamp flux, shown in cd' : ''}
      </text>
      <Table
        x={24}
        y={62}
        corner="γ \ C"
        columns={table.cPlanes.map((c) => `${formatGraphValue(c)}°`)}
        rows={table.gammas.map((g) => `${formatGraphValue(g)}°`)}
        cells={table.values.map((row) => row.map(formatGraphValue))}
        tint={table.values.map((row) => row.map((v) => (table.maximum > 0 ? v / table.maximum : 0)))}
        cellWidth={cellWidth}
        headerWidth={headerWidth}
        cellHeight={cellHeight}
        fontSize={Math.min(10, cellWidth / 4.4)}
      />
      <text x="24" y={height - 12} fill="#9ca3af" fontSize="10">
        Measured values without interpolation · tint alpha ∝ √(value / peak)
      </text>
    </Frame>
  );
}
