// VS Code-free conversion rules shared by the Explorer, Command Palette and folder commands.
import {
  inputFormat,
  parseIES,
  parseLDT,
  serializeIES,
  serializeLDT,
  type ConversionResult,
  type IESProfile,
  type LDTProfile,
} from '@ies-tools/core';
import { lampSetLabels } from './previewData.js';

export type TargetFormat = 'ies' | 'ldt' | 'json';
export type OverwritePolicy = 'ask' | 'always' | 'never';
export type ExistingChoice = 'overwrite' | 'keepBoth' | 'skip';

export const TARGET_EXTENSIONS: Record<TargetFormat, string> = { ies: '.ies', ldt: '.ldt', json: '.json' };

export function isPhotometricPath(path: string): boolean {
  return /\.(ies|ldt)$/i.test(path);
}

export function parseSource(text: string, path: string): IESProfile | LDTProfile {
  return inputFormat(text, path) === 'ies' ? parseIES(text) : parseLDT(text);
}

/** Lamp-set labels when the target needs one of several LDT alternatives; otherwise undefined. */
export function lampSetChoices(native: IESProfile | LDTProfile, target: TargetFormat): string[] | undefined {
  return target === 'ies' && 'lampSets' in native && native.lampSets.length > 1 ? lampSetLabels(native) : undefined;
}

/** Same semantics as `ies convert`: JSON is the native parsed document. */
export function convertNative(
  native: IESProfile | LDTProfile,
  target: TargetFormat,
  lampSetIndex?: number,
): ConversionResult<string> {
  if (target === 'json') return { value: `${JSON.stringify(native, null, 2)}\n`, warnings: [] };
  return target === 'ies' ? serializeIES(native, { lampSetIndex }) : serializeLDT(native, { lampSetIndex });
}

function splitExtension(path: string): [string, string] {
  const match = /(\.[^./]*)$/.exec(path);
  return match ? [path.slice(0, -match[1]!.length), match[1]!] : [path, ''];
}

export function targetPath(path: string, target: TargetFormat): string {
  return splitExtension(path)[0] + TARGET_EXTENSIONS[target];
}

export function keepBothPath(path: string, n: number): string {
  const [stem, extension] = splitExtension(path);
  return `${stem} (${n})${extension}`;
}

/** Resolve where to write, or undefined to skip, applying the `iesTools.convert.overwrite` policy. */
export async function resolveTarget(
  path: string,
  policy: OverwritePolicy,
  exists: (path: string) => Promise<boolean>,
  ask: (path: string) => Promise<ExistingChoice | undefined>,
): Promise<string | undefined> {
  if (!(await exists(path))) return path;
  const choice = policy === 'always' ? 'overwrite' : policy === 'never' ? 'skip' : ((await ask(path)) ?? 'skip');
  if (choice === 'overwrite') return path;
  if (choice === 'skip') return undefined;
  for (let n = 1; ; n++) {
    const candidate = keepBothPath(path, n);
    if (!(await exists(candidate))) return candidate;
  }
}

/** Run every item, isolating failures so one bad file never aborts the rest of a batch. */
export async function runBatch<T, R>(
  items: readonly T[],
  run: (item: T) => Promise<R>,
): Promise<{ results: R[]; failures: { item: T; error: unknown }[] }> {
  const results: R[] = [];
  const failures: { item: T; error: unknown }[] = [];
  for (const item of items) {
    try {
      results.push(await run(item));
    } catch (error) {
      failures.push({ item, error });
    }
  }
  return { results, failures };
}

/** Photometric files under a folder, skipping dot-folders and node_modules. */
export async function collectPhotometricFiles(
  dir: string,
  readDir: (dir: string) => Promise<[name: string, isDirectory: boolean][]>,
  recursive: boolean,
): Promise<string[]> {
  const files: string[] = [];
  for (const [name, isDirectory] of await readDir(dir)) {
    const path = `${dir.replace(/\/$/, '')}/${name}`;
    if (!isDirectory) {
      if (isPhotometricPath(name)) files.push(path);
    } else if (recursive && !name.startsWith('.') && name !== 'node_modules')
      files.push(...(await collectPhotometricFiles(path, readDir, recursive)));
  }
  return files;
}
