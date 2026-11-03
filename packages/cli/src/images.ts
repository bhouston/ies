import { open, readFile, unlink } from 'node:fs/promises';
import { extname } from 'node:path';
import { chartPhotometry, type ChartOptions, type ChartType } from './chart.js';
import { imageDimensions, renderPhotometry, type RenderOptions } from './render.js';

export interface ImageCommandOptions extends RenderOptions, ChartOptions {
  input: string;
  output: string;
  json: boolean;
}
export function parseImageArguments(command: 'render' | 'chart', argv: string[]): ImageCommandOptions {
  const options: Partial<ImageCommandOptions> = {};
  const values = new Set([
    '-o',
    '--output',
    '--width',
    '--height',
    '--exposure',
    '--browser',
    '--timeout',
    '--type',
    '--axis',
    '--angle',
    '--up-axis',
    '--mounting-height',
    '--extent',
    '--resolution',
    '--lamp-set',
  ]);
  const renderOnly = new Set(['--exposure', '--browser', '--timeout']);
  const chartOnly = new Set([
    '--type',
    '--axis',
    '--angle',
    '--up-axis',
    '--mounting-height',
    '--extent',
    '--resolution',
  ]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (values.has(arg)) {
      if ((command === 'chart' && renderOnly.has(arg)) || (command === 'render' && chartOnly.has(arg)))
        throw new Error(`Unknown ${command} option: ${arg}`);
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      switch (arg) {
        case '-o':
        case '--output':
          options.output = value;
          break;
        case '--browser':
          options.browser = value;
          break;
        case '--type':
          options.type = value as ChartType;
          break;
        case '--axis':
          options.axis = value as ChartOptions['axis'];
          break;
        case '--up-axis':
          options.upAxis = value as ChartOptions['upAxis'];
          break;
        case '--lamp-set': {
          const index = Number(value);
          if (!Number.isSafeInteger(index) || index < 1)
            throw new Error('--lamp-set must be a positive integer (1-based)');
          options.lampSetIndex = index - 1;
          break;
        }
        default: {
          const numeric = Number(value);
          if (!Number.isFinite(numeric)) throw new Error(`${arg} must be a finite number`);
          if (arg === '--width') options.width = numeric;
          else if (arg === '--height') options.height = numeric;
          else if (arg === '--exposure') options.exposure = numeric;
          else if (arg === '--timeout') options.timeout = numeric;
          else if (arg === '--angle') options.angle = numeric;
          else if (arg === '--mounting-height') options.mountingHeight = numeric;
          else if (arg === '--extent') options.extent = numeric;
          else if (arg === '--resolution') options.resolution = numeric;
        }
      }
    } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (options.input) throw new Error('Expected exactly one input file');
    else options.input = arg;
  }
  if (!options.input) throw new Error(`Missing input file. Run ies ${command} <file> -o <image>.`);
  if (!options.output) throw new Error('An output image is required (-o or --output)');
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
  return { ...options, input: options.input, output: options.output, json: options.json ?? false };
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

export const imageHelp = {
  render: `ies render <file.ies|file.ldt> -o output.png
  --width <pixels> --height <pixels>  Default 1024×768; maximum 8192 per side
  --exposure <number>                 Default 1, nonnegative
  --browser <executable>              Installed Chromium browser, or IES_BROWSER
  --timeout <seconds>                Default 60, maximum 600
  --lamp-set <index> --json           One-based LDT configuration; JSON GPU report
Requires confirmed hardware WebGL2; software and unknown renderers are rejected.`,
  chart: `ies chart <file.ies|file.ldt> -o output.svg|output.png
  --type polar|cartesian|topology|isolux
  --width <pixels> --height <pixels>  Default 900×700; maximum 8192 per side
  --axis vertical|horizontal --angle <degrees>
  --up-axis x|y|z                    Topology orientation
  --mounting-height <meters> --extent <meters> --resolution <count>
  --lamp-set <index> --json           One-based LDT configuration; JSON output report
Uses the shared React diagrams; PNG rasterization is 2D and does not require WebGL.`,
};
export async function runImageCommand(command: 'render' | 'chart', argv: string[]): Promise<void> {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0]!)) {
    console.log(imageHelp[command]);
    return;
  }
  const options = parseImageArguments(command, argv);
  const text = await readFile(options.input, 'utf8');
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
