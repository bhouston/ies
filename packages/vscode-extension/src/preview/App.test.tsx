// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App.js';
import { inspectPreview } from './inspection.js';
import { inspectPhotometry, validatePhotometry } from '@ies-tools/core';
import { iesSource } from '../../../core/test/iesSource.js';
import { ldtSource } from '../../../viewer/test/photometryFixtures.js';
import { createPreviewUpdate } from '../previewData.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});
async function mount() {
  await act(() => root.render(<App />));
}
async function source(text: string, format: 'ies' | 'ldt' = 'ies') {
  const message = createPreviewUpdate(text, format, 'example.' + format);
  await act(() => window.dispatchEvent(new MessageEvent('message', { data: message })));
}

describe('React photometric preview information', () => {
  it('renders a semantic sidebar and shared Tailwind theme classes on the server', () => {
    const html = renderToStaticMarkup(<App initialUpdate={createPreviewUpdate(iesSource(), 'ies', 'example.ies')} />);
    expect(html).toContain('aria-label="Photometric file information"');
    expect(html).toContain('grid-cols-[minmax(0,1fr)_360px]');
    expect(html).toContain('bg-background');
    expect(html).toContain('Integrated luminaire flux');
    expect(html).toContain('LM-63-2019');
  });
  it('uses the exact core/CLI models for inspection and validation', () => {
    const text = iesSource();
    const report = inspectPreview(text, 'ies');
    expect(report.inspection).toEqual(inspectPhotometry(text, 'ies'));
    const expected = validatePhotometry(text, 'ies');
    expect(report.validation).toEqual({ valid: expected.valid, diagnostics: expected.diagnostics });
  });
  it('replaces stale valid statistics with errors after an invalid live edit', async () => {
    await mount();
    await source(iesSource());
    expect(host.textContent).toContain('Integrated luminaire flux');
    await source('unfinished IES source');
    expect(host.textContent).not.toContain('Integrated luminaire flux');
    expect(host.textContent).toContain('IES_MISSING_TILT');
    expect(host.textContent).toContain('Invalid');
    expect(host.textContent).toContain('No current inspection data');
  });
  it('displays metadata as text, independently from 3D rendering errors', async () => {
    await mount();
    await source(iesSource({ metadata: '[TEST] safe\n[MANUFAC] <img src=x onerror="alert(1)">' }));
    expect(host.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(host.querySelector('img')).toBeNull();
    await act(() =>
      host
        .querySelector('light-viewer')!
        .dispatchEvent(new CustomEvent('error', { detail: { message: 'Type C rendering only' } })),
    );
    expect(host.textContent).toContain('Type C rendering only');
    expect(host.textContent).toContain('Integrated luminaire flux');
  });
  it('updates strict results without discarding inspection data', async () => {
    await mount();
    await source(iesSource({ metadata: '[TEST] Authored' }));
    expect(host.textContent).toContain('Valid');
    let sourceLoads = 0;
    Object.defineProperty(host.querySelector('light-viewer')!, 'photometryText', {
      configurable: true,
      set: () => {
        sourceLoads++;
      },
    });
    await act(() => (host.querySelector('input[type=checkbox]') as HTMLInputElement).click());
    expect(host.textContent).toContain('Fails strict validation');
    expect(sourceLoads).toBe(0);
    expect(host.textContent).toContain('Integrated luminaire flux');
  });
  it('recalculates the selected LDT alternative and source attribute', async () => {
    await mount();
    await source(ldtSource({ alternatives: true }), 'ldt');
    expect(host.textContent).toContain('Select an alternative configuration');
    const select = host.querySelector('select[aria-label="Alternative lamp configuration"]') as HTMLSelectElement;
    await act(() => {
      select.value = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.textContent).toContain('Second configuration (selected)');
    expect(host.querySelector('light-viewer')?.getAttribute('lamp-set-index')).toBe('1');
    const inspection = inspectPreview(ldtSource({ alternatives: true }), 'ldt', false, 1).inspection!;
    expect(inspection.peakCandela).toBe(25);
  });
  it('ignores malformed host messages', async () => {
    await mount();
    await source(iesSource());
    const content = host.textContent;
    await act(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'update', text: 13 } })));
    expect(host.textContent).toBe(content);
  });
});
