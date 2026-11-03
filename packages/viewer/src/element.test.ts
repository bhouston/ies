import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { iesSource } from '../../core/test/iesSource.js';
import { ldtSource } from '../test/photometryFixtures.js';

// Replace only the GPU boundary. These tests exercise the real element/source loader and parser;
// they make no claim about renderer output or hardware quality.
const mocks = vi.hoisted(() => ({ createLightViewer: vi.fn() }));
vi.mock('./viewer.js', () => ({ createLightViewer: mocks.createLightViewer }));

class HostElement extends EventTarget {
  isConnected = true;
  shadowRoot?: ReturnType<typeof node>;
  attributes = new Map<string, string>();
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
    (this as unknown as { attributeChangedCallback?(name: string): void }).attributeChangedCallback?.(name);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
    (this as unknown as { attributeChangedCallback?(name: string): void }).attributeChangedCallback?.(name);
  }
  attachShadow() {
    this.shadowRoot = node();
    return this.shadowRoot;
  }
}
function node() {
  return { textContent: '', className: '', setAttribute() {}, append() {} };
}
function globals() {
  vi.stubGlobal('HTMLElement', HostElement);
  vi.stubGlobal('document', { createElement: () => node() });
  vi.stubGlobal('customElements', { get: () => undefined, define() {} });
}
let Element: typeof import('./element.js').LightViewerElement;
const controllers: { setDocument: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[] = [];
const elements: InstanceType<typeof import('./element.js').LightViewerElement>[] = [];
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
beforeAll(async () => {
  globals();
  Element = (await import('./element.js')).LightViewerElement;
});
beforeEach(() => {
  globals();
  controllers.length = 0;
  mocks.createLightViewer.mockImplementation(() => {
    const controller = { setDocument: vi.fn(), setExposure: vi.fn(), dispose: vi.fn() };
    controllers.push(controller);
    return controller;
  });
});
afterEach(() => {
  for (const host of elements.splice(0)) host.disconnectedCallback();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
afterAll(() => vi.unstubAllGlobals());
function element() {
  const value = new Element();
  elements.push(value);
  return value;
}

describe('light-viewer source lifecycle without constructing a GPU renderer', () => {
  it('loads LDT and preserves the legacy profile plus document/source-format event fields', async () => {
    const viewer = element();
    const loads: unknown[] = [];
    viewer.addEventListener('load', (event) => {
      if (event instanceof CustomEvent) loads.push(event.detail);
    });
    viewer.photometryText = ldtSource();
    viewer.connectedCallback();
    await flush();
    expect(controllers[0]!.setDocument).toHaveBeenCalledOnce();
    expect(loads).toEqual([
      expect.objectContaining({
        sourceFormat: 'ldt',
        profile: expect.objectContaining({ photometricType: 1 }),
        document: expect.objectContaining({ sourceFormat: 'ldt' }),
      }),
    ]);
    expect(viewer.iesText).toBe(viewer.photometryText);
    expect(viewer.data).toBe(viewer.photometryText);
  });
  it('aborts an old URL and emits no stale load after a raw-source replacement', async () => {
    let complete!: (response: Response) => void;
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', (_url: string, init: { signal: AbortSignal }) => {
      signal = init.signal;
      return new Promise<Response>((resolve) => {
        complete = resolve;
      });
    });
    const viewer = element();
    viewer.setAttribute('src', '/slow.ies');
    viewer.connectedCallback();
    await flush();
    viewer.data = ldtSource();
    await flush();
    complete(new Response(iesSource()));
    await flush();
    expect(signal?.aborted).toBe(true);
    expect(controllers[0]!.setDocument).toHaveBeenCalledOnce();
    expect(controllers[0]!.setDocument.mock.calls[0]![0].sourceFormat).toBe('ldt');
  });
  it('cancels source loading and disposes on disconnect, then recreates the viewer on reconnect', async () => {
    const viewer = element();
    viewer.iesText = iesSource();
    viewer.connectedCallback();
    await flush();
    viewer.disconnectedCallback();
    expect(controllers[0]!.dispose).toHaveBeenCalledOnce();
    viewer.connectedCallback();
    await flush();
    expect(controllers).toHaveLength(2);
    expect(controllers[1]!.setDocument).toHaveBeenCalledOnce();
  });
  it('supports explicit lamp-set attributes and surfaces invalid selections', async () => {
    const viewer = element();
    const errors: string[] = [];
    viewer.addEventListener('error', (event) => {
      if (event instanceof CustomEvent) errors.push(event.detail.message);
    });
    viewer.setAttribute('format', 'ldt');
    viewer.setAttribute('lamp-set-index', '1');
    viewer.data = ldtSource({ alternatives: true });
    viewer.connectedCallback();
    await flush();
    expect(controllers[0]!.setDocument.mock.calls[0]![0].selectedLampSetIndex).toBe(1);
    viewer.setAttribute('lamp-set-index', '-1');
    await flush();
    expect(errors).toEqual([expect.stringContaining('nonnegative integer')]);
  });
});
