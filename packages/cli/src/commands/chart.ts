import { defineCommand } from 'yargs-file-commands';
import { imageOptions, runImageCommand } from '../images.js';
import { inputOptions } from '../options.js';
import { CHART_TYPES } from '../chart.js';

export const command = defineCommand({
  command: 'chart <file>',
  describe: 'Export an SVG or PNG photometric chart; PNG rasterization is 2D and needs no WebGL',
  builder: (yargs) =>
    inputOptions(yargs)
      .option('output', { type: 'string', alias: 'o', demandOption: true, describe: 'Output .svg or .png file' })
      .option('type', {
        type: 'string',
        choices: CHART_TYPES,
        default: 'polar',
        describe: 'Chart type; cone, luminance and intensity-table are Type C tables',
      })
      .option('width', { type: 'number', default: 900, describe: 'Image width in pixels; maximum 8192' })
      .option('height', { type: 'number', default: 700, describe: 'Image height in pixels; maximum 8192' })
      .option('axis', {
        type: 'string',
        choices: ['vertical', 'horizontal'] as const,
        default: 'vertical',
        describe: 'Sweep axis',
      })
      .option('angle', {
        type: 'number',
        describe: 'Fixed plane angle in degrees; omit for both principal planes on a vertical sweep',
      })
      .option('up-axis', {
        type: 'string',
        choices: ['x', 'y', 'z'] as const,
        default: 'y',
        describe: 'Topology orientation',
      })
      .option('mounting-height', { type: 'number', default: 2, describe: 'Isolux mounting height in meters' })
      .option('extent', { type: 'number', default: 10, describe: 'Isolux ground extent in meters' })
      .option('resolution', { type: 'number', default: 61, describe: 'Isolux grid resolution (2–201)' })
      .option('contours', {
        type: 'string',
        describe: 'Isolux contour levels in lux, comma-separated (for example 1,2,5,10); default is a 1-2-5 series',
      })
      .option('min-contour', {
        type: 'number',
        default: 1,
        describe: 'Lowest automatic 1-2-5 isolux contour in lux; ignored with --contours',
      })
      .option('color-scale', {
        type: 'string',
        choices: ['log', 'linear'] as const,
        default: 'log',
        describe: 'Isolux heatmap colour mapping; log keeps low-light spill visible',
      })
      .option('max-distance', {
        type: 'number',
        default: 5,
        describe: 'Cone diagram distances 1…N in meters (integer 1–50)',
      })
      .option('unit', {
        type: 'string',
        choices: ['cd', 'cd/klm'] as const,
        default: 'cd',
        describe: 'Intensity table unit; cd/klm needs a declared lamp flux',
      })
      .option('max-columns', { type: 'number', describe: 'Intensity table: keep at most N evenly spaced C columns' })
      .option('max-rows', { type: 'number', describe: 'Intensity table: keep at most N evenly spaced γ rows' })
      .option('json', {
        type: 'boolean',
        describe: 'Print a JSON output report; table chart types include their values',
      }),
  handler: (argv) => runImageCommand('chart', imageOptions('chart', argv)),
});
