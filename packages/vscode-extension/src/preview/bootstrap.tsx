import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { App } from './App.js';

export interface PreviewHostApi {
  postMessage(message: unknown): void;
}

/** A running extension host can still produce the pre-React HTML after a VSIX update. */
export function mountPreview(api: PreviewHostApi): Root {
  let container = document.getElementById('root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'root';
    // Dispose the legacy viewer and loading message rather than leaving a second canvas behind.
    document.body.replaceChildren(container);
  }
  const root = createRoot(container);
  // Install App's message listeners before the host can synchronously send the initial file.
  flushSync(() => root.render(<App />));
  // VS Code's acquired API posts only to this extension host.
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  api.postMessage({ type: 'ready' });
  return root;
}
