import { describe, expect, it } from 'vitest';
import { createPreviewUpdate } from './previewData.js';
import { isUpdateMessage } from './protocol.js';
import { ldtSource } from '../../viewer/test/photometryFixtures.js';

describe('dual-format webview updates', () => {
  it('provides explicit choices for native LDT alternative configurations', () => {
    const text = ldtSource({ alternatives: true });
    const message = createPreviewUpdate(text, 'ldt');
    expect(message.text).toBe(text);
    expect(message.format).toBe('ldt');
    expect(message.lampSetLabels).toEqual([
      '1: First configuration · 2000 lm · 20 W',
      '2: Second configuration · 500 lm · 5 W',
    ]);
    expect(isUpdateMessage(message)).toBe(true);
  });
  it('transports malformed live edits as data so the viewer can display its parser error', () => {
    expect(createPreviewUpdate('</script><script>bad</script>', 'ldt')).toEqual({
      type: 'update',
      text: '</script><script>bad</script>',
      format: 'ldt',
      lampSetLabels: [],
    });
    expect(createPreviewUpdate('IES text', 'ies').lampSetLabels).toEqual([]);
  });
  it('rejects invalid format and label payload shapes', () => {
    for (const message of [
      { type: 'update', text: 'x', format: 'bad' },
      { type: 'update', text: 'x', lampSetLabels: 'not an array' },
      { type: 'update', text: 'x', lampSetLabels: [1] },
    ])
      expect(isUpdateMessage(message)).toBe(false);
  });
});
