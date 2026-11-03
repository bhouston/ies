/**
 * A single-line location in photometric source text. `line` is 0-based; `start` and `end` are UTF-16
 * column offsets with `end` exclusive, as used by editors such as VS Code. Lines are split on CRLF, CR or
 * LF; a leading byte-order mark is not counted.
 */
export interface SourceRange {
  line: number;
  start: number;
  end: number;
}

/** A described piece of source text, for hover help and outlines. */
export interface SourceField extends SourceRange {
  /** Short label. Every element of a repeated array shares one name, such as "Vertical angles". */
  name: string;
  description: string;
}

/** Ranges of parsed profile fields, keyed by diagnostic field name. Kept outside the profile objects. */
export const profileRanges = new WeakMap<object, Record<string, SourceRange>>();

export function lineRange(lines: string[], line: number): SourceRange {
  const text = lines[line]!;
  const start = text.length - text.trimStart().length;
  return { line, start, end: Math.max(start, text.trimEnd().length) };
}

export function endRange(lines: string[]): SourceRange {
  // Splitting text always yields at least one line.
  const line = lines.length - 1;
  const end = lines[line]!.length;
  return { line, start: end, end };
}

/** Reads delimiter-separated tokens line by line and remembers where the last token was. */
export class TokenReader {
  line: number;
  start = 0;
  end = 0;
  private text = '';
  private readonly pattern: RegExp;

  constructor(
    private readonly lines: string[],
    firstLine: number,
    token = /[^\s,]+/g,
  ) {
    this.line = firstLine - 1;
    this.pattern = new RegExp(token.source, 'g');
  }

  next(): string | undefined {
    if (this.line >= this.lines.length) return undefined;
    for (;;) {
      const match = this.pattern.exec(this.text);
      if (match) {
        this.start = match.index;
        this.end = match.index + match[0].length;
        return match[0];
      }
      if (this.line + 1 >= this.lines.length) {
        this.line = this.lines.length;
        return undefined;
      }
      this.text = this.lines[++this.line]!;
      this.pattern.lastIndex = 0;
    }
  }

  /** Range of the last token, or the end of the file once the tokens are exhausted. */
  range(): SourceRange {
    return this.line >= this.lines.length
      ? endRange(this.lines)
      : { line: this.line, start: this.start, end: this.end };
  }
}
