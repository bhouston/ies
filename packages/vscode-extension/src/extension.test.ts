import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => import('../test/vscodeMock.js'));
// Conversion commands and language features have their own tests; here we only check that activate() delegates to them.
vi.mock('./convert.js', () => ({ registerConvertCommands: vi.fn() }));
vi.mock('./languageProviders.js', () => ({ registerLanguageFeatures: vi.fn() }));

const { fake, commands, window, uri, event, TabInputCustom } = await import('../test/vscodeMock.js');
type Uri = ReturnType<typeof uri>;
const { activate } = await import('./extension.js');
const { registerConvertCommands } = await import('./convert.js');
const { registerLanguageFeatures } = await import('./languageProviders.js');
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  contributes: {
    commands: { command: string }[];
    customEditors: { viewType: string }[];
    menus: Record<string, { command?: string; submenu?: string; when?: string }[]>;
    submenus: { id: string }[];
  };
};

const IES = 'IESNA:LM-63-2002\nTILT=NONE\n';
let subscriptions: { dispose: unknown }[];
let context: unknown;

beforeEach(() => {
  fake.reset();
  subscriptions = [];
  context = { extensionUri: uri('/ext'), subscriptions };
  activate(context as never);
});

const run = fake.run;

describe('activate', () => {
  it('registers every contributed ies.* command and custom editor, and delegates conversion and language features', () => {
    expect([...fake.commands.keys()].toSorted()).toEqual(
      manifest.contributes.commands
        .map((entry) => entry.command)
        .filter((command) => command.startsWith('ies.'))
        .toSorted(),
    );
    expect(registerConvertCommands).toHaveBeenCalledExactlyOnceWith(context);
    expect(registerLanguageFeatures).toHaveBeenCalledExactlyOnceWith(context);
    expect([...fake.providers.keys()]).toEqual(manifest.contributes.customEditors.map((entry) => entry.viewType));
    expect(fake.providers.get('ies.lightPreview')?.options).toEqual({
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    });
    expect(subscriptions).toHaveLength(fake.commands.size + fake.providers.size);
  });

  it('only references contributed commands, submenus and editors in menus', () => {
    const contributed = new Set(manifest.contributes.commands.map((entry) => entry.command));
    const submenus = new Set(manifest.contributes.submenus.map((entry) => entry.id));
    const editors = new Set(manifest.contributes.customEditors.map((entry) => entry.viewType));
    const entries = Object.values(manifest.contributes.menus).flat();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      if (entry.submenu) expect(submenus, entry.submenu).toContain(entry.submenu);
      else expect(contributed, entry.command).toContain(entry.command);
      for (const [, id] of entry.when?.matchAll(/activeCustomEditorId\s*[!=]=\s*'([^']+)'/g) ?? [])
        expect(editors, entry.when).toContain(id);
    }
    for (const submenu of submenus) expect(Object.keys(manifest.contributes.menus)).toContain(submenu);
  });

  it('hides ies.openAsText from the Command Palette outside the light preview', () => {
    expect(manifest.contributes.menus.commandPalette).toContainEqual({
      command: 'ies.openAsText',
      when: "activeCustomEditorId == 'ies.lightPreview'",
    });
  });
});

describe('ies.openPreview', () => {
  it('opens the given URI in the light preview', async () => {
    const target = uri('/a.ies');
    await run('ies.openPreview', target);
    expect(commands.executeCommand).toHaveBeenCalledWith('vscode.openWith', target, 'ies.lightPreview');
  });
  it('falls back to the active text editor', async () => {
    const target = uri('/b.ldt');
    window.activeTextEditor = { document: { uri: target } };
    await run('ies.openPreview');
    expect(commands.executeCommand).toHaveBeenCalledWith('vscode.openWith', target, 'ies.lightPreview');
  });
  it('explains what to do when no file is open', async () => {
    await run('ies.openPreview');
    expect(commands.executeCommand).not.toHaveBeenCalled();
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Open an IES or LDT file to preview its lighting distribution.',
    );
  });
});

describe('ies.openAsText', () => {
  it('reopens the given URI in the default editor', async () => {
    const target = uri('/a.ies');
    await run('ies.openAsText', target);
    expect(commands.executeCommand).toHaveBeenCalledWith('vscode.openWith', target, 'default');
  });
  it('falls back to the active custom editor tab', async () => {
    const target = uri('/b.ldt');
    window.tabGroups.activeTabGroup.activeTab = { input: new TabInputCustom(target) };
    await run('ies.openAsText');
    expect(commands.executeCommand).toHaveBeenCalledWith('vscode.openWith', target, 'default');
  });
  it('does nothing without a URI or custom editor tab', async () => {
    window.tabGroups.activeTabGroup.activeTab = { input: { uri: uri('/c.ies') } };
    await run('ies.openAsText');
    window.tabGroups.activeTabGroup.activeTab = undefined;
    await run('ies.openAsText');
    expect(commands.executeCommand).not.toHaveBeenCalled();
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
  const { provider } = fake.providers.get('ies.lightPreview') as {
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
    fake.textChanges.fire({ document: { uri: uri('/dir/other.ies') } });
    expect(postMessage).toHaveBeenCalledTimes(1);
    fake.textChanges.fire({ document });
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
    const listeners = [...messages.disposables, ...viewState.disposables, ...fake.textChanges.disposables];
    expect(listeners).toHaveLength(3);
    for (const listener of listeners) expect(listener.dispose).not.toHaveBeenCalled();
    disposed.fire();
    for (const listener of listeners) expect(listener.dispose).toHaveBeenCalledOnce();
  });
});
