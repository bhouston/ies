// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iesSource } from '../../core/test/iesSource.js';
import { ldtSource } from '../test/photometryFixtures.js';
import { DEFAULT_VIEWER_SETTINGS, resolveViewerSettings, type ViewerSettings } from './settings.js';
const mocks = vi.hoisted(() => ({ createLightViewer: vi.fn() }));
// Only the GPU boundary is replaced: actual custom-element DOM, controls and source parser run.
vi.mock('./viewer.js', () => ({ createLightViewer: mocks.createLightViewer }));
import './element.js';
import type { LightViewerElement } from './element.js';
const controllers: {
  setDocument: ReturnType<typeof vi.fn>;
  setSettings: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}[] = [];
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
beforeEach(() => {
  controllers.length = 0;
  mocks.createLightViewer.mockImplementation((_host: HTMLElement, options: Partial<ViewerSettings>) => {
    let settings = resolveViewerSettings(options);
    const controller = {
      setDocument: vi.fn(),
      setSettings: vi.fn((patch: Partial<ViewerSettings>) => {
        settings = resolveViewerSettings(patch, settings);
      }),
      getSettings: () => ({ ...settings }),
      dispose: vi.fn(),
    };
    controllers.push(controller);
    return controller;
  });
});
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function element() {
  return document.createElement('light-viewer') as LightViewerElement;
}
function mount(value: LightViewerElement) {
  document.body.append(value);
  return value;
}
function input(value: LightViewerElement, name: string) {
  return value.shadowRoot!.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
}

