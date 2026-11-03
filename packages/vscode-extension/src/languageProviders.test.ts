import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fake, languages, Range, uri, workspace, type Diagnostic } from '../test/vscodeMock.js';

vi.mock('vscode', () => import('../test/vscodeMock.js'));

const { registerLanguageFeatures } = await import('./languageProviders.js');

const VALID = `IES:LM-63-2019
[TEST] t
[TESTLAB] l
[ISSUEDATE] d
[MANUFAC] m
TILT=NONE
1 -1 1 4 1 1 2 0 0 0
1 1.10000 10
0 30 60 90
0
100 80 20 0`;
const BAD_ANGLE = VALID.replace('0 30 60 90', '0 30 20 90');

const textDocument = (path: string, text: string, languageId = 'plaintext') => ({
  uri: uri(path),
  version: 1,
  languageId,
  getText: vi.fn(() => text),
  lineAt: (line: number) => ({ range: new Range(line, 0, line, 1) }),
});
type TextDocument = ReturnType<typeof textDocument>;
const problems = (document: TextDocument): Diagnostic[] | undefined => fake.diagnostics.get(document.uri.toString());
const configure = (affected = true) => fake.configChanges.fire({ affectsConfiguration: () => affected });

let subscriptions: { dispose(): unknown }[];
const register = () => {
  subscriptions = [];
  registerLanguageFeatures({ subscriptions } as never);
};
const collection = () =>
  vi.mocked(languages.createDiagnosticCollection).mock.results.at(-1)!.value as {
    set: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

beforeEach(() => {
  fake.reset();
  register();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('diagnostics', () => {
  it('reports located diagnostics for photometric documents only', () => {
    expect(languages.createDiagnosticCollection).toHaveBeenCalledWith('ies-tools');
    const document = textDocument('/dir/a.ies', BAD_ANGLE);
    fake.opens.fire(document);
    fake.opens.fire(textDocument('/dir/notes.txt', BAD_ANGLE));
    expect(fake.diagnostics.size).toBe(1);
    expect(problems(document)).toEqual([
      expect.objectContaining({
        range: new Range(8, 5, 8, 7),
        message: 'Vertical angles must be strictly increasing within 0..180 degrees',
        severity: 0,
        source: 'ies-tools',
        code: 'IES_INVALID_ANGLES',
      }),
    ]);
  });

  it('validates already open documents, including those matched by language ID', () => {
    const document = textDocument('/untitled-1', BAD_ANGLE, 'ies');
    workspace.textDocuments = [document];
    register();
    expect(problems(document)).toHaveLength(1);
  });

  it('debounces edits by 250 ms', () => {
    vi.useFakeTimers();
    const document = textDocument('/dir/a.ies', VALID);
    fake.textChanges.fire({ document });
    document.version = 2;
    document.getText.mockReturnValue(BAD_ANGLE);
    fake.textChanges.fire({ document });
    vi.advanceTimersByTime(249);
    expect(collection().set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(collection().set).toHaveBeenCalledOnce();
    expect(document.getText).toHaveBeenCalledOnce();
    expect(problems(document)).toHaveLength(1);
  });

  it('clears diagnostics, pending timers and the cache on close', () => {
    vi.useFakeTimers();
    const document = textDocument('/dir/a.ies', BAD_ANGLE);
    fake.opens.fire(document);
    fake.textChanges.fire({ document });
    fake.closes.fire(document);
    expect(collection().delete).toHaveBeenCalledWith(document.uri);
    expect(problems(document)).toBeUndefined();
    vi.advanceTimersByTime(1000);
    expect(problems(document)).toBeUndefined();
    // Reopening at the same version parses again because close dropped the cache entry.
    fake.opens.fire(document);
    expect(document.getText).toHaveBeenCalledTimes(2);
  });

  it('cancels pending validation when disposed', () => {
    vi.useFakeTimers();
    fake.textChanges.fire({ document: textDocument('/dir/a.ies', BAD_ANGLE) });
    for (const subscription of subscriptions) subscription.dispose();
    vi.advanceTimersByTime(1000);
    expect(collection().set).not.toHaveBeenCalled();
  });

  it('honors the validation settings', () => {
    const document = textDocument('/dir/a.ies', VALID.replace('[TESTLAB] l\n', ''));
    workspace.textDocuments = [document];
    fake.opens.fire(document);
    expect(problems(document)![0]).toMatchObject({ code: 'IES_REQUIRED_METADATA', severity: 1 });
    fake.settings['validation.strict'] = true;
    configure();
    expect(problems(document)![0]!.severity).toBe(0);
    fake.settings['validation.enabled'] = false;
    configure(false);
    expect(problems(document)).toHaveLength(1);
    configure();
    expect(problems(document)).toBeUndefined();
  });
});

describe('providers', () => {
  it('caches analysis per document version', () => {
    const document = textDocument('/dir/a.ies', VALID);
    fake.hover!.provideHover(document, { line: 6, character: 0 });
    fake.symbols!.provideDocumentSymbols(document);
    fake.lenses!.provideCodeLenses(document);
    expect(document.getText).toHaveBeenCalledOnce();
    document.version = 2;
    fake.hover!.provideHover(document, { line: 6, character: 0 });
    expect(document.getText).toHaveBeenCalledTimes(2);
  });

  it('explains the token under the cursor unless hover is disabled', () => {
    const document = textDocument('/dir/a.ies', VALID);
    const hover = fake.hover!.provideHover(document, { line: 8, character: 3 })!;
    expect(hover.contents.value).toBe('**Vertical angles**\n\nVertical angle \\#2 \\(degrees\\)');
    expect(hover.range).toEqual(new Range(8, 2, 8, 4));
    expect(fake.hover!.provideHover(document, { line: 8, character: 1 })).toBeUndefined();
    fake.settings['hover.enabled'] = false;
    expect(fake.hover!.provideHover(document, { line: 8, character: 3 })).toBeUndefined();
  });

  it('outlines header fields and collapses arrays', () => {
    const symbols = fake.symbols!.provideDocumentSymbols(textDocument('/dir/a.ies', VALID));
    expect(symbols.find((symbol) => symbol.name === 'Number of lamps')).toMatchObject({
      detail: 'Number of lamps in the luminaire',
      kind: 7,
      range: new Range(6, 0, 6, 1),
    });
    expect(symbols.at(-1)).toMatchObject({ name: 'Candela values (4)', kind: 17, range: new Range(10, 0, 10, 11) });
  });

  it('shows the summary or the error count with a preview lens, unless disabled', () => {
    const valid = textDocument('/dir/a.ies', VALID);
    const [summary, preview] = fake.lenses!.provideCodeLenses(valid);
    expect(summary!.range).toEqual(new Range(0, 0, 0, 0));
    expect(summary!.command).toEqual({ title: 'Φ 213 lm · Imax 100 cd · beam 90.0°/90.0° · 21.3 lm/W', command: '' });
    expect(preview!.command).toEqual({
      title: 'Open Light Preview',
      command: 'ies.openPreview',
      arguments: [valid.uri],
    });
    const [errors] = fake.lenses!.provideCodeLenses(textDocument('/dir/b.ies', BAD_ANGLE));
    expect(errors!.command).toEqual({ title: '1 error', command: 'workbench.actions.view.problems' });
    fake.settings['codeLens.enabled'] = false;
    expect(fake.lenses!.provideCodeLenses(valid)).toEqual([]);
  });

  it('refreshes lenses when the extension settings change', () => {
    const listener = vi.fn();
    fake.lenses!.onDidChangeCodeLenses!(listener);
    configure(false);
    expect(listener).not.toHaveBeenCalled();
    configure();
    expect(listener).toHaveBeenCalledOnce();
  });
});
