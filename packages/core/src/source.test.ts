import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  describePhotometrySource,
  diagnoseIES,
  iesKeywordDescription,
  inspectParsedPhotometry,
  ldtDiagnostics,
  IESParseError,
  LDTParseError,
  parseIES,
  parseLDT,
  validateIES,
  validatePhotometry,
  validateLDT,
  writeLDT,
  type LDTProfile,
  type SourceField,
  type SourceRange,
} from './index.js';
import { TokenReader } from './source.js';
import { iesSource } from '../test/iesSource.js';
import { ldtSource } from '../../viewer/test/photometryFixtures.js';

const lines = (text: string) => text.split(/\r\n?|\n/);
const slice = (text: string, range: SourceRange) => lines(text)[range.line]!.slice(range.start, range.end);
/** The field covering a position, as an editor hover would look it up. */
const fieldAt = (fields: SourceField[], line: number, column: number) =>
  fields.find((field) => field.line === line && field.start <= column && column < field.end);
const lineOf = (text: string, value: string) => lines(text).indexOf(value);
const iesError = (text: string) => {
  const result = validateIES(text);
  expect(result.valid).toBe(false);
  return result.diagnostics[0]!;
};

describe('IES diagnostic ranges', () => {
  it('points at the bad token', () => {
    const text = iesSource().replace(/100 100 100$/, '100 1x0 100');
    const diagnostic = iesError(text);
    expect(diagnostic.code).toBe('IES_INVALID_NUMBER');
    expect(diagnostic.range).toEqual({ line: 10, start: 4, end: 7 });
    expect(slice(text, diagnostic.range!)).toBe('1x0');
  });
  it('marks the header line for count errors and table limits', () => {
    const text = iesSource().replace('1 -1 1 3 1 1 2', '1 -1 1 0 1 1 2');
    const diagnostic = iesError(text);
    expect(diagnostic.code).toBe('IES_INVALID_COUNT');
    expect(diagnostic.range).toEqual({ line: 6, start: 0, end: lines(text)[6]!.length });
  });
  it('points at the first offending angle', () => {
    const text = iesSource({ vertical: [0, 90, 45] });
    const diagnostic = iesError(text);
    expect(diagnostic.code).toBe('IES_INVALID_ANGLES');
    expect(slice(text, diagnostic.range!)).toBe('45');
    expect(diagnostic.range!.line).toBe(8);
  });
  it('uses the format line for version issues', () => {
    expect(iesError(iesSource({ header: 'IES:LM-63-2099' })).range).toEqual({ line: 0, start: 0, end: 14 });
    const warning = validateIES(iesSource({ metadata: '[TEST] x' })).diagnostics[0]!;
    expect(warning).toMatchObject({ code: 'IES_REQUIRED_METADATA', range: { line: 0, start: 0, end: 14 } });
  });
  it('points policy warnings at their source token', () => {
    const text = iesSource({ header: 'IESNA:LM-63-1995', factors: '1 2 10' });
    const warning = validateIES(text).diagnostics.find((item) => item.code === 'IES_RESERVED_FIELD')!;
    expect(warning.range).toEqual({ line: 7, start: 2, end: 3 });
  });
  it('uses the end of the file for truncation and the first extra token for trailing data', () => {
    const truncated = iesSource().replace(/ 100$/, '');
    expect(iesError(truncated).range).toEqual({ line: 10, start: 7, end: 7 });
    const trailing = `${iesSource()}\n7 8`;
    expect(iesError(trailing)).toMatchObject({ code: 'IES_TRAILING_DATA', range: { line: 11, start: 0, end: 1 } });
  });
  it('exposes ranges on parse errors, counting CRLF line breaks once', () => {
    const text = iesSource({ values: [[100, -5, 100]] }).replaceAll('\n', '\r\n');
    try {
      parseIES(text);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(IESParseError);
      expect((error as IESParseError).range).toEqual({ line: 10, start: 4, end: 6 });
    }
  });
  it('does not change profiles or diagnostics without source text', () => {
    expect(Object.keys(parseIES(iesSource()))).not.toContain('range');
  });
});

