import { type CSSProperties } from 'react';
import {
  type IESProfile,
  buildIsoluxGrid,
  extractContours,
  formatGraphValue,
  isoluxContourLevels,
  type IsoluxOptions,
} from '@ies-tools/core';
import { graphFrame } from '../graphs.js';

/** Props for {@link IsoluxGraph}. */
export interface IsoluxGraphProps extends IsoluxOptions {
  /** Type C profile to evaluate. */
  profile: IESProfile;
  /** Absolute lux levels. Omit for a 1-2-5 series from `minContour`; `[]` hides contours. */
  contourLevels?: readonly number[];
  /** @deprecated Alias of `contourLevels`. */
  contours?: readonly number[];
  /** Lowest automatic 1-2-5 contour level in lux. Defaults to 1. */
  minContour?: number;
  /** Heatmap colour mapping. `log` (default) keeps low-light spill visible; `linear` maps lux proportionally. */
  colorScale?: 'log' | 'linear';
  /** Draw the lux heatmap beneath the contours. Defaults to true. */
  heatmap?: boolean;
  /** Viewbox width / height; the background fills it and the graph is centered. Defaults to the native layout. */
  aspectRatio?: number;
  className?: string;
  style?: CSSProperties;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 255]! ^ (c >>> 8);
  return ~c >>> 0;
}
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length),
    view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
