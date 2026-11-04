// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iesSource } from '../../core/test/iesSource.js';
import { ldtSource } from '../test/photometryFixtures.js';
import { parsePhotometry } from '@ies-tools/core';
import { DEFAULT_VIEWER_SETTINGS, resolveViewerSettings, type ViewerSettings } from './settings.js';
const mocks = vi.hoisted(() => ({ createLightViewer: vi.fn() }));
// Only the GPU boundary is replaced: actual custom-element DOM, controls and source parser run.
vi.mock('./viewer.js', () => ({ createLightViewer: mocks.createLightViewer }));
import './element.js';
import type { LightViewerElement } from './element.js';
const controllers: {
  clear: ReturnType<typeof vi.fn>;
  setDocument: ReturnType<typeof vi.fn>;
  setSettings: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  capture: ReturnType<typeof vi.fn>;
  renderer: { domElement: HTMLCanvasElement };
  /** Simulate a viewer-originated change, such as dragging the light. */
  drag: (patch: Partial<ViewerSettings>) => void;
}[] = [];
const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
};
let lost = false;
beforeEach(() => {
  lost = false;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  controllers.length = 0;
  mocks.createLightViewer.mockImplementation((_host: HTMLElement, options: Partial<ViewerSettings>) => {
    let settings = resolveViewerSettings(options);
    const events = new EventTarget();
    const controller = {
      clear: vi.fn(),
      setDocument: vi.fn(),
      setSettings: vi.fn((patch: Partial<ViewerSettings>) => {
        settings = resolveViewerSettings(patch, settings);
      }),
      getSettings: () => ({ ...settings }),
      dispose: vi.fn(),
      renderer: { domElement: document.createElement('canvas'), getContext: () => ({ isContextLost: () => lost }) },
      capture: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
      addEventListener: (type: string, listener: EventListener) => events.addEventListener(type, listener),
      drag: (patch: Partial<ViewerSettings>) => {
        const previousSettings = settings;
        settings = resolveViewerSettings(patch, settings);
        events.dispatchEvent(new CustomEvent('settingschange', { detail: { settings, previousSettings } }));
      },
    };
    controllers.push(controller);
    return controller;
  });
});
afterEach(async () => {
  await act(async () => {
    document.body.replaceChildren();
    await Promise.resolve();
  });
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function element() {
  return document.createElement('light-viewer') as LightViewerElement;
}
function mount(value: LightViewerElement) {
  act(() => {
    document.body.append(value);
  });
  return value;
}
function input(value: LightViewerElement, name: string) {
  return value.shadowRoot!.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
}

function changeNumber(viewer: LightViewerElement, name: string, value: string) {
  const target = input(viewer, name);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, value);
    target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  });
}

describe('light-viewer readiness and capture', () => {
  it('rejects before connection and on disconnection', async () => {
    const viewer = element();
    await expect(viewer.whenReady()).rejects.toThrow('not connected');
    let complete!: (value: unknown) => void;
    vi.stubGlobal('fetch', () => new Promise((resolve) => (complete = resolve)));
    viewer.setAttribute('src', '/slow.ies');
    mount(viewer);
    const ready = viewer.whenReady();
    await flush();
    act(() => viewer.remove());
    await expect(ready).rejects.toThrow('disconnected');
    complete({ ok: true, text: async () => iesSource() });
  });
  it('follows source changes and resolves after the latest one renders', async () => {
    const resolvers: ((value: unknown) => void)[] = [];
    vi.stubGlobal('fetch', () => new Promise((resolve) => resolvers.push(resolve)));
    const viewer = mount(element());
    viewer.setAttribute('src', '/a.ies');
    const ready = viewer.whenReady();
    await flush();
    expect(resolvers).toHaveLength(1);
    viewer.setAttribute('src', '/b.ies');
    let done = false;
    void ready.then(() => (done = true));
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
    const viewer = element();
    viewer.setAttribute('errors', 'silent');
    viewer.setAttribute('src', '/x.ies');
    mount(viewer);
    await expect(viewer.whenReady()).rejects.toThrow(message);
    await expect(viewer.toBlob()).rejects.toThrow(message);
    expect(controllers[0]!.capture).not.toHaveBeenCalled();
  });
  it('rejects unsupported types, context loss, and passes capture options through', async () => {
    const viewer = element();
    viewer.setAttribute('errors', 'silent');
    viewer.photometryText = iesSource();
    mount(viewer);
    controllers[0]!.setDocument.mockImplementationOnce(() => {
      throw new Error('Type C photometry only');
    });
    viewer.photometryText = iesSource();
    await expect(viewer.whenReady()).rejects.toThrow('Type C');
    viewer.photometryText = iesSource();
    const blob = await viewer.toBlob({ type: 'image/webp', width: 64, height: 32 });
    expect(blob.type).toBe('image/png');
    expect(controllers[0]!.capture).toHaveBeenCalledWith({ type: 'image/webp', width: 64, height: 32 });
    lost = true;
    await expect(viewer.whenReady()).rejects.toThrow('context was lost');
    lost = false;
    viewer.photometryText = iesSource();
    const pending = viewer.whenReady();
    controllers[0]!.renderer.domElement.dispatchEvent(new Event('webglcontextlost'));
    await expect(pending).rejects.toThrow('context was lost');
  });
  it('resolves an empty viewer immediately and rejects a failed GPU start', async () => {
    await mount(element()).whenReady();
    mocks.createLightViewer.mockImplementationOnce(() => {
      throw new Error('no WebGL2');
    });
    const viewer = element();
    viewer.setAttribute('errors', 'silent');
    await expect(mount(viewer).whenReady()).rejects.toThrow('no WebGL2');
  });
});

