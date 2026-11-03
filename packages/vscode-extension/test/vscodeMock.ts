// Shared in-memory stand-in for the `vscode` module. Use in a test file with:
//   vi.mock('vscode', () => import('../test/vscodeMock.js'));
//   import { fake, window, workspace } from '../test/vscodeMock.js';
// and call `fake.reset()` in beforeEach.
import { vi } from 'vitest';

type Listener = (value?: unknown) => void;

/** Fake event registration: records listeners and returns disposable spies. */
export function event() {
  const listeners: Listener[] = [];
  const disposables: { dispose: ReturnType<typeof vi.fn> }[] = [];
  const subscribe = vi.fn((listener: Listener) => {
    listeners.push(listener);
    const disposable = { dispose: vi.fn() };
    disposables.push(disposable);
    return disposable;
  });
  return { subscribe, fire: (value?: unknown) => listeners.forEach((listener) => listener(value)), disposables };
}

export class Uri {
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
  static joinPath(base: Uri, ...parts: string[]) {
    return new Uri([base.path, ...parts].join('/'));
  }
}
export const uri = (path: string) => new Uri(path);

export class TabInputCustom {
  readonly uri: Uri;
  constructor(target: Uri) {
    this.uri = target;
  }
}
export class TabInputText {
  readonly uri: Uri;
  constructor(target: Uri) {
    this.uri = target;
  }
}
export const FileType = { File: 1, Directory: 2, SymbolicLink: 64 };

const missing = (path: string) => Object.assign(new Error(`ENOENT ${path}`), { code: 'FileNotFound' });

/** Test-side state behind the fake API. */
export const fake = {
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  providers: new Map<string, { provider: unknown; options: unknown }>(),
  files: new Map<string, string>(),
  dirs: new Map<string, [string, number][]>(),
  settings: {} as Record<string, unknown>,
  channel: { appendLine: vi.fn(), show: vi.fn() },
  textChanges: event(),
  run: (id: string, ...args: unknown[]) => fake.commands.get(id)?.(...args),
  reset() {
    vi.clearAllMocks();
    for (const map of [fake.commands, fake.providers, fake.files, fake.dirs]) map.clear();
    for (const key of Object.keys(fake.settings)) delete fake.settings[key];
    fake.textChanges = event();
    workspace.textDocuments = [];
    window.tabGroups.activeTabGroup.activeTab = undefined;
    window.activeTextEditor = undefined;
  },
};

export const commands = {
  registerCommand: vi.fn((id: string, run: (...args: unknown[]) => unknown) => {
    fake.commands.set(id, run);
    return { dispose: vi.fn() };
  }),
  executeCommand: vi.fn(async (..._args: unknown[]) => undefined),
};

export const window = {
  registerCustomEditorProvider: vi.fn((viewType: string, provider: unknown, options: unknown) => {
    fake.providers.set(viewType, { provider, options });
    return { dispose: vi.fn() };
  }),
  showQuickPick: vi.fn(),
  showWarningMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showOpenDialog: vi.fn(),
  createOutputChannel: vi.fn((_name: string) => fake.channel),
  tabGroups: { activeTabGroup: { activeTab: undefined as { input: unknown } | undefined } },
  activeTextEditor: undefined as { document: { uri: Uri } } | undefined,
};

export const workspace = {
  textDocuments: [] as { uri: Uri; getText(): string }[],
  onDidChangeTextDocument: (listener: Listener) => fake.textChanges.subscribe(listener),
  getConfiguration: vi.fn((_section?: string, _scope?: unknown) => ({
    get: <T>(key: string, fallback: T) => (fake.settings[key] as T | undefined) ?? fallback,
  })),
  fs: {
    stat: vi.fn(async (target: Uri) => {
      if (!fake.files.has(target.path)) throw missing(target.path);
      return { type: FileType.File };
    }),
    readFile: vi.fn(async (target: Uri) => {
      const text = fake.files.get(target.path);
      if (text === undefined) throw missing(target.path);
      return new TextEncoder().encode(text);
    }),
    writeFile: vi.fn(async (target: Uri, data: Uint8Array) => {
      fake.files.set(target.path, new TextDecoder().decode(data));
    }),
    readDirectory: vi.fn(async (target: Uri) => fake.dirs.get(target.path) ?? []),
  },
};
