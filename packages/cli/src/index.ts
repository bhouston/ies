import { fileURLToPath } from 'node:url';
import { handleOpenCliRequest } from '@clidoc/core';
import yargs from 'yargs';
import { fileCommands } from 'yargs-file-commands';
import { cliDocument, info } from './definition.js';

export { servePreview, type PreviewServer } from './preview.js';
export { cliDocument } from './definition.js';

/** Run the CLI without terminating the embedding process. Commands live in individual files under ./commands. */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  if (await handleOpenCliRequest(argv, cliDocument)) return;
  await yargs(argv.length ? argv : ['--help'])
    .scriptName(info.binary)
    .usage('$0 <command> [options]\n\nValidate, inspect, convert and preview IES and EULUMDAT photometric files.')
    .command(await fileCommands({ commandDirs: [fileURLToPath(new URL('./commands', import.meta.url))] }))
    .demandCommand(1)
    .strict()
    .help()
    .alias('h', 'help')
    .version(info.version)
    .alias('v', 'version')
    .epilogue('Files remain on your computer. The viewer binds to 127.0.0.1.')
    .exitProcess(false)
    .fail((message, error) => {
      throw error ?? new Error(`${message}. Run ies --help.`);
    })
    .parseAsync();
}