describe('LDT diagnostic ranges', () => {
  const source = ldtSource();
  it('points at the bad line field', () => {
    const text = source.replace('\n2000\n', '\n20x0\n');
    const diagnostic = validatePhotometry(text, 'ldt').diagnostics[0]!;
    expect(diagnostic.range).toEqual({ line: lineOf(text, '20x0'), start: 0, end: 4 });
  });
  it('points at the offending tail token and the end of truncated files', () => {
    const text = source.replace(/\n0\n90\n180\n/, '\n0\n90\n45\n');
    const error = (() => {
      try {
        parseLDT(text);
      } catch (caught) {
        return caught as LDTParseError;
      }
    })()!;
    expect(error).toBeInstanceOf(LDTParseError);
    expect(error.message).toContain('Gamma angles');
    expect(slice(text, error.range!)).toBe('45');
    const truncated = source.split('\n').slice(0, -3).join('\n');
    const last = lines(truncated).length - 1;
    expect(validatePhotometry(truncated, 'ldt').diagnostics[0]!.range).toEqual({
      line: last,
      start: lines(truncated)[last]!.length,
      end: lines(truncated)[last]!.length,
    });
  });
  it('points validation warnings at their lines', () => {
    const text = ldtSource({ emptyDescriptions: true });
    const [identification, name] = validatePhotometry(text, 'ldt').diagnostics;
    expect(identification!.range!.line).toBe(0);
    expect(name!.range!.line).toBe(8);
    expect(validatePhotometry(source, 'ldt', false, 9).diagnostics[0]!.range!.line).toBe(25);
  });
});

describe('describePhotometrySource', () => {
  const fixtureDirectory = new URL('../../../fixtures/', import.meta.url);
  const files = readdirSync(fixtureDirectory).filter((file) => file.endsWith('.ies'));
  it.each(files)('describes %s', (file) => {
    const text = readFileSync(new URL(file, fixtureDirectory), 'utf8');
    const { profile, fields, diagnostics } = describePhotometrySource(text, 'ies');
    expect(profile).not.toBeNull();
    expect(diagnostics.every((item) => item.severity === 'error' || item.range)).toBe(true);
    const ies = parseIES(text);
    const named = (name: string) => fields.filter((field) => field.name === name);
    expect(named('Candela values')).toHaveLength(ies.verticalAngles.length * ies.horizontalAngles.length);
    expect(named('Vertical angles')).toHaveLength(ies.verticalAngles.length);
    // Fields are in document order so editors can binary search them.
    for (let i = 1; i < fields.length; i++)
      expect(fields[i]!.line * 1e6 + fields[i]!.start).toBeGreaterThan(
        fields[i - 1]!.line * 1e6 + fields[i - 1]!.start,
      );
    const tilt = named('TILT')[0]!;
    expect(slice(text, tilt)).toMatch(/^TILT=/);
    const lamps = named('Number of lamps')[0]!;
    expect(fieldAt(fields, lamps.line, lamps.start)).toBe(lamps);
    expect(Number(slice(text, lamps))).toBe(ies.lampCount);
    const third = named('Vertical angles')[2]!;
    expect(third.description).toBe('Vertical angle #3 (degrees)');
    expect(Number(slice(text, third))).toBe(ies.verticalAngles[2]);
    const candela = named('Candela values').at(-1)!;
    expect(candela.description).toBe(
      `Candela at horizontal ${ies.horizontalAngles.at(-1)}°, vertical ${ies.verticalAngles.at(-1)}° (before multiplier)`,
    );
    expect(fields.find((field) => field.name.startsWith('['))?.description).toBeTruthy();
  });
  it('describes the format line, keywords, the edition-dependent field and an embedded TILT block', () => {
    const text = iesSource({ metadata: '[TEST] x\n[_CUSTOM] y\n[LUMCAT] z', tilt: 'INCLUDE\n1\n2\n0 90\n1 0.5' });
    const { fields } = describePhotometrySource(text, 'ies');
    expect(fieldAt(fields, 0, 3)).toMatchObject({ name: 'Format line', description: expect.stringContaining('2019') });
    expect(fieldAt(fields, 2, 1)).toMatchObject({ name: '[_CUSTOM]', description: 'User-defined keyword' });
    expect(fieldAt(fields, 3, 1)!.description).toBe('Luminaire catalog number');
    expect(fieldAt(fields, 5, 0)!.name).toBe('Lamp-to-luminaire geometry');
    expect(fieldAt(fields, 8, 3)).toMatchObject({ name: 'Tilt multiplying factors' });
    expect(fieldAt(fields, 10, 2)!.name).toBe('File generation type');
  });
  it('describes every EULUMDAT line field and tail token', () => {
    const text = ldtSource({ alternatives: true });
    const { fields, valid } = describePhotometrySource(text, 'ldt');
    expect(valid).toBe(true);
    expect(fieldAt(fields, 2, 0)).toMatchObject({ name: 'Isym', description: expect.stringContaining('C0–C180') });
    expect(fields.find((field) => field.name === 'Lamp set 2 total luminous flux')).toBeTruthy();
    expect(fields.filter((field) => field.name === 'Direct ratios')).toHaveLength(10);
    expect(fields.at(-1)).toMatchObject({
      name: 'Luminous intensities',
      description: 'Luminous intensity at C 0°, γ 180° (cd/klm)',
    });
    expect(fields).toHaveLength(lines(text).filter(Boolean).length);
  });
  it('returns partial fields and a located diagnostic for invalid files', () => {
    const ies = describePhotometrySource(iesSource({ values: [[100, -1, 100]] }), 'ies');
    expect(ies.profile).toBeNull();
    expect(ies.diagnostics[0]).toMatchObject({ code: 'IES_NEGATIVE_CANDELA', range: { line: 10 } });
    expect(ies.fields.filter((field) => field.name === 'Candela values')).toHaveLength(2);
    const ldt = describePhotometrySource(ldtSource().split('\n').slice(0, 5).join('\n'), 'ldt');
    expect(ldt.valid).toBe(false);
    expect(ldt.fields.map((field) => field.name)).toEqual(['Company identification', 'Ityp', 'Isym', 'Mc', 'Dc']);
    expect(ldt.diagnostics[0]!.range).toEqual({ line: 4, start: 1, end: 1 });
  });
});

