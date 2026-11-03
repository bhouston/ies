import * as vscode from 'vscode';
import { inputFormat } from '@ies-tools/core';
import {
  collectPhotometricFiles,
  convertNative,
  isPhotometricPath,
  lampSetChoices,
  parseSource,
  resolveTarget,
  runBatch,
  targetPath,
  type ExistingChoice,
  type OverwritePolicy,
  type TargetFormat,
} from './conversion.js';

const TARGETS: { target: TargetFormat; label: string }[] = [
  { target: 'ies', label: 'IES (LM-63)' },
  { target: 'ldt', label: 'EULUMDAT (.ldt)' },
  { target: 'json', label: 'JSON' },
];

type Outcome = { status: 'converted'; uri: vscode.Uri; warnings: number } | { status: 'skipped' };

const baseName = (uri: vscode.Uri): string => uri.path.split('/').at(-1) ?? uri.path;

const exists = (uri: vscode.Uri): Promise<boolean> =>
  Promise.resolve(vscode.workspace.fs.stat(uri)).then(
    () => true,
    () => false,
  );

async function ask(uri: vscode.Uri): Promise<ExistingChoice | undefined> {
  const choice = await vscode.window.showWarningMessage(
    `${baseName(uri)} already exists. Overwrite it?`,
    { modal: true },
    'Overwrite',
    'Keep Both',
    'Skip',
  );
  return choice === 'Overwrite' ? 'overwrite' : choice === 'Keep Both' ? 'keepBoth' : 'skip';
}

function activeUri(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText) return input.uri;
  return vscode.window.activeTextEditor?.document.uri;
}

export function registerConvertCommands(context: vscode.ExtensionContext): void {
  let channel: vscode.OutputChannel | undefined;
  const log = (line: string): void => {
    channel ??= vscode.window.createOutputChannel('IES Tools');
    channel.appendLine(line);
  };

  async function convertFile(uri: vscode.Uri, target: TargetFormat): Promise<Outcome> {
    // Prefer unsaved editor text so the output matches what the user sees.
    const text =
      vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString())?.getText() ??
      new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    if (inputFormat(text, uri.path) === target) {
      log(`${uri.fsPath}: already ${target.toUpperCase()}, skipped`);
      return { status: 'skipped' };
    }
    const native = parseSource(text, uri.path);
    const labels = lampSetChoices(native, target);
    let lampSetIndex: number | undefined;
    if (labels) {
      const pick = await vscode.window.showQuickPick(
        labels.map((label, index) => ({ label, index })),
        { title: `Choose a lamp configuration for ${baseName(uri)}`, ignoreFocusOut: true },
      );
      if (!pick) {
        log(`${uri.fsPath}: no lamp configuration chosen, skipped`);
        return { status: 'skipped' };
      }
      lampSetIndex = pick.index;
    }
    const result = convertNative(native, target, lampSetIndex);
    const policy = vscode.workspace.getConfiguration('iesTools.convert', uri).get<OverwritePolicy>('overwrite', 'ask');
    const output = await resolveTarget(
      targetPath(uri.path, target),
      policy,
      (path) => exists(uri.with({ path })),
      (path) => ask(uri.with({ path })),
    );
    if (output === undefined) {
      log(`${uri.fsPath}: target exists, skipped`);
      return { status: 'skipped' };
    }
    const outputUri = uri.with({ path: output });
    await vscode.workspace.fs.writeFile(outputUri, new TextEncoder().encode(result.value));
    log(`${uri.fsPath} -> ${outputUri.fsPath}`);
    for (const warning of result.warnings) log(`  warning [${warning.code}]: ${warning.message}`);
    return { status: 'converted', uri: outputUri, warnings: result.warnings.length };
  }

  async function convertAll(uris: vscode.Uri[], target: TargetFormat): Promise<void> {
    if (!uris.length) {
      void vscode.window.showInformationMessage('Select or open an IES or LDT file to convert.');
      return;
    }
    const { results, failures } = await runBatch(uris, (uri) => convertFile(uri, target));
    for (const { item, error } of failures) {
      const message = error instanceof Error ? error.message : String(error);
      log(`${item.fsPath}: error: ${message}`);
      void vscode.window.showErrorMessage(`Could not convert ${baseName(item)}: ${message}`);
    }
    const converted = results.filter((result) => result.status === 'converted');
    const warnings = converted.reduce((sum, result) => sum + result.warnings, 0);
    const actions = converted.length === 1 ? ['Open', 'Show Log'] : ['Show Log'];
    const action = await vscode.window.showInformationMessage(
      `Converted ${converted.length} file(s), ${warnings} warning(s)`,
      ...actions,
    );
    if (action === 'Open') await vscode.commands.executeCommand('vscode.open', converted[0]!.uri);
    if (action === 'Show Log') channel?.show();
  }

  for (const { target } of TARGETS) {
    const id = `iesTools.convertTo${target.toUpperCase()}`;
    context.subscriptions.push(
      vscode.commands.registerCommand(id, (uri?: vscode.Uri, selected?: vscode.Uri[]) => {
        const uris = selected?.length ? selected : [uri ?? activeUri()].filter((value) => value !== undefined);
        return convertAll(
          uris.filter((value) => isPhotometricPath(value.path)),
          target,
        );
      }),
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('iesTools.convertFolder', async (uri?: vscode.Uri) => {
      const folder =
        uri ?? (await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false }))?.[0];
      if (!folder) return;
      const pick = await vscode.window.showQuickPick(
        TARGETS.map(({ target, label }) => ({ label: `Convert to ${label}`, target })),
        { title: `Convert photometric files in ${baseName(folder)}` },
      );
      if (!pick) return;
      const depth = await vscode.window.showQuickPick(['This folder only', 'Include subfolders'], {
        title: 'Which files?',
      });
      if (!depth) return;
      const paths = await collectPhotometricFiles(
        folder.path,
        async (path) =>
          (await vscode.workspace.fs.readDirectory(folder.with({ path }))).map(([name, type]) => [
            name,
            type === vscode.FileType.Directory,
          ]),
        depth === 'Include subfolders',
      );
      await convertAll(
        paths.map((path) => folder.with({ path })),
        pick.target,
      );
    }),
  );
}
