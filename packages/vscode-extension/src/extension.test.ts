import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (value?: unknown) => void;
type Uri = { path: string; toString(): string };
const uri = (path: string): Uri => ({ path, toString: () => `file://${path}` });

/** Fake event registration: records the listener and returns a disposable spy. */
const event = () => {
  const listeners: Listener[] = [];
  const disposables: { dispose: ReturnType<typeof vi.fn> }[] = [];
  const subscribe = vi.fn((listener: Listener) => {
    listeners.push(listener);
    const disposable = { dispose: vi.fn() };
    disposables.push(disposable);
    return disposable;
  });
  return { subscribe, fire: (value?: unknown) => listeners.forEach((listener) => listener(value)), disposables };
};

const vscode = vi.hoisted(() => {
  class TabInputCustom {
    readonly uri: unknown;
    constructor(target: unknown) {
      this.uri = target;
    }
  }
  return {
    commands: new Map<string, (...args: unknown[]) => unknown>(),
    providers: new Map<string, { provider: unknown; options: unknown }>(),
    executeCommand: vi.fn(async () => undefined),
    showInformationMessage: vi.fn(),
    textChanges: undefined as unknown as { subscribe: unknown; fire: Listener; disposables: { dispose: unknown }[] },
    window: { activeTextEditor: undefined as unknown, activeTab: undefined as unknown },
    TabInputCustom,
  };
});

vi.mock('vscode', () => ({
  Uri: { joinPath: (base: Uri, ...parts: string[]) => uri([base.path, ...parts].join('/')) },
  TabInputCustom: vscode.TabInputCustom,
  commands: {
    registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
      vscode.commands.set(id, handler);
      return { dispose: vi.fn() };
    },
    executeCommand: vscode.executeCommand,
  },
  window: {
    registerCustomEditorProvider: (viewType: string, provider: unknown, options: unknown) => {
      vscode.providers.set(viewType, { provider, options });
      return { dispose: vi.fn() };
    },
    showInformationMessage: vscode.showInformationMessage,
    get activeTextEditor() {
      return vscode.window.activeTextEditor;
    },
    tabGroups: {
      activeTabGroup: {
        get activeTab() {
          return vscode.window.activeTab;
        },
      },
    },
  },
  workspace: {
    onDidChangeTextDocument: (listener: Listener) =>
      (vscode.textChanges.subscribe as (listener: Listener) => unknown)(listener),
  },
}));

const { activate } = await import('./extension.js');
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  contributes: {
    commands: { command: string }[];
    customEditors: { viewType: string }[];
    menus: Record<string, { command: string; when?: string }[]>;
  };
};

const IES = 'IESNA:LM-63-2002\nTILT=NONE\n';
let subscriptions: { dispose: unknown }[];

beforeEach(() => {
  vscode.commands.clear();
  vscode.providers.clear();
  vscode.executeCommand.mockClear();
  vscode.showInformationMessage.mockClear();
  vscode.textChanges = event();
  vscode.window.activeTextEditor = undefined;
  vscode.window.activeTab = undefined;
  subscriptions = [];
  activate({ extensionUri: uri('/ext'), subscriptions } as never);
});

const run = (command: string, ...args: unknown[]) => vscode.commands.get(command)?.(...args);

describe('activate', () => {
  it('registers every contributed command and custom editor', () => {
    expect([...vscode.commands.keys()].toSorted()).toEqual(
      manifest.contributes.commands.map((entry) => entry.command).toSorted(),
    );
    expect([...vscode.providers.keys()]).toEqual(manifest.contributes.customEditors.map((entry) => entry.viewType));
    expect(vscode.providers.get('ies.lightPreview')?.options).toEqual({
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    });
    expect(subscriptions).toHaveLength(vscode.commands.size + vscode.providers.size);
  });

  it('only references contributed commands and editors in menus', () => {
    const commands = new Set(manifest.contributes.commands.map((entry) => entry.command));
    const editors = new Set(manifest.contributes.customEditors.map((entry) => entry.viewType));
    const entries = Object.values(manifest.contributes.menus).flat();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(commands, entry.command).toContain(entry.command);
      for (const [, id] of entry.when?.matchAll(/activeCustomEditorId\s*[!=]=\s*'([^']+)'/g) ?? [])
        expect(editors, entry.when).toContain(id);
    }
  });
});

