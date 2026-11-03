import { readFileSync, readdirSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ldtSource } from '../../viewer/test/photometryFixtures.js';
import { convertNative, parseSource } from './conversion.js';

// In-memory stand-in for the parts of the VS Code API that convert.ts uses.
const h = vi.hoisted(() => {
  class Uri {
    constructor(public path: string) {}
    get fsPath() {
      return this.path;
    }
    toString() {
      return `file://${this.path}`;
    }
    with({ path }: { path: string }) {
      return new Uri(path);
    }
  }
  class TabInputCustom {
    constructor(public uri: Uri) {}
  }
  class TabInputText {
    constructor(public uri: Uri) {}
  }
  const FileType = { File: 1, Directory: 2, SymbolicLink: 64 };
  const files = new Map<string, string>();
  const dirs = new Map<string, [string, number][]>();
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  const settings: { overwrite?: string } = {};
  const channel = { appendLine: vi.fn(), show: vi.fn() };
  const missing = (path: string) => Object.assign(new Error(`ENOENT ${path}`), { code: 'FileNotFound' });
  const vscode = {
    Uri,
    TabInputCustom,
    TabInputText,
    FileType,
    workspace: {
      textDocuments: [] as { uri: Uri; getText(): string }[],
      getConfiguration: vi.fn(() => ({
        get: (key: string, fallback: string) => (key === 'overwrite' ? (settings.overwrite ?? fallback) : fallback),
      })),
      fs: {
        stat: vi.fn(async (uri: Uri) => {
          if (!files.has(uri.path)) throw missing(uri.path);
          return { type: FileType.File };
        }),
        readFile: vi.fn(async (uri: Uri) => {
          const text = files.get(uri.path);
          if (text === undefined) throw missing(uri.path);
          return new TextEncoder().encode(text);
        }),
        writeFile: vi.fn(async (uri: Uri, data: Uint8Array) => {
          files.set(uri.path, new TextDecoder().decode(data));
        }),
        readDirectory: vi.fn(async (uri: Uri) => dirs.get(uri.path) ?? []),
      },
    },
    window: {
      showQuickPick: vi.fn(),
      showWarningMessage: vi.fn(),
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showOpenDialog: vi.fn(),
      createOutputChannel: vi.fn(() => channel),
      tabGroups: { activeTabGroup: { activeTab: undefined as { input: unknown } | undefined } },
      activeTextEditor: undefined as { document: { uri: Uri } } | undefined,
    },
    commands: {
      registerCommand: vi.fn((id: string, run: (...args: unknown[]) => unknown) => {
        commands.set(id, run);
        return { dispose: () => commands.delete(id) };
      }),
      executeCommand: vi.fn(),
    },
  };
  return { vscode, files, dirs, commands, settings, channel, Uri };
});
vi.mock('vscode', () => h.vscode);

const { registerConvertCommands } = await import('./convert.js');
const { vscode, files, dirs, commands, settings, channel, Uri } = h;
const { window } = vscode;

const fixtures = new URL('../../../fixtures/', import.meta.url);
const IES = readFileSync(
  new URL(
    readdirSync(fixtures).find((name) => name.endsWith('.ies'))!,
    fixtures,
  ),
  'utf8',
);
const LDT = ldtSource();
const MULTI = ldtSource({ alternatives: true });
const uri = (path: string) => new Uri(path);
const run = (id: string, ...args: unknown[]) => commands.get(id)!(...args) as Promise<void>;
const logged = () => channel.appendLine.mock.calls.map(([line]) => String(line));
const summary = () => window.showInformationMessage.mock.calls.at(-1);

beforeEach(() => {
  vi.clearAllMocks();
  files.clear();
  dirs.clear();
  commands.clear();
  delete settings.overwrite;
  vscode.workspace.textDocuments = [];
  window.tabGroups.activeTabGroup.activeTab = undefined;
  window.activeTextEditor = undefined;
  registerConvertCommands({ subscriptions: [] } as never);
});

