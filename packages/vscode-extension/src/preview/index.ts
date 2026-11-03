import 'ies-viewer/element';
import { isUpdateMessage } from '../protocol.js';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const api = acquireVsCodeApi();
const viewer = document.querySelector('light-viewer') as HTMLElement & { iesText: string };
const status = document.querySelector('#status')!;
viewer.addEventListener('load', () => {
  status.textContent = 'Drag to orbit. Scroll to zoom. Edit the IES source to update the preview.';
});
viewer.addEventListener('error', (event) => {
  const detail: unknown = event instanceof CustomEvent ? event.detail : undefined;
  status.textContent =
    typeof detail === 'object' && detail !== null && 'message' in detail && typeof detail.message === 'string'
      ? detail.message
      : 'Unable to preview this IES profile.';
});
window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isUpdateMessage(event.data)) return;
  status.textContent = 'Loading photometric profile…';
  try {
    viewer.iesText = event.data.text;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  }
});
// VS Code's acquired API posts only to this extension host.
// oxlint-disable-next-line unicorn/require-post-message-target-origin
api.postMessage({ type: 'ready' });
