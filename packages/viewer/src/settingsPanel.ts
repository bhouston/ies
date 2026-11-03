import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ViewerSettingsPanel, type SettingsPanelMode } from './react/ViewerSettingsPanel.js';
import { DEFAULT_VIEWER_SETTINGS, type ViewerSettings } from './settings.js';
export type { SettingsPanelMode } from './react/ViewerSettingsPanel.js';

/** Custom-element bridge to the same React/Tailwind controls used by the React viewer. */
export class SettingsPanel {
  readonly root: HTMLDivElement;
  #host: HTMLElement;
  #reactRoot?: Root;
  #settings: ViewerSettings = { ...DEFAULT_VIEWER_SETTINGS };
  #panelMode: SettingsPanelMode = 'closed';
  #generation = 0;
  #change: (patch: Partial<ViewerSettings>) => void;
  #mode: (mode: SettingsPanelMode) => void;
  #error: (error: unknown) => void;
  constructor(
    host: HTMLElement,
    change: (patch: Partial<ViewerSettings>) => void,
    mode: (mode: SettingsPanelMode) => void,
    error: (error: unknown) => void,
  ) {
    this.#host = host;
    this.#change = change;
    this.#mode = mode;
    this.#error = error;
    this.root = host.ownerDocument.createElement('div');
    this.root.className = 'viewer-controls-root';
  }
  connect(): void {
    ++this.#generation;
    this.#reactRoot ??= createRoot(this.root);
    this.#render();
  }
  disconnect(): void {
    const generation = ++this.#generation;
    // A parent React tree may currently be removing this custom element. Unmount
    // its nested root after that commit, and reuse it on synchronous reconnection.
    queueMicrotask(() => {
      if (generation !== this.#generation || this.#host.isConnected) return;
      this.#reactRoot?.unmount();
      this.#reactRoot = undefined;
    });
  }
  update(settings: ViewerSettings, mode: SettingsPanelMode): void {
    this.#settings = settings;
    this.#panelMode = mode;
    // Exports hide controls immediately, independently of React scheduling.
    this.root.hidden = mode === 'hidden';
    this.#render();
  }
  #render(): void {
    this.#reactRoot?.render(
      createElement(ViewerSettingsPanel, {
        settings: this.#settings,
        mode: this.#panelMode,
        onChange: this.#change,
        onModeChange: this.#mode,
        onError: this.#error,
      }),
    );
  }
}
