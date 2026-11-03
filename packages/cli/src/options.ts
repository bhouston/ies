import { readFile } from 'node:fs/promises';
import type { Argv } from 'yargs';
import { inputFormat, type InputFormat } from './photometry.js';

/** The `<file>`, `--format` and `--lamp-set` arguments every photometry command accepts. */
export function inputOptions<T>(yargs: Argv<T>) {
  return yargs
    .positional('file', { type: 'string', demandOption: true, describe: 'IES (.ies) or EULUMDAT (.ldt) input file' })
    .option('format', {
      type: 'string',
      choices: ['ies', 'ldt'] as const,
      describe: 'Override extension and content detection of the input format',
    })
    .option('lamp-set', { type: 'number', describe: 'Select one alternative LDT lamp configuration (1-based)' });
}

/** Convert the 1-based `--lamp-set` to a zero-based index. */
export function lampSetIndex(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('--lamp-set must be a positive integer (1-based)');
  return value - 1;
}

export async function readInput(argv: { file: string; format?: InputFormat; lampSet?: number }) {
  const text = await readFile(argv.file, 'utf8');
  const format = inputFormat(text, argv.file, argv.format);
  const index = lampSetIndex(argv.lampSet);
  if (format === 'ies' && index !== undefined) throw new Error('--lamp-set applies to LDT inputs only');
  return { text, format, lampSetIndex: index };
}
