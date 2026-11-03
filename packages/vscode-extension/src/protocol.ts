/** Messages are plain structured-clone data; document contents never become HTML. */
export interface UpdateMessage {
  type: 'update';
  text: string;
  format?: 'ies' | 'ldt';
  lampSetLabels?: string[];
  fileName?: string;
}

export function isReadyMessage(message: unknown): boolean {
  return typeof message === 'object' && message !== null && 'type' in message && message.type === 'ready';
}

export function isUpdateMessage(message: unknown): message is UpdateMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'update' &&
    'text' in message &&
    typeof message.text === 'string' &&
    (!('fileName' in message) || typeof message.fileName === 'string') &&
    (!('format' in message) || message.format === 'ies' || message.format === 'ldt') &&
    (!('lampSetLabels' in message) ||
      (Array.isArray(message.lampSetLabels) && message.lampSetLabels.every((value) => typeof value === 'string')))
  );
}