/** Minimal RGB PNG data URI with stored (uncompressed) deflate blocks; no canvas or zlib needed. */
/** @internal Exported for tests; not part of the public React entry point. */
export function pngDataUri(width: number, height: number, raw: Uint8Array): string {
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const zlib = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  zlib.set([0x78, 0x01]);
  let offset = 2;
  for (let i = 0; i < blocks; i++) {
    const part = raw.subarray(i * 65535, (i + 1) * 65535),
      length = part.length;
    zlib.set([i === blocks - 1 ? 1 : 0, length & 255, length >> 8, ~length & 255, (~length >> 8) & 255], offset);
    zlib.set(part, offset + 5);
    offset += 5 + length;
  }
  let a = 1,
    b = 0;
  for (const byte of raw) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  new DataView(zlib.buffer).setUint32(offset, ((b << 16) | a) >>> 0);
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, width);
  new DataView(header.buffer).setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  let binary = '';
  for (const part of [
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib),
    pngChunk('IEND', new Uint8Array()),
  ])
    for (const byte of part) binary += String.fromCharCode(byte);
  return `data:image/png;base64,${btoa(binary)}`;
}
/** The graph's perceptual blue-to-yellow ramp, hsl(235 − 195t, 80%, 15 + 50t%), as RGB bytes. */
/** @internal Exported for tests. */
export function rampRgb(t: number): [number, number, number] {
  const h = 235 - t * 195,
    l = (15 + t * 50) / 100,
    a = 0.8 * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
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
  contourLevels,
  contours,
  minContour,
  colorScale = 'log',
  heatmap = true,
  aspectRatio,
  className,
  style,
  ...options
}: IsoluxGraphProps) {
  if (colorScale !== 'log' && colorScale !== 'linear') throw new RangeError('Colour scale must be log or linear');
  const grid = buildIsoluxGrid(profile, options);
  const levels = contourLevels ?? contours ?? isoluxContourLevels(grid.maximum, { minContour });
  if (levels.some((level) => level < 0)) throw new RangeError('Isolux contour levels must be nonnegative lux values');
  const lines = extractContours(grid, levels);
  const drawn = lines.filter((line) => line.segments.length);
  const legendRows = Array.from({ length: Math.max(1, Math.ceil(drawn.length / 5)) }, (_, i) =>
    drawn.slice(i * 5, i * 5 + 5),
  );
  const extraHeight = (legendRows.length - 1) * 18;
  const frame = graphFrame(520, 560 + extraHeight, aspectRatio);
  const [width, depth] = grid.extent;
  const scale = 370 / Math.max(width, depth),
    plotWidth = width * scale,
    plotHeight = depth * scale;
  const left = 260 - plotWidth / 2,
    bottom = 250 + plotHeight / 2,
    top = bottom - plotHeight;
  const screenX = (x: number) => left + (x + width / 2) * scale;
  const screenZ = (z: number) => bottom - (z + depth / 2) * scale;
  // Log colour runs from the lowest contour (or 1% of peak) to the peak, so 1–50 lx spill stays visible.
  const floor = levels[0]! > 0 && levels[0]! < grid.maximum ? levels[0]! : grid.maximum / 100;
  const shade = (lux: number) =>
    colorScale === 'linear' || !(floor > 0)
      ? lux / (grid.maximum || 1)
      : Math.max(0, Math.log(lux / floor) / Math.log(grid.maximum / floor));
  let image = '';
  if (heatmap) {
    // One pixel per grid point, z descending; the renderer's bilinear upscaling gives a smooth fill.
    const columns = grid.xs.length,
      rows = grid.zs.length,
      raw = new Uint8Array(rows * (1 + columns * 3));
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++)
        raw.set(
          rampRgb(Math.min(1, shade(grid.values[rows - 1 - row]![column]!))),
          row * (1 + columns * 3) + 1 + column * 3,
        );
    image = pngDataUri(columns, rows, raw);
  }
  const cellWidth = plotWidth / (grid.xs.length - 1),
    cellHeight = plotHeight / (grid.zs.length - 1);
  // Greedy label placement: each label goes where it is farthest from the labels already placed.
  const placed: { x: number; y: number; w: number }[] = [{ x: screenX(0), y: screenZ(0), w: 12 }];
  const labels = lines.toReversed().flatMap((line) => {
    const text = formatGraphValue(line.level),
      w = text.length * 6 + 6;
    const step = Math.max(1, Math.floor(line.segments.length / 80));
    let best: { x: number; y: number; score: number } | undefined;
    for (let i = 0; i < line.segments.length; i += step) {
      const [a, b] = line.segments[i]!;
      const x = screenX((a[0] + b[0]) / 2),
        y = screenZ((a[1] + b[1]) / 2);
      if (x - w / 2 < left || x + w / 2 > left + plotWidth || y - 7 < top || y + 7 > bottom) continue;
      const score = Math.min(
        ...placed.map((other) => Math.max(Math.abs(x - other.x) / ((w + other.w) / 2 + 4), Math.abs(y - other.y) / 16)),
      );
      if (!best || score > best.score) best = { x, y, score };
    }
    if (!best || best.score < 1) return []; // never overlap; the legend still lists the level
    placed.push({ x: best.x, y: best.y, w });
    return [{ level: line.level, text, x: best.x, y: best.y }];
  });
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
        {heatmap ? ` · ${colorScale} colour` : ''}
      </text>
      <rect x={left} y={top} width={plotWidth} height={plotHeight} fill="#101b36" />
      {heatmap && (
        // The nested viewport clips the half-cell overhang that centres pixels on grid points.
        <svg x={left} y={top} width={plotWidth} height={plotHeight} overflow="hidden">
          <image
            href={image}
            x={-cellWidth / 2}
            y={-cellHeight / 2}
            width={plotWidth + cellWidth}
            height={plotHeight + cellHeight}
            preserveAspectRatio="none"
          />
        </svg>
      )}
      <rect x={left} y={top} width={plotWidth} height={plotHeight} fill="none" stroke="#64748b" />
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
      {labels.map((label) => (
        <text
          key={label.level}
          data-label={label.level}
          x={label.x}
          y={label.y + 3.5}
          textAnchor="middle"
          fontSize="10"
          fill="#fff"
          stroke="#111"
          strokeWidth="3"
          strokeOpacity="0.85"
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {label.text}
        </text>
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
        {formatGraphValue(grid.average)} lx · U0 {grid.uniformity.toFixed(2)}
      </text>
      {legendRows.map((row, i) => (
        <text key={i} x="24" y={522 + i * 18} fill="#b7c1ce" fontSize="10">
          {`${i === 0 ? 'Contours: ' : ''}${row.length ? row.map((line) => `${formatGraphValue(line.level)} lx`).join(' · ') : 'none in this range'}`}
        </text>
      ))}
      <text x="24" y={545 + extraHeight} fill="#9ca3af" fontSize="10">
        Inverse-square + receiver cosine · U0 = Emin / Eavg · fixture aim is separate from lamp TILT
      </text>
    </svg>
  );
}
