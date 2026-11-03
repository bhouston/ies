import { buildConeDiagram, buildIntensityTable, buildLuminanceTable, parsePhotometry } from '@ies-tools/core';
import { imageDimensions } from './render.js';

export const CHART_TYPES = [
  'polar',
  'cartesian',
  'topology',
  'isolux',
  'cone',
  'luminance',
  'intensity-table',
] as const;
export type ChartType = (typeof CHART_TYPES)[number];
export interface ChartOptions {
  type?: ChartType;
  format?: 'svg' | 'png';
  width?: number;
  height?: number;
  axis?: 'vertical' | 'horizontal';
  angle?: number;
  upAxis?: 'x' | 'y' | 'z';
  mountingHeight?: number;
  extent?: number;
  resolution?: number;
  /** Cone diagram distances 1…maxDistance metres. */
  maxDistance?: number;
  /** Intensity table unit. */
  unit?: 'cd' | 'cd/klm';
  /** Intensity table: keep at most this many C columns / γ rows. */
  maxColumns?: number;
  maxRows?: number;
  /** Log-scale intensity (three decades) for polar and Cartesian charts. */
  logScale?: boolean;
  /** Explicit isolux contour levels in lux. */
  contours?: number[];
  /** Lowest automatic 1-2-5 isolux contour in lux. */
  minContour?: number;
  colorScale?: 'log' | 'linear';
  lampSetIndex?: number;
  inputFormat?: 'ies' | 'ldt';
}
export interface RenderedChart {
  data: Buffer;
  type: ChartType;
  width: number;
  height: number;
  format: 'svg' | 'png';
  /** Tabulated values behind cone, luminance and intensity-table charts, for `--json`. */
  values?: unknown;
}

/** Export shared React photometric graph markup. SVG/PNG chart rasterization does not use WebGL. */
export async function chartPhotometry(text: string, options: ChartOptions = {}): Promise<RenderedChart> {
  const { width, height } = imageDimensions(options.width ?? 900, options.height ?? 700);
  const type = options.type ?? 'polar';
  const format = options.format ?? 'svg';
  if (!CHART_TYPES.includes(type)) throw new Error(`Unknown chart type: ${type}`);
  if (format !== 'svg' && format !== 'png') throw new Error('Chart format must be svg or png');
  const axis = options.axis ?? 'vertical',
    upAxis = options.upAxis ?? 'y',
    angle = options.angle ?? 0;
  if (!['vertical', 'horizontal'].includes(axis) || !['x', 'y', 'z'].includes(upAxis))
    throw new Error('Invalid chart axis');
  if (!Number.isFinite(angle)) throw new Error('Chart angle must be finite');
  const document = parsePhotometry(text, options.inputFormat, { lampSetIndex: options.lampSetIndex });
  const [{ createElement }, { renderToStaticMarkup }, react] = await Promise.all([
    import('react'),
    import('react-dom/server'),
    import('@ies-tools/viewer/react'),
  ]);
  const { IntensityGraph, IsoluxGraph } = react;
  const style = { width, height, maxWidth: 'none' };
  const profile = document.profile,
    typeC = profile.photometricType === 1;
  const table = { unit: options.unit, maxColumns: options.maxColumns, maxRows: options.maxRows };
  const values = !typeC
    ? undefined
    : type === 'cone'
      ? buildConeDiagram(profile, { maxDistance: options.maxDistance })
      : type === 'luminance'
        ? buildLuminanceTable(profile)
        : type === 'intensity-table'
          ? buildIntensityTable(profile, table)
          : undefined;
  const aspectRatio = width / height;
  const element =
    type === 'cone'
      ? createElement(react.ConeDiagramGraph, { profile, maxDistance: options.maxDistance, aspectRatio, style })
      : type === 'luminance'
        ? createElement(react.LuminanceTableGraph, { profile, aspectRatio, style })
        : type === 'intensity-table'
          ? createElement(react.IntensityTableGraph, { profile, ...table, aspectRatio, style })
          : type === 'isolux'
            ? createElement(IsoluxGraph, {
                profile: document.profile,
                mountingHeight: options.mountingHeight ?? 2,
                extent: options.extent ?? 10,
                resolution: options.resolution ?? 61,
                contourLevels: options.contours,
                minContour: options.minContour,
                colorScale: options.colorScale,
                aspectRatio,
                style,
              })
            : createElement(IntensityGraph, {
                profile: document.profile,
                projection: type,
                axis,
                angle,
                upAxis,
                principalPlanes: axis === 'vertical' && options.angle === undefined,
                logScale: options.logScale ?? false,
                aspectRatio,
                style,
              });
  let svg = renderToStaticMarkup(element);
  if (!svg.startsWith('<svg')) throw new Error('The shared graph did not produce an SVG image');
  if (!/^<svg[^>]*\sxmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  svg = svg.replace(
    /^<svg([^>]*)>/,
    (_tag, attributes: string) =>
      `<svg width="${width}" height="${height}"${attributes.replace(/\s(?:width|height)="[^"]*"/g, '')}>`,
  );
  const data =
    format === 'svg'
      ? Buffer.from(svg)
      : await (await import('sharp')).default(Buffer.from(svg)).resize(width, height).png().toBuffer();
  return { data, width, height, format, type, ...(values && { values }) };
}
