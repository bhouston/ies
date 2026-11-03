import { parsePhotometry } from '@ies-tools/core';
import { imageDimensions } from './render.js';

export type ChartType = 'polar' | 'cartesian' | 'topology' | 'isolux';
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
  lampSetIndex?: number;
  inputFormat?: 'ies' | 'ldt';
}
export interface RenderedChart {
  data: Buffer;
  type: ChartType;
  width: number;
  height: number;
  format: 'svg' | 'png';
}

/** Export shared React photometric graph markup. SVG/PNG chart rasterization does not use WebGL. */
export async function chartPhotometry(text: string, options: ChartOptions = {}): Promise<RenderedChart> {
  const { width, height } = imageDimensions(options.width ?? 900, options.height ?? 700);
  const type = options.type ?? 'polar';
  const format = options.format ?? 'svg';
  if (!['polar', 'cartesian', 'topology', 'isolux'].includes(type)) throw new Error(`Unknown chart type: ${type}`);
  if (format !== 'svg' && format !== 'png') throw new Error('Chart format must be svg or png');
  const axis = options.axis ?? 'vertical',
    upAxis = options.upAxis ?? 'y',
    angle = options.angle ?? 0;
  if (!['vertical', 'horizontal'].includes(axis) || !['x', 'y', 'z'].includes(upAxis))
    throw new Error('Invalid chart axis');
  if (!Number.isFinite(angle)) throw new Error('Chart angle must be finite');
  const document = parsePhotometry(text, options.inputFormat, { lampSetIndex: options.lampSetIndex });
  const [{ createElement }, { renderToStaticMarkup }, { IntensityGraph, IsoluxGraph }] = await Promise.all([
    import('react'),
    import('react-dom/server'),
    import('@ies-tools/viewer/react'),
  ]);
  const style = { width, height, maxWidth: 'none' };
  const element =
    type === 'isolux'
      ? createElement(IsoluxGraph, {
          profile: document.profile,
          mountingHeight: options.mountingHeight ?? 2,
          extent: options.extent ?? 10,
          resolution: options.resolution ?? 61,
          style,
        })
      : createElement(IntensityGraph, {
          profile: document.profile,
          projection: type,
          axis,
          angle,
          upAxis,
          principalPlanes: axis === 'vertical' && options.angle === undefined,
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
  return { data, width, height, format, type };
}