describe('convert commands', () => {
  it('registers every target and the folder command as disposable subscriptions', () => {
    const context = { subscriptions: [] as { dispose(): void }[] };
    registerConvertCommands(context as never);
    expect([...commands.keys()].toSorted()).toEqual([
      'iesTools.convertFolder',
      'iesTools.convertToIES',
      'iesTools.convertToJSON',
      'iesTools.convertToLDT',
    ]);
    expect(context.subscriptions).toHaveLength(4);
  });

  it('converts the clicked file and writes the output next to it', async () => {
    files.set('/w/a.ies', IES);
    await run('iesTools.convertToJSON', uri('/w/a.ies'));
    expect(JSON.parse(files.get('/w/a.json')!)).toMatchObject({ horizontalAngles: expect.any(Array) });
    expect(summary()).toEqual(['Converted 1 file(s), 0 warning(s)', 'Open', 'Show Log']);
    expect(logged()).toContain('/w/a.ies -> /w/a.json');
  });

  it('converts every selected file, ignoring non-photometric selections', async () => {
    files.set('/w/a.ies', IES);
    files.set('/w/b.ldt', LDT);
    await run('iesTools.convertToJSON', uri('/w/a.ies'), [uri('/w/a.ies'), uri('/w/b.ldt'), uri('/w/notes.txt')]);
    expect([...files.keys()].toSorted()).toEqual(['/w/a.ies', '/w/a.json', '/w/b.json', '/w/b.ldt']);
    expect(summary()).toEqual(['Converted 2 file(s), 0 warning(s)', 'Show Log']);
  });

  it('falls back to the active custom editor tab, then the text tab, then the text editor', async () => {
    files.set('/w/custom.ldt', LDT);
    files.set('/w/text.ldt', LDT);
    files.set('/w/editor.ldt', LDT);
    window.tabGroups.activeTabGroup.activeTab = { input: new vscode.TabInputCustom(uri('/w/custom.ldt')) };
    await run('iesTools.convertToJSON');
    window.tabGroups.activeTabGroup.activeTab = { input: new vscode.TabInputText(uri('/w/text.ldt')) };
    await run('iesTools.convertToJSON');
    window.tabGroups.activeTabGroup.activeTab = { input: { webview: true } };
    window.activeTextEditor = { document: { uri: uri('/w/editor.ldt') } };
    await run('iesTools.convertToJSON');
    for (const name of ['custom', 'text', 'editor']) expect(files.has(`/w/${name}.json`)).toBe(true);
  });

  it('converts unsaved editor text instead of the file on disk', async () => {
    files.set('/w/a.ldt', 'stale contents that do not parse');
    vscode.workspace.textDocuments = [{ uri: uri('/w/a.ldt'), getText: () => LDT }];
    await run('iesTools.convertToIES', uri('/w/a.ldt'));
    expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled();
    expect(files.get('/w/a.ies')).toMatch(/^IESNA/);
  });

  it('asks the user to pick a file when nothing is selected or open', async () => {
    await run('iesTools.convertToIES');
    expect(window.showInformationMessage).toHaveBeenCalledWith('Select or open an IES or LDT file to convert.');
    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
  });

  it('skips files already in the target format', async () => {
    files.set('/w/a.ies', IES);
    await run('iesTools.convertToIES', uri('/w/a.ies'));
    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    expect(logged()).toContain('/w/a.ies: already IES, skipped');
    expect(summary()).toEqual(['Converted 0 file(s), 0 warning(s)', 'Show Log']);
  });

  describe('existing targets', () => {
    beforeEach(() => {
      files.set('/w/a.ldt', LDT);
      files.set('/w/a.json', 'old');
      files.set('/w/a (1).json', 'old 1');
    });

    it.each([
      ['Overwrite', '/w/a.json'],
      ['Keep Both', '/w/a (2).json'],
    ])('ask + %s writes %s', async (answer, written) => {
      window.showWarningMessage.mockResolvedValueOnce(answer);
      await run('iesTools.convertToJSON', uri('/w/a.ldt'));
      expect(window.showWarningMessage).toHaveBeenCalledWith(
        'a.json already exists. Overwrite it?',
        { modal: true },
        'Overwrite',
        'Keep Both',
        'Skip',
      );
      expect(files.get(written)).toMatch(/"format": "ldt"/);
    });

    it.each([['Skip'], [undefined]])('ask + %s leaves the target untouched', async (answer) => {
      window.showWarningMessage.mockResolvedValueOnce(answer);
      await run('iesTools.convertToJSON', uri('/w/a.ldt'));
      expect(files.get('/w/a.json')).toBe('old');
      expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
      expect(logged()).toContain('/w/a.ldt: target exists, skipped');
    });

    it('always overwrites without asking', async () => {
      settings.overwrite = 'always';
      await run('iesTools.convertToJSON', uri('/w/a.ldt'));
      expect(window.showWarningMessage).not.toHaveBeenCalled();
      expect(files.get('/w/a.json')).toMatch(/"format": "ldt"/);
    });

    it('never overwrites and never asks', async () => {
      settings.overwrite = 'never';
      await run('iesTools.convertToJSON', uri('/w/a.ldt'));
      expect(window.showWarningMessage).not.toHaveBeenCalled();
      expect(files.get('/w/a.json')).toBe('old');
      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('iesTools.convert', uri('/w/a.ldt'));
    });
  });

  describe('lamp sets', () => {
    beforeEach(() => files.set('/w/multi.ldt', MULTI));

    it('converts the configuration picked in the QuickPick', async () => {
      window.showQuickPick.mockImplementationOnce(async (items: { label: string; index: number }[]) => items[1]);
      await run('iesTools.convertToIES', uri('/w/multi.ldt'));
      const [items, options] = window.showQuickPick.mock.calls[0]!;
      expect(items.map((item: { label: string }) => item.label)).toEqual([
        '1: First configuration · 2000 lm · 20 W',
        '2: Second configuration · 500 lm · 5 W',
      ]);
      expect(options).toMatchObject({ title: 'Choose a lamp configuration for multi.ldt' });
      expect(files.get('/w/multi.ies')).toBe(convertNative(parseSource(MULTI, 'multi.ldt'), 'ies', 1).value);
    });

    it('skips the file when the QuickPick is cancelled', async () => {
      window.showQuickPick.mockResolvedValueOnce(undefined);
      await run('iesTools.convertToIES', uri('/w/multi.ldt'));
      expect(files.has('/w/multi.ies')).toBe(false);
      expect(logged()).toContain('/w/multi.ldt: no lamp configuration chosen, skipped');
    });

    it('does not ask when the target keeps every configuration', async () => {
      await run('iesTools.convertToJSON', uri('/w/multi.ldt'));
      expect(window.showQuickPick).not.toHaveBeenCalled();
      expect(files.has('/w/multi.json')).toBe(true);
    });
  });

  it('logs every conversion warning and counts them in the summary', async () => {
    files.set('/w/a.ies', IES);
    const { warnings } = convertNative(parseSource(IES, 'a.ies'), 'ldt');
    expect(warnings.length).toBeGreaterThan(0);
    await run('iesTools.convertToLDT', uri('/w/a.ies'));
    for (const warning of warnings) expect(logged()).toContain(`  warning [${warning.code}]: ${warning.message}`);
    expect(summary()![0]).toBe(`Converted 1 file(s), ${warnings.length} warning(s)`);
  });

  it('opens the single converted file from the summary', async () => {
    files.set('/w/a.ldt', LDT);
    window.showInformationMessage.mockResolvedValueOnce('Open');
    await run('iesTools.convertToIES', uri('/w/a.ldt'));
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('vscode.open', uri('/w/a.ies'));
    expect(channel.show).not.toHaveBeenCalled();
  });

  it('shows the log from the summary', async () => {
    files.set('/w/a.ldt', LDT);
    window.showInformationMessage.mockResolvedValueOnce('Show Log');
    await run('iesTools.convertToIES', uri('/w/a.ldt'));
    expect(channel.show).toHaveBeenCalled();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  it('reports a failing file without aborting the rest of the batch', async () => {
    files.set('/w/bad.ldt', 'not a eulumdat file');
    files.set('/w/good.ldt', LDT);
    await run('iesTools.convertToJSON', undefined, [uri('/w/missing.ies'), uri('/w/bad.ldt'), uri('/w/good.ldt')]);
    expect(files.has('/w/good.json')).toBe(true);
    expect(window.showErrorMessage).toHaveBeenCalledTimes(2);
    expect(window.showErrorMessage.mock.calls.map(([message]) => message)).toEqual([
      expect.stringMatching(/^Could not convert missing\.ies: ENOENT/),
      expect.stringMatching(/^Could not convert bad\.ldt: /),
    ]);
    expect(logged().filter((line) => line.includes(': error: '))).toHaveLength(2);
    expect(summary()).toEqual(['Converted 1 file(s), 0 warning(s)', 'Open', 'Show Log']);
  });

  it('reports non-Error failures as text', async () => {
    files.set('/w/a.ldt', LDT);
    vscode.workspace.fs.writeFile.mockRejectedValueOnce('disk full');
    await run('iesTools.convertToJSON', uri('/w/a.ldt'));
    expect(window.showErrorMessage).toHaveBeenCalledWith('Could not convert a.ldt: disk full');
  });

  describe('Convert Folder', () => {
    beforeEach(() => {
      const { File, Directory, SymbolicLink } = vscode.FileType;
      dirs.set('/w', [
        ['a.ies', File],
        ['b.LDT', File],
        ['readme.txt', File],
        ['sub', Directory],
        ['.git', Directory],
        ['node_modules', Directory],
        ['link', Directory | SymbolicLink],
      ]);
      dirs.set('/w/sub', [['c.ldt', File]]);
      dirs.set('/w/.git', [['hidden.ldt', File]]);
      dirs.set('/w/node_modules', [['dep.ldt', File]]);
      dirs.set('/w/link', [['linked.ldt', File]]);
      for (const path of ['/w/a.ies', '/w/b.LDT', '/w/sub/c.ldt', '/w/.git/hidden.ldt', '/w/node_modules/dep.ldt'])
        files.set(path, path.endsWith('.ies') ? IES : LDT);
    });
    const choose = (target: string, depth: string) =>
      window.showQuickPick
        .mockImplementationOnce(async (items: { target: string }[]) => items.find((item) => item.target === target))
        .mockResolvedValueOnce(depth);

    it('recurses into subfolders, skipping dot-folders, node_modules, symlinks and same-format files', async () => {
      choose('ies', 'Include subfolders');
      await run('iesTools.convertFolder', uri('/w'));
      const written = vscode.workspace.fs.writeFile.mock.calls.map(([target]) => target.path).toSorted();
      expect(written).toEqual(['/w/b.ies', '/w/sub/c.ies']);
      expect(logged()).toContain('/w/a.ies: already IES, skipped');
      expect(window.showQuickPick.mock.calls[0]![1]).toEqual({ title: 'Convert photometric files in w' });
      expect(summary()![0]).toMatch(/^Converted 2 file\(s\), \d+ warning\(s\)$/);
    });

    it('stays in the top folder when subfolders are excluded', async () => {
      choose('json', 'This folder only');
      await run('iesTools.convertFolder', uri('/w'));
      const written = vscode.workspace.fs.writeFile.mock.calls.map(([target]) => target.path).toSorted();
      expect(written).toEqual(['/w/a.json', '/w/b.json']);
    });

    it('asks for a folder when run from the Command Palette', async () => {
      window.showOpenDialog.mockResolvedValueOnce([uri('/w/sub')]);
      choose('json', 'This folder only');
      await run('iesTools.convertFolder');
      expect(window.showOpenDialog).toHaveBeenCalledWith({ canSelectFolders: true, canSelectFiles: false });
      expect(files.has('/w/sub/c.json')).toBe(true);
    });

    it.each([
      ['the folder picker', () => window.showOpenDialog.mockResolvedValueOnce(undefined), undefined],
      ['the format pick', () => window.showQuickPick.mockResolvedValueOnce(undefined), uri('/w')],
      ['the depth pick', () => choose('json', undefined as never), uri('/w')],
    ])('does nothing when %s is cancelled', async (_, cancel, folder) => {
      cancel();
      await run('iesTools.convertFolder', folder);
      expect(vscode.workspace.fs.readDirectory).not.toHaveBeenCalled();
      expect(window.showInformationMessage).not.toHaveBeenCalled();
    });
  });
});