/** Fake locator that encodes the requested key and index in the range. */
const locate = (key: string, index?: number) => ({ line: key.length, start: index ?? -1, end: 0 });
/** Replace one 0-based line of LDT text. */
const withLine = (text: string, line: number, value: string) =>
  lines(text)
    .map((current, index) => (index === line ? value : current))
    .join('\n');
const ldtThrown = (text: string) => {
  try {
    parseLDT(text);
  } catch (error) {
    expect(error).toBeInstanceOf(LDTParseError);
    return error as LDTParseError;
  }
  throw new Error('expected an LDTParseError');
};

describe('range edge cases', () => {
  it('keeps reporting the end of the file after the tokens run out', () => {
    const reader = new TokenReader(['1 2', ''], 0);
    expect([reader.next(), reader.next(), reader.next(), reader.next()]).toEqual(['1', '2', undefined, undefined]);
    expect(reader.range()).toEqual({ line: 1, start: 0, end: 0 });
  });
  it('locates invalid lumens and describes unknown keywords', () => {
    const text = iesSource({ lumens: -2 });
    expect(iesError(text)).toMatchObject({ code: 'IES_INVALID_RANGE', range: { line: 6, start: 2, end: 4 } });
    expect(iesKeywordDescription('NOTAKEYWORD')).toBe('Unrecognized keyword');
  });
  it('omits ranges for profiles that were not parsed from text', () => {
    const ies = structuredClone(parseIES(iesSource({ metadata: '[TEST] x' })));
    expect(diagnoseIES(ies).length).toBeGreaterThan(0);
    expect(diagnoseIES(ies).every((item) => item.range === undefined)).toBe(true);
    const ldt = structuredClone(parseLDT(ldtSource({ alternatives: true, emptyDescriptions: true })));
    expect(ldtDiagnostics(ldt).every((item) => item.range === undefined)).toBe(true);
    expect(inspectParsedPhotometry(ldt).diagnostics.at(-1)).toMatchObject({
      code: 'LDT_LAMP_SET_SELECTION_REQUIRED',
    });
    expect(inspectParsedPhotometry(ldt).diagnostics.at(-1)!.range).toBeUndefined();
  });
  it('applies strict mode in describePhotometrySource', () => {
    const text = iesSource({ metadata: '[TEST] x' });
    expect(describePhotometrySource(text, 'ies').valid).toBe(true);
    expect(describePhotometrySource(text, 'ies', true).valid).toBe(false);
  });

  // ldtSource layout: 1 Isym, 3 Mc, 5 Ng, 12 luminaire length, 21 DFF, 26 lamp count,
  // 32 first direct ratio, 42 C angle, 43–45 γ angles, 46–48 intensities.
  const source = ldtSource();
  it.each([
    [2, '2', 'C0–C180 symmetry'],
    [2, '7', 'C90–C270'],
    [5, '100001', 'gamma-angle count'],
    [12, '1e999', 'luminaire length must be finite'],
    [21, '150', 'downward flux fraction must not exceed 100%'],
    [26, '0', 'lamp counts must be nonzero integers'],
    [32, '2', 'direct ratios must not exceed one'],
    [42, '10', 'C angles must start at 0°'],
    [46, '-1', 'intensity must be nonnegative'],
  ])('points LDT line %i = %s at its line', (line, value, message) => {
    const error = ldtThrown(withLine(source, line, value));
    expect(error.message).toContain(message);
    expect(error.range?.line).toBe(line);
  });
  it('points the table-size limit at the γ count and missing angles at the end', () => {
    const huge = withLine(withLine(source, 3, '100000'), 5, '101');
    expect(ldtThrown(huge)).toMatchObject({ range: { line: 5 }, message: expect.stringContaining('ten million') });
    const short = lines(source).slice(0, 44).join('\n');
    expect(ldtThrown(short)).toMatchObject({ range: { line: 43, start: 1, end: 1 } });
  });
  it('validates the symmetry code after the table layout', () => {
    const native = parseLDT(source);
    const quadrant: LDTProfile = {
      ...native,
      symmetry: 3,
      cPlaneSpacing: 90,
      cAngles: [0, 90, 180, 270],
      intensities: [native.intensities[0]!, native.intensities[0]!, native.intensities[0]!],
    };
    const error = ldtThrown(withLine(writeLDT(quadrant), 2, '5'));
    expect(error).toMatchObject({ range: { line: 2 }, message: expect.stringContaining('symmetry must be 0..4') });
  });
  it('describes intensities by index when the symmetry is invalid', () => {
    const { fields, valid } = describePhotometrySource(withLine(source, 2, '7'), 'ldt');
    expect(valid).toBe(false);
    expect(fields.at(-1)!.description).toBe('Luminous intensity #3 (cd/klm)');
  });
  it('locates whole-table validation errors at the first element of the table', () => {
    const native = parseLDT(source);
    const cases: [Partial<LDTProfile>, string, string][] = [
      [
        { luminousArea: { ...native.luminousArea, heights: [1, 2, 3] as never } },
        'four luminous-area',
        'luminousArea.heights',
      ],
      [{ directRatios: [0, 0] }, 'ten direct ratios', 'directRatios'],
      [{ intensities: [[1]] }, 'intensity table dimensions', 'intensities'],
    ];
    for (const [change, message, key] of cases) {
      const invalid = { ...native, ...change };
      expect(() => validateLDT(invalid)).toThrow(message);
      try {
        validateLDT(invalid, locate);
      } catch (error) {
        expect((error as LDTParseError).range).toEqual({ line: key.length, start: 0, end: 0 });
      }
    }
  });
  it('rejects structurally invalid in-memory profiles', () => {
    const native = parseLDT(source);
    for (const [change, message] of [
      [{ typeIndicator: 4 }, 'type indicator'],
      [{ cAngles: [] }, 'C angles cannot be empty'],
      [{ measurementTilt: Number.NaN }, 'measurement tilt must be finite'],
      [{ lampSets: [] }, 'one to twenty lamp sets'],
    ] as [Partial<LDTProfile>, string][])
      expect(() => validateLDT({ ...native, ...change } as LDTProfile)).toThrow(message);
  });
});
