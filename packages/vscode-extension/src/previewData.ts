import { parseLDT, LDTParseError, type LDTProfile } from '@ies-tools/core';
import type { UpdateMessage } from './protocol.js';

/** User-facing labels for native LDT alternative lamp configurations. */
export function lampSetLabels(profile: LDTProfile): string[] {
  return profile.lampSets.map(
    (set, index) => `${index + 1}: ${set.description || 'Lamp configuration'} · ${set.totalLumens} lm · ${set.watts} W`,
  );
}

/** Source text and labels are transported as data, never interpolated into webview HTML. */
export function createPreviewUpdate(text: string, format: 'ies' | 'ldt', fileName?: string): UpdateMessage {
  let labels: string[] = [];
  if (format === 'ldt') {
    try {
      labels = lampSetLabels(parseLDT(text));
    } catch (error) {
      // Invalid live edits still reach the viewer, which presents the parser's error message.
      if (!(error instanceof LDTParseError)) throw error;
    }
  }
  return { type: 'update', text, format, lampSetLabels: labels, ...(fileName === undefined ? {} : { fileName }) };
}
