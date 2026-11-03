import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseIES, parseLDT } from '@ies-tools/core';
import {
  collectPhotometricFiles,
  convertNative,
  isPhotometricPath,
  keepBothPath,
  lampSetChoices,
  parseSource,
  resolveTarget,
  runBatch,
  TARGET_EXTENSIONS,
  targetPath,
  type TargetFormat,
} from './conversion.js';
import { ldtSource } from '../../viewer/test/photometryFixtures.js';

const fixtures = new URL('../../../fixtures/', import.meta.url);
const iesFixture = readdirSync(fixtures).find((name) => name.endsWith('.ies'))!;
const eulumdatFixture = 'Floodlight_12W 3000K 54°.ies';
const read = (name: string) => readFileSync(new URL(name, fixtures), 'utf8');
const reparse = (target: TargetFormat, value: string) =>
  target === 'json' ? JSON.parse(value) : target === 'ies' ? parseIES(value) : parseLDT(value);

describe('conversion targets', () => {
  it('maps formats to extensions and names outputs next to the source', () => {
    expect(TARGET_EXTENSIONS).toEqual({ ies: '.ies', ldt: '.ldt', json: '.json' });
    expect(targetPath('/a/b/lamp.IES', 'ldt')).toBe('/a/b/lamp.ldt');
    expect(targetPath('/a/b/lamp.v2.ldt', 'json')).toBe('/a/b/lamp.v2.json');
    expect(targetPath('/a.dir/lamp', 'ies')).toBe('/a.dir/lamp.ies');
    expect(keepBothPath('/a/lamp.ldt', 1)).toBe('/a/lamp (1).ldt');
    expect(keepBothPath('/a/lamp.ldt', 12)).toBe('/a/lamp (12).ldt');
    expect(isPhotometricPath('x.IES')).toBe(true);
    expect(isPhotometricPath('x.Ldt')).toBe(true);
    expect(isPhotometricPath('x.json')).toBe(false);
  });

  it('applies the overwrite policy and finds the next free Keep Both name', async () => {
    const existing = new Set(['/a/l.ies', '/a/l (1).ies', '/a/l (2).ies']);
    const exists = async (path: string) => existing.has(path);
    const asked: string[] = [];
    const ask = (choice?: 'overwrite' | 'keepBoth' | 'skip') => async (path: string) => {
      asked.push(path);
      return choice;
    };
    expect(await resolveTarget('/a/new.ies', 'ask', exists, ask('skip'))).toBe('/a/new.ies');
    expect(asked).toEqual([]);
    expect(await resolveTarget('/a/l.ies', 'always', exists, ask())).toBe('/a/l.ies');
    expect(await resolveTarget('/a/l.ies', 'never', exists, ask())).toBeUndefined();
    expect(asked).toEqual([]);
    expect(await resolveTarget('/a/l.ies', 'ask', exists, ask('overwrite'))).toBe('/a/l.ies');
    expect(await resolveTarget('/a/l.ies', 'ask', exists, ask('keepBoth'))).toBe('/a/l (3).ies');
    expect(await resolveTarget('/a/l.ies', 'ask', exists, ask('skip'))).toBeUndefined();
    expect(await resolveTarget('/a/l.ies', 'ask', exists, ask(undefined))).toBeUndefined();
    expect(asked).toHaveLength(4);
  });

  it('requires a lamp set only for IES output from a multi-configuration LDT', () => {
    const multi = parseLDT(ldtSource({ alternatives: true }));
    expect(lampSetChoices(multi, 'ies')).toEqual([
      '1: First configuration · 2000 lm · 20 W',
      '2: Second configuration · 500 lm · 5 W',
    ]);
    expect(lampSetChoices(multi, 'json')).toBeUndefined();
    expect(lampSetChoices(multi, 'ldt')).toBeUndefined();
    expect(lampSetChoices(parseLDT(ldtSource()), 'ies')).toBeUndefined();
    expect(lampSetChoices(parseIES(read(iesFixture)), 'ies')).toBeUndefined();
    expect(() => convertNative(multi, 'ies')).toThrow(/lampSetIndex/);
    expect(parseIES(convertNative(multi, 'ies', 1).value).lumensPerLamp).toBeGreaterThan(0);
  });

  it('isolates per-item failures in a batch', async () => {
    const { results, failures } = await runBatch([1, 2, 3], async (n) => {
      if (n === 2) throw new Error('bad');
      return n * 10;
    });
    expect(results).toEqual([10, 30]);
    expect(failures).toEqual([{ item: 2, error: new Error('bad') }]);
  });

  it('collects photometric files, skipping dot-folders and node_modules', async () => {
    const tree: Record<string, [string, boolean][]> = {
      '/w': [
        ['a.ies', false],
        ['b.LDT', false],
        ['c.txt', false],
        ['sub', true],
        ['.git', true],
        ['node_modules', true],
      ],
      '/w/sub': [['d.ldt', false]],
      '/w/.git': [['e.ies', false]],
      '/w/node_modules': [['f.ies', false]],
    };
    const readDir = async (dir: string) => tree[dir]!;
    expect(await collectPhotometricFiles('/w', readDir, false)).toEqual(['/w/a.ies', '/w/b.LDT']);
    expect(await collectPhotometricFiles('/w', readDir, true)).toEqual(['/w/a.ies', '/w/b.LDT', '/w/sub/d.ldt']);
  });

  for (const [name, path, text] of [
    ['three.js IES fixture', iesFixture, () => read(iesFixture)],
    ['eulumdat-rs IES fixture', eulumdatFixture, () => read(`eulumdat-rs/${eulumdatFixture}`)],
    ['LDT fixture', 'source.ldt', () => ldtSource()],
  ] as const)
    it(`converts the ${name} to every target and re-parses the output`, () => {
      const native = parseSource(text(), path);
      for (const target of ['ies', 'ldt', 'json'] as const) {
        const { value, warnings } = convertNative(native, target);
        expect(Array.isArray(warnings)).toBe(true);
        expect(reparse(target, value)).toBeTruthy();
      }
    });
});
