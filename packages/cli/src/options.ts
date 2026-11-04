import { LampSetSelectionError } from '@ies-tools/core';
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

/** Show the CLI's one-based selection convention rather than a JavaScript API option. */
export function requireLampSetSelection(count: number, index?: number): void {
  if (
    (index === undefined && count > 1) ||
    (index !== undefined && (!Number.isSafeInteger(index) || index < 0 || index >= count))
  ) {
    throw new Error(
      `This file has ${count} alternative lamp configuration${count === 1 ? '' : 's'}. Select one with --lamp-set N, where N is an integer from 1 to ${count}. Run ies inspect <file> to see the configuration labels. Configurations are not summed.`,
    );
  }
}

/** Translate structured library errors at the CLI boundary without reparsing successful inputs. */
export function explainLampSetError(error: unknown): never {
  if (error instanceof LampSetSelectionError) requireLampSetSelection(error.lampSetCount, error.lampSetIndex);
  throw error;
}