describe('light-viewer DOM and source lifecycle with a mocked GPU boundary', () => {
  it('loads LDT and retains legacy profile and source document event fields', async () => {
    const viewer = element(),
      loads: unknown[] = [];
    viewer.addEventListener('load', (event) => loads.push((event as CustomEvent).detail));
    viewer.photometryText = ldtSource();
    mount(viewer);
    await flush();
    expect(controllers[0]!.setDocument).toHaveBeenCalledOnce();
    expect(loads).toEqual([
      expect.objectContaining({
        sourceFormat: 'ldt',
        profile: expect.objectContaining({ photometricType: 1 }),
        document: expect.objectContaining({ sourceFormat: 'ldt' }),
      }),
    ]);
    expect(viewer.data).toBe(viewer.iesText);
  });
  it('aborts old URLs and never publishes their stale result', async () => {
    let complete!: (value: unknown) => void;
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', (_url: string, init: { signal: AbortSignal }) => {
      signal = init.signal;
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    const viewer = element();
    viewer.setAttribute('src', '/slow.ies');
    mount(viewer);
    await flush();
    viewer.data = ldtSource();
    await flush();
    complete({ ok: true, status: 200, text: async () => iesSource() });
    await flush();
    expect(signal?.aborted).toBe(true);
    expect(controllers[0]!.setDocument).toHaveBeenCalledOnce();
    expect(controllers[0]!.setDocument.mock.calls[0]![0].sourceFormat).toBe('ldt');
  });
  it('disposes on removal and restores source/settings after reinsertion', async () => {
    const viewer = element();
    viewer.data = iesSource();
    viewer.settings = { floorDistance: 4, showWall: false, toneMapping: 'agx' };
    mount(viewer);
    await flush();
    viewer.remove();
    expect(controllers[0]!.dispose).toHaveBeenCalledOnce();
    mount(viewer);
    await flush();
    expect(controllers).toHaveLength(2);
    expect(controllers[1]!.setDocument).toHaveBeenCalledOnce();
    expect(mocks.createLightViewer.mock.calls[1]![1]).toEqual(
      expect.objectContaining({ floorDistance: 4, showWall: false, toneMapping: 'agx' }),
    );
  });
  it('supports lamp-set selection and reports malformed attributes', async () => {
    const viewer = element(),
      errors: string[] = [];
    viewer.addEventListener('error', (event) => errors.push((event as CustomEvent).detail.message));
    viewer.setAttribute('format', 'ldt');
    viewer.setAttribute('lamp-set-index', '1');
    viewer.data = ldtSource({ alternatives: true });
    mount(viewer);
    await flush();
    expect(controllers[0]!.setDocument.mock.calls[0]![0].selectedLampSetIndex).toBe(1);
    viewer.setAttribute('lamp-set-index', '-1');
    await flush();
    expect(errors).toEqual([expect.stringContaining('nonnegative integer')]);
  });
  it('opens and closes its accessible options panel with the gear, Escape and outside pointer', () => {
    const viewer = mount(element()),
      root = viewer.shadowRoot!,
      gear = root.querySelector<HTMLButtonElement>('[aria-label="Viewer options"]')!,
      panel = root.querySelector<HTMLDivElement>('[role="region"]')!;
    expect(gear.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    gear.click();
    expect(viewer.getAttribute('settings-panel')).toBe('open');
    expect(panel.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panel.hidden).toBe(true);
    expect(root.activeElement).toBe(gear);
    gear.click();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(panel.hidden).toBe(true);
  });
  it('binds all controls, reflects attributes and emits a single composed settings event', () => {
    const viewer = mount(element()),
      events: CustomEvent[] = [];
    viewer.addEventListener('settingschange', (event) => events.push(event as CustomEvent));
    const wall = input(viewer, 'showWall');
    wall.checked = false;
    wall.dispatchEvent(new Event('change'));
    expect(viewer.settings.showWall).toBe(false);
    expect(viewer.getAttribute('show-wall')).toBe('false');
    expect(events).toHaveLength(1);
    expect(events[0]!.bubbles && events[0]!.composed).toBe(true);
    input(viewer, 'wallDistance').value = '3.5';
    input(viewer, 'wallDistance').dispatchEvent(new Event('change'));
    input(viewer, 'floorDistance').value = '4';
    input(viewer, 'floorDistance').dispatchEvent(new Event('change'));
    const tone = viewer.shadowRoot!.querySelector<HTMLSelectElement>('[name="toneMapping"]')!;
    tone.value = 'neutral';
    tone.dispatchEvent(new Event('change'));
    input(viewer, 'exposure').value = '0';
    input(viewer, 'exposure').dispatchEvent(new Event('change'));
    expect(viewer.settings).toEqual({
      showWall: false,
      wallDistance: 3.5,
      floorDistance: 4,
      toneMapping: 'neutral',
      exposure: 0,
    });
    expect(controllers[0]!.setSettings).toHaveBeenCalledTimes(5);
  });
  it('updates controls from attributes without reloading its source', async () => {
    const viewer = element();
    viewer.data = iesSource();
    mount(viewer);
    await flush();
    viewer.setAttribute('floor-distance', '5');
    viewer.setAttribute('tone-mapping', 'reinhard');
    viewer.setAttribute('settings-panel', 'hidden');
    await flush();
    expect(input(viewer, 'floorDistance').value).toBe('5');
    expect(viewer.settings.toneMapping).toBe('reinhard');
    expect(controllers[0]!.setDocument).toHaveBeenCalledOnce();
    expect(viewer.shadowRoot!.querySelector<HTMLDivElement>('.settings-ui')!.hidden).toBe(true);
  });
  it('validates mixed patches atomically and preserves settings across source changes', async () => {
    const viewer = mount(element());
    expect(() => {
      viewer.settings = { showWall: false, wallDistance: -1 };
    }).toThrow();
    expect(viewer.settings).toEqual(DEFAULT_VIEWER_SETTINGS);
    expect(controllers[0]!.setSettings).not.toHaveBeenCalled();
    viewer.settings = { exposure: 250, wallDistance: 7 };
    viewer.data = ldtSource();
    await flush();
    expect(viewer.settings.exposure).toBe(250);
    expect(viewer.settings.wallDistance).toBe(7);
    const snapshot = viewer.settings;
    snapshot.exposure = 1;
    expect(viewer.settings.exposure).toBe(250);
  });
});
