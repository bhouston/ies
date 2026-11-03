export function iesSource(
  options: {
    header?: string;
    metadata?: string;
    vertical?: number[];
    horizontal?: number[];
    values?: number[][];
    factors?: string;
    type?: number;
    lamps?: number;
    lumens?: number;
    watts?: number;
    tilt?: string;
  } = {},
): string {
  const vertical = options.vertical ?? [0, 90, 180];
  const horizontal = options.horizontal ?? [0];
  return `${options.header ?? 'IES:LM-63-2019'}
${options.metadata ?? '[TEST] Synthetic\n[TESTLAB] Test suite\n[ISSUEDATE] 2026-11-03\n[MANUFAC] Example'}
TILT=${options.tilt ?? 'NONE'}
${options.lamps ?? 1} ${options.lumens ?? -1} 1 ${vertical.length} ${horizontal.length} ${options.type ?? 1} 2 0.1 0.1 0
${options.factors ?? `1 1.10000 ${options.watts ?? 10}`}
${vertical.join(' ')}
${horizontal.join(' ')}
${(options.values ?? horizontal.map(() => vertical.map(() => 100))).flat().join(' ')}`;
}
