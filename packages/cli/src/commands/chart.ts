import { defineCommand } from 'yargs-file-commands';
import { imageOptions, runImageCommand } from '../images.js';
import { inputOptions } from '../options.js';

export const command = defineCommand({
  command: 'chart <file>',
  describe: 'Export an SVG or PNG photometric chart; PNG rasterization is 2D and needs no WebGL',
  builder: (yargs) =>
    inputOptions(yargs)
      .option('output', { type: 'string', alias: 'o', demandOption: true, describe: 'Output .svg or .png file' })
      .option('type', {
        type: 'string',
        choices: ['polar', 'cartesian', 'topology', 'isolux'] as const,
        default: 'polar',
        describe: 'Chart type',
      })
      .option('width', { type: 'number', default: 900, describe: 'Image width in pixels; maximum 8192' })
      .option('height', { type: 'number', default: 700, describe: 'Image height in pixels; maximum 8192' })
      .option('axis', {
        type: 'string',
        choices: ['vertical', 'horizontal'] as const,
        default: 'vertical',
        describe: 'Sweep axis',
      })
      .option('angle', { type: 'number', default: 0, describe: 'Fixed plane angle in degrees' })
      .option('up-axis', {
        type: 'string',
        choices: ['x', 'y', 'z'] as const,
        default: 'y',
        describe: 'Topology orientation',
      })
      .option('mounting-height', { type: 'number', default: 2, describe: 'Isolux mounting height in meters' })
      .option('extent', { type: 'number', default: 10, describe: 'Isolux ground extent in meters' })
      .option('resolution', { type: 'number', default: 61, describe: 'Isolux grid resolution (2–201)' })
      .option('json', { type: 'boolean', describe: 'Print a JSON output report' }),
  handler: (argv) => runImageCommand('chart', imageOptions('chart', argv)),
});
