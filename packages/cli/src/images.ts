import { open, readFile, unlink } from 'node:fs/promises';
import { extname } from 'node:path';
import { lampSetIndex } from './options.js';
import { inputFormat } from './photometry.js';
import { chartPhotometry, type ChartOptions } from './chart.js';
import { imageDimensions, renderPhotometry, type RenderOptions } from './render.js';

export interface ImageCommandOptions extends RenderOptions, ChartOptions {
  input: string;
  output: string;
  json: boolean;
}
/** Arguments as yargs parses them for `ies render` and `ies chart`. */
export interface ImageArguments extends Omit<RenderOptions, 'lampSetIndex' | 'inputFormat'> {
  file: string;
  output: string;
  json?: boolean;
  lampSet?: number;
  format?: 'ies' | 'ldt';
  type?: string;
  axis?: string;
  upAxis?: string;
  angle?: number;
  mountingHeight?: number;
  extent?: number;
  resolution?: number;
  contours?: string;
  minContour?: number;
  colorScale?: string;
}
/** Range checks yargs cannot express, applied before any output file is created. */
export function imageOptions(command: 'render' | 'chart', argv: ImageArguments): ImageCommandOptions {
  const { file, lampSet, format, json, contours, ...rest } = argv;
  // Choices are checked below; yargs types them as plain strings.
  const options = {
    ...(rest as Omit<ImageCommandOptions, 'input' | 'json'>),
    input: file,
    json: json ?? false,
    inputFormat: format,
    lampSetIndex: lampSetIndex(lampSet),
    contours: contours === undefined ? undefined : contours.split(',').map((level) => Number(level.trim())),
  };
  for (const [name, value] of Object.entries(options))
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`--${name} must be a finite number`);
  const extension = extname(options.output).toLowerCase();
  if (command === 'render' ? extension !== '.png' : extension !== '.png' && extension !== '.svg')
    throw new Error(command === 'render' ? 'Render output must use .png' : 'Chart output must use .svg or .png');
  imageDimensions(
    options.width ?? (command === 'chart' ? 900 : 1024),
    options.height ?? (command === 'chart' ? 700 : 768),
  );
  if (options.exposure !== undefined && options.exposure < 0) throw new Error('Exposure must be nonnegative');
  if (options.timeout !== undefined && (options.timeout <= 0 || options.timeout > 600))
    throw new Error('Timeout must be between 0 and 600 seconds');
  if (options.type !== undefined && !['polar', 'cartesian', 'topology', 'isolux'].includes(options.type))
    throw new Error('Chart type must be polar, cartesian, topology or isolux');
  if (options.axis !== undefined && !['vertical', 'horizontal'].includes(options.axis))
    throw new Error('Axis must be vertical or horizontal');
  if (options.upAxis !== undefined && !['x', 'y', 'z'].includes(options.upAxis))
    throw new Error('Up axis must be x, y or z');
  if (options.mountingHeight !== undefined && (options.mountingHeight < 0.01 || options.mountingHeight > 10000))
    throw new Error('Mounting height must be within 0.01–10000 meters');
  if (options.extent !== undefined && (options.extent < 0.01 || options.extent > 100000))
    throw new Error('Ground extent must be within 0.01–100000 meters');
  if (
    options.resolution !== undefined &&
    (!Number.isInteger(options.resolution) || options.resolution < 2 || options.resolution > 201)
  )
    throw new Error('Grid resolution must be an integer from 2 to 201');
  if (
    options.contours?.some(
      (level, i, levels) => !(level >= 0) || !Number.isFinite(level) || (i > 0 && level <= levels[i - 1]!),
    ) ||
    (options.contours && options.contours.length > 32)
  )
    throw new Error('Contours must be at most 32 comma-separated, strictly increasing, nonnegative lux values');
  if (options.minContour !== undefined && !(options.minContour > 0))
    throw new Error('Minimum contour must be a positive lux value');
  if (options.colorScale !== undefined && !['log', 'linear'].includes(options.colorScale))
    throw new Error('Colour scale must be log or linear');
  return options;
}

/** Reserve the output before expensive processing; remove only the newly-created placeholder on failure. */
export async function writeImageExclusively<T extends { data: Buffer }>(
  output: string,
  produce: () => Promise<T>,
): Promise<T> {
  const file = await open(output, 'wx');
  try {
    const image = await produce();
    await file.writeFile(image.data);
    return image;
  } catch (error) {
    await file.close();
    await unlink(output);
    throw error;
  } finally {
    await file.close();
  }
}

export async function runImageCommand(command: 'render' | 'chart', options: ImageCommandOptions): Promise<void> {
  const text = await readFile(options.input, 'utf8');
  options.inputFormat = inputFormat(text, options.input, options.inputFormat);
  if (command === 'render') {
    const image = await writeImageExclusively(options.output, async () => {
      const rendered = await renderPhotometry(text, options);
      return { ...rendered, data: rendered.png };
    });
    const report = { output: options.output, width: image.width, height: image.height, gpu: image.gpu };
    console.log(
      options.json
        ? JSON.stringify(report, null, 2)
        : `Wrote ${options.output} (${image.width} × ${image.height}; ${image.gpu.renderer})`,
    );
  } else {
    const image = await writeImageExclusively(options.output, () =>
      chartPhotometry(text, { ...options, format: extname(options.output).toLowerCase() === '.png' ? 'png' : 'svg' }),
    );
    const report = {
      output: options.output,
      type: image.type,
      format: image.format,
      width: image.width,
      height: image.height,
    };
    console.log(
      options.json
        ? JSON.stringify(report, null, 2)
        : `Wrote ${options.output} (${image.width} × ${image.height}; ${image.type})`,
    );
  }
}
