import { describe, expect, it } from 'vitest';
import type { PhotometrySourceDescription, SourceField } from '@ies-tools/core';
import { analyze, fieldAt, hoverMarkdown, lensSummary, outline, toProblems } from './languageFeatures.js';
import { iesSource } from '../../core/test/iesSource.js';
import { ldtSource } from '../../viewer/test/photometryFixtures.js';

const field = (line: number, start: number, end: number, name: string): SourceField => ({
  line,
  start,
  end,
  name,
  description: `${name} description`,
});

describe('editor language features', () => {
  it('maps located diagnostics to editor problems, honoring strict mode', () => {
    const result = analyze(iesSource({ vertical: [0, 90, 45] }), '/a/light.IES');
    expect(toProblems(result.diagnostics)).toEqual([
      {
        span: { startLine: 8, startCharacter: 5, endLine: 8, endCharacter: 7 },
        severity: 'error',
        message: 'Vertical angles must be strictly increasing within 0..180 degrees',
        code: 'IES_INVALID_ANGLES',
      },
    ]);
    const warnings = [{ code: 'X', severity: 'warning' as const, message: 'm' }];
    expect(toProblems(warnings)[0]).toMatchObject({ span: null, severity: 'warning' });
    expect(toProblems(warnings, true)[0]!.severity).toBe('error');
  });
  it('uses the language ID before the file extension', () => {
    expect(analyze(ldtSource(), '/untitled', 'eulumdat').valid).toBe(true);
    expect(analyze(ldtSource(), '/light.LDT').valid).toBe(true);
    expect(analyze(iesSource(), '/light.txt', 'ies').valid).toBe(true);
  });
  it('finds the field under the cursor and renders escaped Markdown', () => {
    const fields = [field(0, 0, 4, 'A'), field(1, 0, 1, 'B'), field(1, 2, 5, 'C'), field(3, 1, 2, 'D')];
    expect(fieldAt(fields, 1, 3)?.name).toBe('C');
    expect(fieldAt(fields, 1, 1)).toBeUndefined();
    expect(fieldAt(fields, 1, 5)).toBeUndefined();
    expect(fieldAt(fields, 3, 1)?.name).toBe('D');
    expect(fieldAt([], 0, 0)).toBeUndefined();
    expect(hoverMarkdown({ ...field(0, 0, 1, '[_X*]'), description: 'Candela at 45°' })).toBe(
      '**\\[\\_X\\*\\]**\n\nCandela at 45°',
    );
    const hover = fieldAt(analyze(iesSource(), '/a.ies').fields, 6, 0)!;
    expect(hover.name).toBe('Number of lamps');
  });
  it('lists one outline entry per header field and collapses repeated arrays', () => {
    const entries = outline(analyze(iesSource({ vertical: [0, 45, 90, 180] }), '/a.ies').fields);
    const names = entries.map((entry) => entry.name);
    expect(names.slice(0, 7)).toEqual([
      'Format line',
      '[TEST]',
      '[TESTLAB]',
      '[ISSUEDATE]',
      '[MANUFAC]',
      'TILT',
      'Number of lamps',
    ]);
    expect(names).toContain('File generation type');
    expect(names.slice(-3)).toEqual(['Vertical angles (4)', 'Horizontal angles', 'Candela values (4)']);
    expect(entries.at(-1)).toMatchObject({
      array: true,
      span: { startLine: 10, startCharacter: 0, endLine: 10, endCharacter: 15 },
    });
    expect(entries.find((entry) => entry.name === 'Number of lamps')!.detail).toBe('Number of lamps in the luminaire');
  });
  it('summarizes valid files and counts errors in the lens title', () => {
    const spot = iesSource({ vertical: [0, 30, 60, 90], values: [[100, 80, 20, 0]] });
    expect(lensSummary(analyze(spot, '/a.ies'))).toEqual({
      title: 'Φ 213 lm · Imax 100 cd · beam 90.0°/90.0° · 21.3 lm/W',
      problems: false,
    });
    expect(lensSummary(analyze(iesSource(), '/a.ies')).title).toBe('Φ 1257 lm · Imax 100 cd · 125.7 lm/W');
    expect(lensSummary(analyze('IES:LM-63-2019\nTILT=NONE\n1', '/a.ies'))).toEqual({
      title: '1 error',
      problems: true,
    });
    const errors = {
      valid: false,
      profile: null,
      fields: [],
      diagnostics: [1, 2].map(() => ({ code: 'X', severity: 'error', message: '' })),
    };
    expect(lensSummary(errors as PhotometrySourceDescription).title).toBe('2 errors');
    const alternatives = lensSummary(analyze(ldtSource({ alternatives: true }), '/a.ldt'));
    expect(alternatives.title).toMatch(/Select an alternative lamp configuration/);
    const typeA = lensSummary(analyze(iesSource({ type: 3, vertical: [-90, 0, 90] }), '/a.ies'));
    expect(typeA.problems).toBe(false);
  });
  it('marks a principal plane without a beam crossing with a dash', () => {
    const text = iesSource({
      vertical: [0, 30, 60, 90],
      horizontal: [0, 90],
      values: [
        [100, 80, 20, 0],
        [100, 100, 100, 100],
      ],
    });
    expect(lensSummary(analyze(text, '/a.ies')).title).toContain('beam 90.0°/–');
  });
});
