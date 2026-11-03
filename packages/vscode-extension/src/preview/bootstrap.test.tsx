// @vitest-environment jsdom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mountPreview } from './bootstrap.js';
import { createPreviewUpdate } from '../previewData.js';
import { iesSource } from '../../../core/test/iesSource.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
// The renderer boundary acknowledges a file load; the real App, host protocol,
// inspection, validation and startup ordering execute normally.
class RendererBoundary extends HTMLElement {
  set photometryText(_text: string) {
    queueMicrotask(() => this.dispatchEvent(new CustomEvent('load')));
  }
}
beforeAll(() => customElements.define('light-viewer', RendererBoundary));
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
});

async function startWithImmediateHostUpdate() {
  const messages: unknown[] = [];
  await act(async () => {
    root = mountPreview({
      postMessage(message) {
        messages.push(message);
        window.dispatchEvent(
          new MessageEvent('message', {
            data: createPreviewUpdate(iesSource(), 'ies', 'immediate.ies'),
          }),
        );
      },
    });
  });
  expect(messages).toEqual([{ type: 'ready' }]);
  expect(document.querySelector('aside')?.textContent).toContain('Integrated luminaire flux');
  expect(document.querySelector('aside')?.textContent).toContain('immediate.ies');
  expect(document.querySelector('#status')?.textContent).toContain('Drag to orbit');
}

describe('preview bootstrap across installed extension updates', () => {
  it('keeps the current HTML root and receives an immediate ready response', async () => {
    const container = document.createElement('div');
    container.id = 'root';
    document.body.append(container);
    await startWithImmediateHostUpdate();
    expect(document.getElementById('root')).toBe(container);
    expect(document.querySelectorAll('light-viewer')).toHaveLength(1);
  });

  it('replaces legacy host HTML and finishes loading without a window reload', async () => {
    document.body.innerHTML = `<main aria-label="IES photometric preview">
      <light-viewer></light-viewer>
      <p id="status">Loading photometric profile…</p>
    </main>`;
    const legacyViewer = document.querySelector('light-viewer')!;
    const legacyStatus = document.querySelector('#status')!;
    await startWithImmediateHostUpdate();
    expect(legacyViewer.isConnected).toBe(false);
    expect(legacyStatus.isConnected).toBe(false);
    expect(document.body.children).toHaveLength(1);
    expect(document.body.firstElementChild?.id).toBe('root');
    expect(document.querySelectorAll('light-viewer')).toHaveLength(1);
    expect(document.querySelectorAll('#status')).toHaveLength(1);
  });
});
