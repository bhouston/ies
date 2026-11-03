import { writeFile } from 'node:fs/promises';
import { parseIES, parseLDT, serializeIES, serializeLDT } from 'ies-core';
import { defineCommand } from 'yargs-file-commands';
import { inputOptions, readInput } from '../options.js';

export const command = defineCommand({
  command: 'convert <file>',
  describe: 'Convert between IES, LDT and native JSON locally; existing output files are never overwritten',
  builder: (yargs) =>
    inputOptions(yargs)
      .option('to', {
        type: 'string',
        choices: ['json', 'ies', 'ldt'] as const,
        default: 'json',
        describe: 'Output format',
      })
      .option('output', { type: 'string', alias: 'o', describe: 'Output file; defaults to stdout' }),
  handler: async (argv) => {
    const { text, format, lampSetIndex } = await readInput(argv);
    const native = format === 'ies' ? parseIES(text) : parseLDT(text);
    if ('lampSets' in native && native.lampSets.length > 1 && argv.to === 'ies' && lampSetIndex === undefined)
      throw new Error('This file has alternative lamp configurations; select one with --lamp-set N');
    const conversion =
      argv.to === 'json'
        ? { value: `${JSON.stringify(native, null, 2)}\n`, warnings: [] }
        : argv.to === 'ies'
          ? serializeIES(native, { lampSetIndex })
          : serializeLDT(native, { lampSetIndex });
    for (const warning of conversion.warnings) console.error(`warning [${warning.code}]: ${warning.message}`);
    if (argv.output) await writeFile(argv.output, conversion.value, { flag: 'wx' });
    else process.stdout.write(conversion.value);
  },
});