describe('ies.openPreview', () => {
  it('opens the given URI in the light preview', async () => {
    const target = uri('/a.ies');
    await run('ies.openPreview', target);
    expect(vscode.executeCommand).toHaveBeenCalledWith('vscode.openWith', target, 'ies.lightPreview');
  });
  it('falls back to the active text editor', async () => {
    const target = uri('/b.ldt');
    vscode.window.activeTextEditor = { document: { uri: target } };
    await run('ies.openPreview');
    expect(vscode.executeCommand).toHaveBeenCalledWith('vscode.openWith', target, 'ies.lightPreview');
  });
  it('explains what to do when no file is open', async () => {
    await run('ies.openPreview');
    expect(vscode.executeCommand).not.toHaveBeenCalled();
    expect(vscode.showInformationMessage).toHaveBeenCalledWith(
      'Open an IES or LDT file to preview its lighting distribution.',
    );
  });
});

describe('ies.openAsText', () => {
  it('reopens the given URI in the default editor', async () => {
    const target = uri('/a.ies');
    await run('ies.openAsText', target);
    expect(vscode.executeCommand).toHaveBeenCalledWith('vscode.openWith', target, 'default');
  });
  it('falls back to the active custom editor tab', async () => {
    const target = uri('/b.ldt');
    vscode.window.activeTab = { input: new vscode.TabInputCustom(target) };
    await run('ies.openAsText');
    expect(vscode.executeCommand).toHaveBeenCalledWith('vscode.openWith', target, 'default');
  });
  it('does nothing without a URI or custom editor tab', async () => {
    vscode.window.activeTab = { input: { uri: uri('/c.ies') } };
    await run('ies.openAsText');
    vscode.window.activeTab = undefined;
    await run('ies.openAsText');
    expect(vscode.executeCommand).not.toHaveBeenCalled();
  });
});

const resolve = async (path: string, text = IES) => {
  const document = { uri: uri(path), getText: vi.fn(() => text) };
  const messages = event();
  const viewState = event();
  const disposed = event();
  const postMessage = vi.fn(async () => true);
  const panel = {
    visible: true,
    webview: {
      options: undefined as unknown,
      html: '',
      cspSource: 'vscode-resource:',
      asWebviewUri: (value: Uri) => uri(`/webview${value.path}`),
      postMessage,
      onDidReceiveMessage: messages.subscribe,
    },
    onDidChangeViewState: viewState.subscribe,
    onDidDispose: disposed.subscribe,
  };
  const { provider } = vscode.providers.get('ies.lightPreview') as {
    provider: { resolveCustomTextEditor(document: unknown, panel: unknown): Promise<void> };
  };
  await provider.resolveCustomTextEditor(document, panel);
  return { document, panel, postMessage, messages, viewState, disposed };
};

describe('light preview provider', () => {
  it('configures the webview with local media only', async () => {
    const { panel, postMessage } = await resolve('/dir/a.ies');
    const options = panel.webview.options as { enableScripts: boolean; localResourceRoots: Uri[] };
    expect(options.enableScripts).toBe(true);
    expect(options.localResourceRoots.map((root) => root.path)).toEqual(['/ext/media']);
    expect(panel.webview.html).toContain('src="file:///webview/ext/media/preview.js"');
    expect(panel.webview.html).toContain('file:///webview/ext/media/preview.css');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('posts updates on ready, matching text changes and becoming visible', async () => {
    const { document, panel, postMessage, messages, viewState } = await resolve('/dir/a.ies');
    messages.fire({ type: 'other' });
    expect(postMessage).not.toHaveBeenCalled();
    messages.fire({ type: 'ready' });
    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'update',
      text: IES,
      format: 'ies',
      lampSetLabels: [],
      fileName: 'a.ies',
    });
    vscode.textChanges.fire({ document: { uri: uri('/dir/other.ies') } });
    expect(postMessage).toHaveBeenCalledTimes(1);
    vscode.textChanges.fire({ document });
    expect(postMessage).toHaveBeenCalledTimes(2);
    panel.visible = false;
    viewState.fire();
    expect(postMessage).toHaveBeenCalledTimes(2);
    panel.visible = true;
    viewState.fire();
    expect(postMessage).toHaveBeenCalledTimes(3);
  });

  it('detects LDT files case-insensitively', async () => {
    const { postMessage, messages } = await resolve('/dir/B.LDT', 'not ldt');
    messages.fire({ type: 'ready' });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ format: 'ldt', fileName: 'B.LDT' }));
  });

  it('disposes its listeners with the panel', async () => {
    const { messages, viewState, disposed } = await resolve('/dir/a.ies');
    const listeners = [...messages.disposables, ...viewState.disposables, ...vscode.textChanges.disposables];
    expect(listeners).toHaveLength(3);
    for (const listener of listeners) expect(listener.dispose).not.toHaveBeenCalled();
    disposed.fire();
    for (const listener of listeners) expect(listener.dispose).toHaveBeenCalledOnce();
  });
});
