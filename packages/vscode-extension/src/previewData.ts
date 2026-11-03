import { parseLDT, LDTParseError } from '@ies-tools/core';
import type { UpdateMessage } from './protocol.js';

/** Source text and labels are transported as data, never interpolated into webview HTML. */
export function createPreviewUpdate(text: string, format: 'ies' | 'ldt', fileName?: string): UpdateMessage {
  let lampSetLabels: string[] = [];
  if (format === 'ldt') {
    try {
      lampSetLabels = parseLDT(text).lampSets.map(
        (set, index) =>
          `${index + 1}: ${set.description || 'Lamp configuration'} · ${set.totalLumens} lm · ${set.watts} W`,
      );
    } catch (error) {
      // Invalid live edits still reach the viewer, which presents the parser's error message.
      if (!(error instanceof LDTParseError)) throw error;
    }
  }
  return { type: 'update', text, format, lampSetLabels, ...(fileName === undefined ? {} : { fileName }) };
}
