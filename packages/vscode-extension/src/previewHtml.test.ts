import { describe, expect, it } from 'vitest';
import { escapeAttribute, getPreviewHtml } from './previewHtml.js';
import { isReadyMessage, isUpdateMessage } from './protocol.js';

describe('preview security and protocol', () => {
  it('escapes all HTML attribute delimiters', () => {
    expect(escapeAttribute('<>&\'"')).toBe('&lt;&gt;&amp;&#39;&quot;');
  });
  it('uses local resources and excludes inline scripts and raw document text', () => {
    const html = getPreviewHtml('vscode-resource:', 'vscode-resource:/preview.js', 'vscode-resource:/preview.css');
    expect(html).toContain('default-src &#39;none&#39;');
    expect(html).toContain('script type="module" src="vscode-resource:/preview.js"');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('unsafe-eval');
  });
  it('does not allow resource URIs to inject markup', () => {
    const html = getPreviewHtml('vscode-resource:', '"><script>alert(1)</script>', 'style.css');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
  it('accepts only recognized structured messages', () => {
    expect(isReadyMessage({ type: 'ready' })).toBe(true);
    expect(isReadyMessage(null)).toBe(false);
    expect(isReadyMessage('ready')).toBe(false);
    expect(isUpdateMessage({ type: 'update', text: '</script>' })).toBe(true);
    for (const value of [null, {}, { type: 'update' }, { type: 'update', text: 1 }, { type: 'execute', text: 'x' }]) {
      expect(isUpdateMessage(value)).toBe(false);
    }
  });
});
