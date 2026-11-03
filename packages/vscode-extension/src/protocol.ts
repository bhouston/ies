/** Messages are plain structured-clone data; document contents never become HTML. */
export interface UpdateMessage {
  type: 'update';
  text: string;
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
    typeof message.text === 'string'
  );
}
