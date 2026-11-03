import 'ies-viewer/element';
import { isUpdateMessage } from '../protocol.js';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const api = acquireVsCodeApi();
const viewer = document.querySelector('light-viewer') as HTMLElement & { photometryText: string };
const status = document.querySelector('#status')!;
const lampSelection = document.querySelector<HTMLLabelElement>('#lamp-selection')!;
const lampSelect = document.querySelector<HTMLSelectElement>('#lamp-set')!;
let selectedLampSet: number | undefined;
lampSelect.addEventListener('change', () => {
  selectedLampSet = lampSelect.value === '' ? undefined : Number(lampSelect.value);
  if (selectedLampSet === undefined) viewer.removeAttribute('lamp-set-index');
  else viewer.setAttribute('lamp-set-index', String(selectedLampSet));
});
viewer.addEventListener('load', () => {
  status.textContent = 'Drag to orbit. Scroll to zoom. Edit the photometric source to update the preview.';
});
viewer.addEventListener('error', (event) => {
  const detail: unknown = event instanceof CustomEvent ? event.detail : undefined;
  status.textContent =
    typeof detail === 'object' && detail !== null && 'message' in detail && typeof detail.message === 'string'
      ? detail.message
      : 'Unable to preview this photometric profile.';
});
window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isUpdateMessage(event.data)) return;
  status.textContent = 'Loading photometric profile…';
  try {
    const labels = event.data.lampSetLabels ?? [];
    lampSelection.hidden = labels.length <= 1;
    if (selectedLampSet !== undefined && selectedLampSet >= labels.length) selectedLampSet = undefined;
    lampSelect.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a lamp configuration';
    lampSelect.append(placeholder);
    for (const [index, label] of labels.entries()) {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = label;
      lampSelect.append(option);
    }
    lampSelect.value = selectedLampSet === undefined ? '' : String(selectedLampSet);
    if (selectedLampSet === undefined) viewer.removeAttribute('lamp-set-index');
    else viewer.setAttribute('lamp-set-index', String(selectedLampSet));
    if (event.data.format) viewer.setAttribute('format', event.data.format);
    else viewer.removeAttribute('format');
    viewer.photometryText = event.data.text;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  }
});
// VS Code's acquired API posts only to this extension host.
// oxlint-disable-next-line unicorn/require-post-message-target-origin
api.postMessage({ type: 'ready' });
