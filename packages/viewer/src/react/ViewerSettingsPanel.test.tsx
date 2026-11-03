// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseIES } from 'ies-core';
import { DEFAULT_VIEWER_SETTINGS, resolveViewerSettings, type ViewerSettings } from '../settings.js';
const mocks = vi.hoisted(() => ({ createLightViewer: vi.fn() }));
vi.mock('../viewer.js', () => ({ createLightViewer: mocks.createLightViewer }));
import { LightViewer, ViewerSettingsPanel } from './index.js';
let root: Root | undefined;
const profile = () => parseIES('IESNA:LM-63-2002\nTILT=NONE\n1 -1 1 3 1 1 2 0 0 0\n1 1 10\n0 90 180\n0\n100 20 0\n');
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('shared React viewer controls', () => {
  it('renders accessible semantic controls with shared theme utilities during SSR', () => {
    const html = renderToStaticMarkup(
      <ViewerSettingsPanel
        settings={DEFAULT_VIEWER_SETTINGS}
        mode="open"
        onChange={() => {}}
        onModeChange={() => {}}
      />,
    );
    expect(html).toContain('bg-popover');
    expect(html).toContain('border-border');
    expect(html).toContain('focus-visible:ring-ring');
    expect(html).toContain('aria-label="Viewer options"');
    expect(html).toContain('name="floorDistance"');
    expect(html).toContain('name="toneMapping"');
    expect(html).not.toContain('background:#');
  });
  it('uses one GPU controller and preserves panel settings while changing source data', async () => {
    let settings: ViewerSettings = { ...DEFAULT_VIEWER_SETTINGS };
    const events = new EventTarget();
    const viewer = {
      setDocument: vi.fn(),
      getSettings: () => ({ ...settings }),
      dispose: vi.fn(),
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      setSettings: vi.fn((patch: Partial<ViewerSettings>) => {
        const previousSettings = settings;
        settings = resolveViewerSettings(patch, settings);
        events.dispatchEvent(
          new CustomEvent('settingschange', { detail: { settings: { ...settings }, previousSettings } }),
        );
      }),
    };
    mocks.createLightViewer.mockReturnValue(viewer);
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const onLoad = vi.fn();
    await act(async () => {
      root!.render(<LightViewer profile={profile()} onLoad={onLoad} />);
    });
    expect(mocks.createLightViewer).toHaveBeenCalledOnce();
    expect(viewer.setDocument).toHaveBeenCalledOnce();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Viewer options"]')!.click();
    });
    await act(async () => {
      container.querySelector<HTMLInputElement>('[name="showWall"]')!.click();
    });
    expect(settings.showWall).toBe(false);
    await act(async () => {
      root!.render(<LightViewer profile={profile()} onLoad={onLoad} />);
    });
    expect(viewer.setDocument).toHaveBeenCalledTimes(2);
    expect(mocks.createLightViewer).toHaveBeenCalledOnce();
    expect(settings.showWall).toBe(false);
    expect(container.querySelector<HTMLInputElement>('[name="showWall"]')!.checked).toBe(false);
    await act(async () => {
      root!.unmount();
    });
    root = undefined;
    expect(viewer.dispose).toHaveBeenCalledOnce();
  });
});
