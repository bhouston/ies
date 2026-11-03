import * as vscode from 'vscode';
import type { PhotometrySourceDescription } from '@ies-tools/core';
import { analyze, fieldAt, hoverMarkdown, lensSummary, outline, toProblems, type Span } from './languageFeatures.js';

/** Works whether or not the `ies`/`eulumdat` language IDs are registered for a file. */
const selector: vscode.DocumentSelector = [
  { language: 'ies' },
  { language: 'eulumdat' },
  { pattern: '**/*.{ies,IES,ldt,LDT}' },
];
const severities = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
};
const toRange = (span: Span) => new vscode.Range(span.startLine, span.startCharacter, span.endLine, span.endCharacter);
const setting = (name: string, fallback: boolean) =>
  vscode.workspace.getConfiguration('iesTools').get<boolean>(name, fallback);

/** Problems, hover, outline and CodeLens for photometric text documents. Read-only; safe in untrusted workspaces. */
export function registerLanguageFeatures(context: vscode.ExtensionContext): void {
  const cache = new Map<string, { version: number; result: PhotometrySourceDescription }>();
  const analysis = (document: vscode.TextDocument): PhotometrySourceDescription => {
    const key = document.uri.toString();
    const cached = cache.get(key);
    if (cached?.version === document.version) return cached.result;
    const result = analyze(document.getText(), document.uri.path, document.languageId);
    cache.set(key, { version: document.version, result });
    return result;
  };
  const matches = (document: vscode.TextDocument) => vscode.languages.match(selector, document) > 0;

  const collection = vscode.languages.createDiagnosticCollection('ies-tools');
  const validate = (document: vscode.TextDocument): void => {
    if (!matches(document)) return;
    if (!setting('validation.enabled', true)) {
      collection.delete(document.uri);
      return;
    }
    collection.set(
      document.uri,
      toProblems(analysis(document).diagnostics, setting('validation.strict', false)).map((problem) => {
        const diagnostic = new vscode.Diagnostic(
          problem.span ? toRange(problem.span) : document.lineAt(0).range,
          problem.message,
          severities[problem.severity],
        );
        diagnostic.source = 'ies-tools';
        diagnostic.code = problem.code;
        return diagnostic;
      }),
    );
  };
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const lensesChanged = new vscode.EventEmitter<void>();

  context.subscriptions.push(
    collection,
    lensesChanged,
    vscode.workspace.onDidOpenTextDocument(validate),
    vscode.workspace.onDidChangeTextDocument(({ document }) => {
      const key = document.uri.toString();
      clearTimeout(timers.get(key));
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          validate(document);
        }, 250),
      );
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      const key = document.uri.toString();
      clearTimeout(timers.get(key));
      timers.delete(key);
      cache.delete(key);
      collection.delete(document.uri);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('iesTools')) return;
      vscode.workspace.textDocuments.forEach(validate);
      lensesChanged.fire();
    }),
    { dispose: () => timers.forEach(clearTimeout) },
    vscode.languages.registerHoverProvider(selector, {
      provideHover(document, position) {
        if (!setting('hover.enabled', true)) return undefined;
        const field = fieldAt(analysis(document).fields, position.line, position.character);
        if (!field) return undefined;
        return new vscode.Hover(
          new vscode.MarkdownString(hoverMarkdown(field)),
          new vscode.Range(field.line, field.start, field.line, field.end),
        );
      },
    }),
    vscode.languages.registerDocumentSymbolProvider(selector, {
      provideDocumentSymbols(document) {
        return outline(analysis(document).fields).map((entry) => {
          const range = toRange(entry.span);
          return new vscode.DocumentSymbol(
            entry.name,
            entry.detail,
            entry.array ? vscode.SymbolKind.Array : vscode.SymbolKind.Field,
            range,
            range,
          );
        });
      },
    }),
    vscode.languages.registerCodeLensProvider(selector, {
      onDidChangeCodeLenses: lensesChanged.event,
      provideCodeLenses(document) {
        if (!setting('codeLens.enabled', true)) return [];
        const range = new vscode.Range(0, 0, 0, 0);
        const summary = lensSummary(analysis(document));
        return [
          new vscode.CodeLens(range, {
            title: summary.title,
            command: summary.problems ? 'workbench.actions.view.problems' : '',
          }),
          new vscode.CodeLens(range, {
            title: 'Open Light Preview',
            command: 'ies.openPreview',
            arguments: [document.uri],
          }),
        ];
      },
    }),
  );
  vscode.workspace.textDocuments.forEach(validate);
}