describe('light-viewer DOM and source lifecycle with a mocked GPU boundary', () => {
  it.each(['document', 'src'] as const)('clears the scene and chart when its %s source is removed', async (source) => {
    const viewer = element();
    if (source === 'document') viewer.photometry = parsePhotometry(iesSource());
    else {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => iesSource() }));
      viewer.setAttribute('src', '/fixture.ies');
    }
    viewer.setAttribute('charts', 'true');
    mount(viewer);
    await flush();
    act(() => {
      viewer.shadowRoot!.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!.click();
    });
    expect(viewer.shadowRoot!.querySelector('[role="tabpanel"] svg')).not.toBeNull();
    if (source === 'document') viewer.photometry = undefined;
    else viewer.removeAttribute('src');
    await flush();
    expect(controllers[0]!.clear).toHaveBeenCalledOnce();
    expect(viewer.shadowRoot!.querySelector('[role="tabpanel"] svg')).toBeNull();
    expect(viewer.shadowRoot!.querySelector('.status')!.textContent).toBe('');
    viewer.data = iesSource();
    await flush();
    expect(controllers[0]!.setDocument).toHaveBeenCalledTimes(2);
    expect(viewer.shadowRoot!.querySelector('[role="tabpanel"] svg')).not.toBeNull();
  });
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
  it('shows HTTP errors above the tabs, supports dismissal, and recovers on a valid source', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404 }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const viewer = element();
    const errors: CustomEvent[] = [];
    viewer.addEventListener('error', (event) => errors.push(event as CustomEvent));
    viewer.setAttribute('src', '/missing.ies');
    viewer.setAttribute('charts', 'true');
    mount(viewer);
    await flush();
    const root = viewer.shadowRoot!;
    const overlay = root.querySelector<HTMLDivElement>('.error-log')!;
    expect(overlay.hidden).toBe(false);
    expect(overlay.getAttribute('role')).toBe('alert');
    expect(overlay.textContent).toContain('Failed to load photometry: HTTP 404');
    expect(overlay.textContent).toContain('Source: /missing.ies');
    expect(errors[0]!.detail.message).toContain('HTTP 404');
    const copy = overlay.querySelector<HTMLButtonElement>('.error-log-copy')!;
    copy.click();
    await flush();
    expect(writeText).toHaveBeenCalledWith(
      'Unable to load photometry\n\nFailed to load photometry: HTTP 404. Check the source URL and deploy the .ies or .ldt file at that path.\n\nError\nSource: /missing.ies',
    );
    expect(overlay.querySelector('[role="status"]')!.textContent).toBe('Copied');
    writeText.mockRejectedValueOnce(new Error('Clipboard permission denied'));
    copy.click();
    await flush();
    expect(overlay.querySelector('[role="status"]')!.textContent).toContain('Couldn’t copy');
    expect(copy.disabled).toBe(false);
    act(() => {
      root.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="false"]')!.click();
    });
    expect(overlay.hidden).toBe(false);
    act(() => {
      overlay.querySelector<HTMLButtonElement>('button')!.click();
    });
    expect(overlay.hidden).toBe(true);
    viewer.data = 'invalid photometry';
    await flush();
    expect(overlay.hidden).toBe(false);
    expect(overlay.textContent).toContain('Inline photometry');
    viewer.data = iesSource();
    await flush();
    expect(overlay.hidden).toBe(true);
    expect(controllers[0]!.setDocument).toHaveBeenCalledOnce();
  });
  it('silences only the visible error overlay and applies changes without reloading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    const viewer = element();
    const onError = vi.fn();
    viewer.addEventListener('error', onError);
    viewer.setAttribute('errors', 'silent');
    viewer.setAttribute('src', '/missing.ies');
    mount(viewer);
    await flush();
    const overlay = viewer.shadowRoot!.querySelector<HTMLDivElement>('.error-log')!;
    expect(overlay.hidden).toBe(true);
    expect(onError).toHaveBeenCalledOnce();
    viewer.removeAttribute('errors');
    expect(overlay.hidden).toBe(false);
    viewer.setAttribute('errors', 'silent');
    expect(overlay.hidden).toBe(true);
    viewer.setAttribute('errors', 'anything-else');
    expect(overlay.hidden).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
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
    act(() => {
      viewer.remove();
    });
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
      panel = root.querySelector<HTMLElement>('section[aria-label="Viewer options"]')!;
    expect(gear.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    act(() => {
      gear.click();
    });
    expect(viewer.getAttribute('settings-panel')).toBe('open');
    expect(panel.hidden).toBe(false);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(panel.hidden).toBe(true);
    expect(root.activeElement).toBe(gear);
    act(() => {
      gear.click();
    });
    act(() => {
      root.querySelector('.viewport')!.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    });
    expect(panel.hidden).toBe(true);
    act(() => {
      gear.click();
    });
    act(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(panel.hidden).toBe(true);
  });
  it('binds all controls, reflects attributes and emits a single composed settings event', () => {
    const viewer = mount(element()),
      events: CustomEvent[] = [];
    viewer.addEventListener('settingschange', (event) => events.push(event as CustomEvent));
    const wall = input(viewer, 'showWall');
    act(() => {
      wall.click();
    });
    expect(viewer.settings.showWall).toBe(false);
    expect(viewer.getAttribute('show-wall')).toBe('false');
    expect(events).toHaveLength(1);
    expect(events[0]!.bubbles && events[0]!.composed).toBe(true);
    changeNumber(viewer, 'wallDistance', '3.5');
    changeNumber(viewer, 'floorDistance', '4');
    const tone = viewer.shadowRoot!.querySelector<HTMLSelectElement>('[name="toneMapping"]')!;
    act(() => {
      tone.value = 'neutral';
      tone.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(input(viewer, 'exposure').disabled).toBe(true);
    act(() => {
      input(viewer, 'autoExposure').click();
    });
    expect(viewer.getAttribute('auto-exposure')).toBe('false');
    expect(input(viewer, 'exposure').disabled).toBe(false);
    changeNumber(viewer, 'exposure', '7.5');
    act(() => {
      input(viewer, 'helper').click();
    });
    expect(viewer.getAttribute('helper')).toBe('false');
    act(() => {
      input(viewer, 'photometricSolid').click();
    });
    expect(viewer.getAttribute('photometric-solid')).toBe('true');
    act(() => {
      input(viewer, 'rulers').click();
    });
    expect(viewer.getAttribute('rulers')).toBe('false');
    const toggle = (group: string, label: string) =>
      [...viewer.shadowRoot!.querySelectorAll<HTMLButtonElement>(`[aria-label="${group}"] button`)].find(
        (button) => button.textContent === label,
      )!;
    act(() => toggle('View mode', 'Measurement').click());
    act(() => toggle('Units', 'Imperial').click());
    expect(toggle('Units', 'Imperial').getAttribute('aria-pressed')).toBe('true');
    expect(viewer.getAttribute('view-mode')).toBe('measurement');
    expect(viewer.getAttribute('units')).toBe('imperial');
    // Imperial shows feet but stores metres.
    expect(input(viewer, 'floorDistance').value).toBe('13.12');
    expect(input(viewer, 'floorDistance').parentElement!.textContent).toContain('Floor distance (ft)');
    changeNumber(viewer, 'floorDistance', '10');
    expect(viewer.settings).toEqual({
      showWall: false,
      wallDistance: 3.5,
      floorDistance: 3.048,
      lightOffset: 0,
      toneMapping: 'neutral',
      autoExposure: false,
      exposure: 7.5,
      helper: false,
      photometricSolid: true,
      rulers: false,
      viewMode: 'measurement',
      units: 'imperial',
    });
    expect(controllers[0]!.setSettings).toHaveBeenCalledTimes(12);
  });
  it('reflects the exposure metered while applying a setting, with one settings event', () => {
    const viewer = mount(element()),
      events: CustomEvent[] = [];
    viewer.addEventListener('settingschange', (event) => events.push(event as CustomEvent));
    // Auto exposure re-meters inside setSettings and reports it through the viewer's own event.
    controllers[0]!.setSettings.mockImplementation((patch: Partial<ViewerSettings>) =>
      controllers[0]!.drag({ ...patch, exposure: 7.3 }),
    );
    act(() => {
      viewer.settings = { floorDistance: 3 };
    });
    expect(viewer.settings).toMatchObject({ floorDistance: 3, exposure: 7.3 });
    expect(viewer.getAttribute('exposure')).toBe('7.3');
    expect(input(viewer, 'exposure').value).toBe('7.3');
    expect(events).toHaveLength(1);
  });
  it('reflects light drags inside the viewer to attributes, the panel and one settings event', () => {
    const viewer = mount(element()),
      events: CustomEvent[] = [];
    viewer.addEventListener('settingschange', (event) => events.push(event as CustomEvent));
    act(() => controllers[0]!.drag({ floorDistance: 2.5, wallDistance: 1.25 }));
    expect(viewer.settings).toMatchObject({ floorDistance: 2.5, wallDistance: 1.25 });
    expect(viewer.getAttribute('floor-distance')).toBe('2.5');
    expect(viewer.getAttribute('wall-distance')).toBe('1.25');
    expect(input(viewer, 'wallDistance').value).toBe('1.25');
    expect(events).toHaveLength(1);
  });
  it('keeps the deprecated light-offset attribute working without a panel field', () => {
    const viewer = mount(element());
    act(() => viewer.setAttribute('light-offset', '1.5'));
    expect(viewer.settings.lightOffset).toBe(1.5);
    expect(controllers[0]!.setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ lightOffset: 1.5 }));
    expect(viewer.shadowRoot!.querySelector('[name="lightOffset"]')).toBeNull();
  });
  it('applies every setting attribute present when parsed markup creates the element', () => {
    const host = document.createElement('div');
    host.innerHTML = '<light-viewer view-mode="measurement" units="imperial" exposure="2"></light-viewer>';
    const viewer = host.firstElementChild as LightViewerElement;
    expect(viewer.settings).toMatchObject({ viewMode: 'measurement', units: 'imperial', exposure: 2 });
    expect(viewer.getAttribute('units')).toBe('imperial');
  });
  it('updates controls from attributes without reloading its source', async () => {
    const viewer = element();
    viewer.data = iesSource();
    mount(viewer);
    await flush();
    act(() => {
      viewer.setAttribute('floor-distance', '5');
      viewer.setAttribute('tone-mapping', 'reinhard');
      viewer.setAttribute('settings-panel', 'hidden');
    });
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
    act(() => {
      viewer.settings = { exposure: 12, wallDistance: 7 };
    });
    viewer.data = ldtSource();
    await flush();
    expect(viewer.settings.exposure).toBe(12);
    expect(viewer.settings.wallDistance).toBe(7);
    const snapshot = viewer.settings;
    snapshot.exposure = 1;
    expect(viewer.settings.exposure).toBe(12);
  });
  it('shows chart tabs only with charts="true" and charts the loaded profile', async () => {
    const viewer = element();
    viewer.data = iesSource();
    mount(viewer);
    await flush();
    const root = viewer.shadowRoot!;
    expect(root.querySelector('[role="tablist"]')).toBeNull();
    act(() => {
      viewer.setAttribute('charts', 'true');
    });
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      '3D view',
      'Polar',
      'Cartesian',
      'Topology',
      'Isolux',
      'Cone',
      'Luminance',
      'Intensity table',
    ]);
    expect(root.querySelector('.viewport')!.classList.contains('with-tabs')).toBe(true);
    expect(root.querySelector('[role="tabpanel"]')).toBeNull();
    for (const tab of tabs.slice(1)) {
      act(() => {
        tab.click();
      });
      expect(root.querySelector('[role="tabpanel"] svg')).not.toBeNull();
      expect(root.querySelector<HTMLDivElement>('.settings-ui')!.hidden).toBe(true);
    }
    act(() => {
      tabs[0]!.click();
    });
    expect(root.querySelector('[role="tabpanel"]')).toBeNull();
    expect(root.querySelector<HTMLDivElement>('.settings-ui')!.hidden).toBe(false);
    act(() => {
      viewer.setAttribute('charts', 'false');
    });
    expect(root.querySelector('[role="tablist"]')).toBeNull();
  });
});
