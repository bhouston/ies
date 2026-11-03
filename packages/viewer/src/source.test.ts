import { describe, expect, it } from 'vitest';
import { parseIES, parsePhotometry } from '@ies-tools/core';
import { iesSource } from '../../core/test/iesSource.js';
import { ldtSource } from '../test/photometryFixtures.js';
import { createPhotometrySourceLoader, parseLampSetIndex } from './source.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const response = (text: string) => ({ ok: true, status: 200, text: async () => text });

describe('format-neutral source loading without a renderer', () => {
  it('loads IES and LDT text into the shared model with native provenance', async () => {
    const loader = createPhotometrySourceLoader();
    const ies = await loader.load({ text: iesSource() });
    const ldt = await loader.load({ text: ldtSource() });
    expect(ies?.sourceFormat).toBe('ies');
    expect(ldt?.sourceFormat).toBe('ldt');
    expect(ldt?.source).toMatchObject({ format: 'ldt', conversionFactor: 0.5 });
    expect(ldt?.profile.candelaValues[0]?.[0]).toBe(100);
  });
  it('accepts a document or compatible profile without fetching or serializing', async () => {
    const loader = createPhotometrySourceLoader(async () => {
      throw new Error('Unexpected fetch');
    });
    const document = parsePhotometry(ldtSource());
    expect(await loader.load({ document, profile: parseIES(iesSource()), text: 'invalid', src: '/unexpected' })).toBe(
      document,
    );
    const profile = parseIES(iesSource());
    expect((await loader.load({ profile, text: 'invalid', src: '/unexpected' }))?.profile).toBe(profile);
  });
  it('retains the iesText alias while generic text has precedence', async () => {
    const loader = createPhotometrySourceLoader();
    expect((await loader.load({ iesText: iesSource() }))?.sourceFormat).toBe('ies');
    expect((await loader.load({ text: ldtSource(), iesText: 'invalid' }))?.sourceFormat).toBe('ldt');
  });
  it('requires an explicit alternative lamp selection and respects a zero-based index', async () => {
    const loader = createPhotometrySourceLoader();
    await expect(loader.load({ text: ldtSource({ alternatives: true }) })).rejects.toThrow(/lampSetIndex/);
    const document = await loader.load({ text: ldtSource({ alternatives: true }), lampSetIndex: 1 });
    expect(document?.selectedLampSetIndex).toBe(1);
    expect(document?.profile.candelaValues[0]?.[0]).toBe(25);
    expect(document?.lampSets).toHaveLength(2);
  });
  it('cancels a previous fetch when text changes, ignoring its later completion', async () => {
    const slow = deferred<ReturnType<typeof response>>();
    let signal: AbortSignal | undefined;
    const loader = createPhotometrySourceLoader((_url, init) => {
      signal = init.signal;
      return slow.promise;
    });
    const first = loader.load({ src: '/slow.ies' });
    await Promise.resolve();
    const second = loader.load({ text: ldtSource() });
    slow.resolve(response(iesSource()));
    expect(await first).toBeUndefined();
    expect((await second)?.sourceFormat).toBe('ldt');
    expect(signal?.aborted).toBe(true);
  });
  it('ignores a stale rejected fetch instead of showing an obsolete error', async () => {
    const slow = deferred<ReturnType<typeof response>>();
    const loader = createPhotometrySourceLoader(() => slow.promise);
    const first = loader.load({ src: '/slow.ies' });
    await Promise.resolve();
    const second = loader.load({ text: ldtSource() });
    slow.reject(new Error('Obsolete network error'));
    expect(await first).toBeUndefined();
    expect((await second)?.sourceFormat).toBe('ldt');
  });
  it('cancels after headers but before body completion and skips stale malformed text', async () => {
    const body = deferred<string>();
    const loader = createPhotometrySourceLoader(async () => ({ ok: true, status: 200, text: () => body.promise }));
    const first = loader.load({ src: '/slow.ldt' });
    await Promise.resolve();
    await Promise.resolve();
    loader.cancel();
    body.resolve('invalid stale body');
    expect(await first).toBeUndefined();
  });
  it('cancels same-turn in-memory sources and publishes only the latest one', async () => {
    const loader = createPhotometrySourceLoader();
    const first = loader.load({ text: iesSource() });
    const second = loader.load({ text: ldtSource() });
    expect(await first).toBeUndefined();
    expect((await second)?.sourceFormat).toBe('ldt');
  });
  it('reports active HTTP errors, invalid format hints and invalid lamp-set indices', async () => {
    const loader = createPhotometrySourceLoader(async () => ({ ok: false, status: 404, text: async () => '' }));
    await expect(loader.load({ src: '/missing.ldt' })).rejects.toThrow('HTTP 404');
    await expect(loader.load({ text: iesSource(), format: 'bad' as 'ies' })).rejects.toThrow('format');
    await expect(loader.load({ text: ldtSource(), lampSetIndex: -1 })).rejects.toThrow('nonnegative integer');
    expect(await loader.load({})).toBeUndefined();
  });
  it('parses attribute selections strictly and rejects empty, negative, fractional and unsafe indices', () => {
    expect(parseLampSetIndex(null)).toBeUndefined();
    expect(parseLampSetIndex('0')).toBe(0);
    expect(parseLampSetIndex('2')).toBe(2);
    for (const text of ['', '-1', '1.2', 'x', '9007199254740992'])
      expect(() => parseLampSetIndex(text)).toThrow('nonnegative integer');
  });
});
