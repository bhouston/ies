// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iesSource } from '../../../core/test/iesSource.js';
import { resolveViewerSettings, type ViewerSettings } from '../settings.js';
const mocks = vi.hoisted(() => ({ createLightViewer: vi.fn() }));
// Only the GPU boundary is replaced; the React component and source loader run for real.
vi.mock('../viewer.js', () => ({ createLightViewer: mocks.createLightViewer }));
import { LightViewer, type LightViewerHandle, type LightViewerProps } from './index.js';

let root: Root | undefined;
let lost = false;
const controllers: {
  setDocument: ReturnType<typeof vi.fn>;
  capture: ReturnType<typeof vi.fn>;
  canvas: HTMLCanvasElement;
}[] = [];
beforeEach(() => {
  lost = false;
  controllers.length = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.createLightViewer.mockImplementation(() => {
    let settings = resolveViewerSettings({});
    const canvas = document.createElement('canvas');
    const controller = {
      canvas,
      clear: vi.fn(),
      setDocument: vi.fn(),
      setSettings: vi.fn((patch: Partial<ViewerSettings>) => (settings = resolveViewerSettings(patch, settings))),
      getSettings: () => ({ ...settings }),
      dispose: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      renderer: { domElement: canvas, getContext: () => ({ isContextLost: () => lost }) },
      capture: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
    };
    controllers.push(controller);
    return controller;
  });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function render(props: LightViewerProps) {
  const ref = createRef<LightViewerHandle>();
  if (!root) {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }
  act(() => root!.render(<LightViewer ref={ref} {...props} />));
  return ref.current!;
}
const flush = () =>
  act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });

describe('LightViewer ref handle', () => {
  it('resolves an empty viewer and captures with the given options', async () => {
    const viewer = render({});
    await viewer.whenReady();
    const blob = await viewer.toBlob({ type: 'image/webp', width: 64, height: 32 });
    expect(blob.type).toBe('image/png');
    expect(controllers[0]!.capture).toHaveBeenCalledWith({ type: 'image/webp', width: 64, height: 32 });
  });
  it('follows source changes and resolves after the latest one renders', async () => {
    const resolvers: ((value: unknown) => void)[] = [];
    vi.stubGlobal('fetch', () => new Promise((resolve) => resolvers.push(resolve)));
    const viewer = render({ src: '/a.ies' });
    const ready = viewer.whenReady();
    let done = false;
    void ready.then(() => (done = true));
    await flush();
    render({ src: '/b.ies' });
    await flush();
    resolvers[0]!({ ok: true, text: async () => iesSource() });
    await flush();
    expect(done).toBe(false);
    resolvers[1]!({ ok: true, text: async () => iesSource() });
    await ready;
    expect(controllers[0]!.setDocument).toHaveBeenCalledOnce();
  });
  it.each([
    ['network', () => vi.stubGlobal('fetch', async () => ({ ok: false, status: 500 })), 'HTTP 500'],
    ['parse', () => vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => 'not photometry' })), ''],
  ])('rejects %s failures and capture with them', async (_name, setup, message) => {
    setup();
    const viewer = render({ src: '/x.ies', onError: () => {} });
    await expect(viewer.whenReady()).rejects.toThrow(message);
    await expect(viewer.toBlob()).rejects.toThrow(message);
    expect(controllers[0]!.capture).not.toHaveBeenCalled();
  });
  it('rejects unsupported types and context loss', async () => {
    const viewer = render({ text: iesSource() });
    await viewer.whenReady();
    controllers[0]!.setDocument.mockImplementationOnce(() => {
      throw new Error('Type C photometry only');
    });
    render({ text: iesSource(), format: 'ies', onError: () => {} });
    await expect(viewer.whenReady()).rejects.toThrow('Type C');
    lost = true;
    render({ text: iesSource() });
    await expect(viewer.whenReady()).rejects.toThrow('context was lost');
    lost = false;
    render({ text: iesSource(), format: 'ies' });
    const pending = viewer.whenReady();
    controllers[0]!.canvas.dispatchEvent(new Event('webglcontextlost'));
    await expect(pending).rejects.toThrow('context was lost');
  });
  it('rejects a failed GPU start and an unmount during loading', async () => {
    mocks.createLightViewer.mockImplementationOnce(() => {
      throw new Error('no WebGL2');
    });
    await expect(render({ onError: () => {} }).whenReady()).rejects.toThrow('no WebGL2');
    await act(async () => root!.unmount());
    root = undefined;
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    const viewer = render({ src: '/slow.ies' });
    const ready = expect(viewer.whenReady()).rejects.toThrow('disconnected');
    await act(async () => root!.unmount());
    root = undefined;
    await ready;
    await expect(viewer.whenReady()).rejects.toThrow('not connected');
  });
});
