import 'ies-viewer/element';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { App } from './App.js';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
// Install the React message listener before telling the host to publish the initial document.
flushSync(() => createRoot(document.querySelector('#root')!).render(<App />));
// VS Code's acquired API posts only to this extension host.
// oxlint-disable-next-line unicorn/require-post-message-target-origin
api.postMessage({ type: 'ready' });
