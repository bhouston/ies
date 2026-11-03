import {
  describePhotometrySource,
  inspectParsedPhotometry,
  inputFormat,
  type PhotometryDiagnostic,
  type PhotometrySourceDescription,
  type SourceField,
} from '@ies-tools/core';

/** Editor-neutral mapping from core results to what the VS Code providers display. No `vscode` import. */
export interface Span {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

export interface Problem {
  /** Null when core has no location; the caller uses the first line. */
  span: Span | null;
  severity: 'error' | 'warning' | 'info';
  message: string;
  code: string;
}

export interface OutlineEntry {
  name: string;
  detail: string;
  span: Span;
  /** True when the entry collapses a repeated array such as candela values. */
  array: boolean;
}

export function analyze(text: string, path: string, languageId?: string): PhotometrySourceDescription {
  const hint = languageId === 'eulumdat' ? 'ldt' : languageId === 'ies' ? 'ies' : undefined;
  return describePhotometrySource(text, inputFormat(text, path, hint));
}

const span = (range: { line: number; start: number; end: number }): Span => ({
  startLine: range.line,
  startCharacter: range.start,
  endLine: range.line,
  endCharacter: range.end,
});

/** Strict mode reports warnings as errors, matching the preview's strict validation. */
export function toProblems(diagnostics: PhotometryDiagnostic[], strict = false): Problem[] {
  return diagnostics.map((diagnostic) => ({
    span: diagnostic.range ? span(diagnostic.range) : null,
    severity: strict && diagnostic.severity === 'warning' ? 'error' : diagnostic.severity,
    message: diagnostic.message,
    code: diagnostic.code,
  }));
}

/** Fields are in document order, so a binary search finds the one under the cursor. */
export function fieldAt(fields: SourceField[], line: number, character: number): SourceField | undefined {
  let lo = 0;
  let hi = fields.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const field = fields[mid]!;
    if (field.line < line || (field.line === line && field.end <= character)) lo = mid + 1;
    else if (field.line > line || field.start > character) hi = mid - 1;
    else return field;
  }
  return undefined;
}

const escapeMarkdown = (text: string) => text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&');

export function hoverMarkdown(field: SourceField): string {
  return `**${escapeMarkdown(field.name)}**\n\n${escapeMarkdown(field.description)}`;
}

/** One entry per header field; consecutive fields with the same name collapse into "Name (count)". */
export function outline(fields: SourceField[]): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  for (let i = 0; i < fields.length;) {
    const first = fields[i]!;
    let j = i + 1;
    while (j < fields.length && fields[j]!.name === first.name) j++;
    const last = fields[j - 1]!;
    const count = j - i;
    entries.push({
      name: count > 1 ? `${first.name} (${count})` : first.name,
      detail: count > 1 ? '' : first.description,
      span: { startLine: first.line, startCharacter: first.start, endLine: last.line, endCharacter: last.end },
      array: count > 1,
    });
    i = j;
  }
  return entries;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Title of the line-0 summary lens, and whether it should link to the Problems panel. */
export function lensSummary(result: PhotometrySourceDescription): { title: string; problems: boolean } {
  const errors = result.diagnostics.filter((item) => item.severity === 'error').length;
  if (errors || !result.profile) return { title: plural(Math.max(errors, 1), 'error'), problems: true };
  let inspection;
  try {
    inspection = inspectParsedPhotometry(result.profile);
  } catch {
    return { title: 'Photometric summary unavailable', problems: false };
  }
  const beam = (plane: number) => {
    const value = inspection.beamAngles.find((item) => item.horizontalDegrees === plane)?.beamAngleDegrees;
    return value == null ? null : `${value.toFixed(1)}°`;
  };
  const [c0, c90] = [beam(0), beam(90)];
  const parts = [
    inspection.integratedFluxLumens == null ? null : `Φ ${Math.round(inspection.integratedFluxLumens)} lm`,
    inspection.peakCandela == null ? null : `Imax ${Math.round(inspection.peakCandela)} cd`,
    c0 || c90 ? `beam ${c0 ?? '–'}/${c90 ?? '–'}` : null,
    inspection.luminousEfficacyLumensPerWatt == null
      ? null
      : `${inspection.luminousEfficacyLumensPerWatt.toFixed(1)} lm/W`,
  ].filter(Boolean);
  return {
    title: parts.length
      ? parts.join(' · ')
      : (inspection.metricsUnsupportedReason ?? 'Photometric summary unavailable'),
    problems: false,
  };
}
