import { spawn } from 'node:child_process';
import { parseLDT } from '@ies-tools/core';
import { defineCommand } from 'yargs-file-commands';
import { servePreview } from '../preview.js';
import { inputOptions, readInput } from '../options.js';

export const command = defineCommand({
  command: 'view <file>',
  describe: 'Serve a local interactive light preview on 127.0.0.1; press Ctrl+C to stop',
  builder: (yargs) =>
    inputOptions(yargs)
      .option('port', { type: 'number', default: 0, describe: 'Port to listen on; 0 picks a free port' })
      .option('open', { type: 'boolean', describe: 'Open the preview in the default browser' }),
  handler: async (argv) => {
    const { text, format, lampSetIndex } = await readInput(argv);
    if (format === 'ldt' && lampSetIndex === undefined && parseLDT(text).lampSets.length > 1)
      throw new Error('This file has alternative lamp configurations; select one with --lamp-set N');
    const preview = await servePreview(text, argv.port, { format, lampSetIndex });
    console.log(`Photometric preview: ${preview.url}\nPress Ctrl+C to stop.`);
    const stop = () => {
      preview.server.closeAllConnections();
      preview.server.close();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    preview.server.once('close', () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    });
    if (argv.open) {
      const executable =
        process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open';
      const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', preview.url] : [preview.url];
      spawn(executable, args, { stdio: 'ignore' }).on('error', (error) =>
        console.error(`Could not open browser: ${error.message}. Open ${preview.url} manually.`),
      );
    }
  },
});
