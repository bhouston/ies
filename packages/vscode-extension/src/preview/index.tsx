import '@ies-tools/viewer/element';
import { mountPreview } from './bootstrap.js';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
mountPreview(acquireVsCodeApi());
