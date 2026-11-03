import { writeOpenCliDocument, type DocumentFormat } from '@clidoc/core';
import { defineCommand } from 'yargs-file-commands';
import { cliDocument } from '../definition.js';

export const command = defineCommand({
  command: 'docgen',
  describe: 'Write the OpenCLI document describing this CLI',
  builder: (yargs) =>
    yargs
      .option('format', {
        type: 'string',
        choices: ['json', 'yaml', 'markdown'] as const,
        default: 'json',
        describe: 'Output format',
      })
      .option('output', { type: 'string', alias: 'o', describe: 'Output file; defaults to stdout' }),
  handler: (argv) => writeOpenCliDocument(cliDocument(), argv.output, argv.format as DocumentFormat),
});
