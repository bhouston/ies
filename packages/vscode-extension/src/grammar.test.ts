import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { INITIAL, Registry, type IGrammar, type IRawGrammar } from 'vscode-textmate';
import { createOnigScanner, createOnigString, loadWASM, OnigScanner } from 'vscode-oniguruma';

const root = new URL('../', import.meta.url);
const fixtures = new URL('../../../fixtures/', import.meta.url);
const read = (path: string, base = root): string => readFileSync(new URL(path, base), 'utf8');
const manifest = JSON.parse(read('package.json')) as {
  contributes: {
    languages: { id: string; configuration: string }[];
    grammars: { language: string; scopeName: string; path: string }[];
  };
};
const grammars = Object.fromEntries(
  manifest.contributes.grammars.map((entry) => [entry.scopeName, JSON.parse(read(entry.path)) as IRawGrammar]),
);

await loadWASM(readFileSync(createRequire(import.meta.url).resolve('vscode-oniguruma/release/onig.wasm')));
const registry = new Registry({
  onigLib: Promise.resolve({ createOnigScanner, createOnigString }),
  loadGrammar: async (scopeName) => grammars[scopeName] ?? null,
});

/** Returns [text, innermost scope] for every token on the line. */
async function tokenize(scopeName: string, line: string): Promise<[string, string][]> {
  const grammar = (await registry.loadGrammar(scopeName)) as IGrammar;
  return grammar
    .tokenizeLine(line, INITIAL)
    .tokens.map((token) => [line.slice(token.startIndex, token.endIndex), token.scopes.at(-1) ?? '']);
}
const scopeOf = async (scopeName: string, line: string, text: string): Promise<string | undefined> =>
  (await tokenize(scopeName, line)).find(([value]) => value === text)?.[1];

function collectRegexes(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) for (const item of node) collectRegexes(item, out);
  else if (node && typeof node === 'object')
    for (const [key, value] of Object.entries(node)) {
      if (['match', 'begin', 'end', 'while'].includes(key) && typeof value === 'string') out.push(value);
      else collectRegexes(value, out);
    }
  return out;
}

describe('package.json contributions', () => {
  it('reference files that exist', () => {
    const paths = [
      ...manifest.contributes.languages.map((language) => language.configuration),
      ...manifest.contributes.grammars.map((grammar) => grammar.path),
    ];
    expect(paths).toHaveLength(4);
    for (const path of paths) expect(existsSync(new URL(path, root)), path).toBe(true);
  });
  it('pair each grammar with a contributed language and matching scope', () => {
    const ids = manifest.contributes.languages.map((language) => language.id);
    expect(ids).toEqual(['ies', 'eulumdat']);
    for (const grammar of manifest.contributes.grammars) {
      expect(ids).toContain(grammar.language);
      expect(grammars[grammar.scopeName]?.scopeName).toBe(grammar.scopeName);
    }
  });
  it('ship valid language configurations with compilable word patterns', () => {
    for (const language of manifest.contributes.languages) {
      const config = JSON.parse(read(language.configuration)) as { wordPattern: string; brackets: string[][] };
      expect(config.brackets).toEqual([['[', ']']]);
      const words = '1.5e-3 [MORE] -2,5'.match(new RegExp(config.wordPattern, 'g'));
      expect(words).toContain('1.5e-3');
    }
  });
});

describe('grammar regexes', () => {
  it('compile with Oniguruma', () => {
    for (const grammar of Object.values(grammars)) {
      const regexes = collectRegexes(grammar);
      expect(regexes.length).toBeGreaterThan(0);
      for (const regex of regexes) expect(() => new OnigScanner([regex]).dispose(), regex).not.toThrow();
    }
  });
  it('tokenize long pathological lines quickly', async () => {
    const start = performance.now();
    await tokenize('source.ies', `${'1'.repeat(20000)}x ${'[_'.repeat(5000)} ${' '.repeat(20000)}`);
    await tokenize('source.eulumdat', `${'1'.repeat(20000)}${' '.repeat(20000)}x`);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe('IES grammar', () => {
  const ies = 'source.ies';
  const fixtureLines = read('007cfb11e343e2f42e3b476be4ab684e.ies', fixtures).split(/\r?\n/);
  const line = (prefix: string): string => fixtureLines.find((value) => value.startsWith(prefix)) ?? '';

  it('highlights format lines as directives', async () => {
    expect(await scopeOf(ies, line('IESNA:'), 'IESNA:LM-63-1995')).toBe('keyword.control.directive.format.ies');
    expect(await scopeOf(ies, 'IES:LM-63-2019', 'IES:LM-63-2019')).toBe('keyword.control.directive.format.ies');
    expect(await scopeOf(ies, 'IESNA91', 'IESNA91')).toBe('keyword.control.directive.format.ies');
  });
  it('highlights keyword tags and their values', async () => {
    expect(await tokenize(ies, line('[MANUFAC]'))).toEqual([
      ['[', 'punctuation.definition.tag.begin.ies'],
      ['MANUFAC', 'entity.name.tag.keyword.ies'],
      [']', 'punctuation.definition.tag.end.ies'],
      [' BEGA', 'string.unquoted.value.ies'],
    ]);
    expect(await scopeOf(ies, line('[LAMP]'), '     321 lm,9 W')).toBe('string.unquoted.value.ies');
  });
  it('distinguishes user keywords and continuations', async () => {
    expect(await scopeOf(ies, '[_TEMPCOLOR] 3000K', '_TEMPCOLOR')).toBe('entity.other.attribute-name.user-keyword.ies');
    expect(await scopeOf(ies, line('[MORE]'), 'MORE')).toBe('keyword.other.continuation.ies');
    expect(await scopeOf(ies, line('[MORE]'), ' Copyright LUMCat V ')).toBe('string.unquoted.value.ies');
  });
  it('highlights TILT lines', async () => {
    expect(await tokenize(ies, line('TILT='))).toEqual([
      ['TILT', 'keyword.other.tilt.ies'],
      ['=', 'keyword.operator.assignment.ies'],
      ['NONE', 'constant.language.tilt.ies'],
    ]);
    expect(await scopeOf(ies, 'TILT=INCLUDE', 'INCLUDE')).toBe('constant.language.tilt.ies');
    expect(await scopeOf(ies, 'TILT= lamp tilt.dat', 'lamp tilt.dat')).toBe('string.unquoted.filename.ies');
  });
  it('highlights signed, decimal and exponent numbers', async () => {
    const numbers = (await tokenize(ies, line('1 -1 1.0')))
      .filter(([, scope]) => scope === 'constant.numeric.ies')
      .map(([text]) => text);
    expect(numbers).toEqual(['1', '-1', '1.0', '73', '1', '1', '2', '-0.080', '0.000', '0.000']);
    expect(await scopeOf(ies, '  1.5E+02 .5 +3.', '1.5E+02')).toBe('constant.numeric.ies');
    expect(await scopeOf(ies, '  1.5E+02 .5 +3.', '+3.')).toBe('constant.numeric.ies');
    expect(await scopeOf(ies, 'abc12', 'abc12')).toBe('source.ies');
  });
});

describe('EULUMDAT grammar', () => {
  const ldt = 'source.eulumdat';
  it('treats numeric lines as numbers and everything else as strings', async () => {
    for (const value of ['1', ' 2.5 ', '-0,5', '1e3', '.75'])
      expect(await scopeOf(ldt, value, value)).toBe('constant.numeric.eulumdat');
    for (const value of ['BEGA', 'LED 3000K', '12 W', '1.2.3'])
      expect(await scopeOf(ldt, value, value)).toBe('string.unquoted.eulumdat');
  });
});
