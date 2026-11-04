import { defineCommand } from 'yargs-file-commands';
import { imageOptions, runImageCommand } from '../images.js';
import { inputOptions } from '../options.js';

export const command = defineCommand({
  command: 'render <file>',
  describe:
    'Render a PNG of the light on a floor and wall; requires confirmed hardware WebGL2 in an installed Chromium',
  builder: (yargs) =>
    inputOptions(yargs)
      .option('output', { type: 'string', alias: 'o', demandOption: true, describe: 'Output .png file' })
      .option('width', { type: 'number', default: 1024, describe: 'Image width in pixels; maximum 8192' })
      .option('height', { type: 'number', default: 768, describe: 'Image height in pixels; maximum 8192' })
      .option('exposure', {
        type: 'number',
        describe: 'Manual camera exposure as EV100, -6 to 20 (+1 halves brightness); omit to auto-expose',
      })
      .option('browser', { type: 'string', describe: 'Installed Chromium executable; defaults to IES_BROWSER' })
      .option('timeout', { type: 'number', default: 60, describe: 'Render timeout in seconds; maximum 600' })
      .option('json', { type: 'boolean', describe: 'Print a JSON report including the GPU renderer' }),
  handler: (argv) => runImageCommand('render', imageOptions('render', argv)),
});
