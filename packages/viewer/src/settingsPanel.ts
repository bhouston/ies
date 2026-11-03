import type { IESProfile } from '@ies-tools/core';
import { createElement, Fragment } from 'react';
import { ChartTabs, type ViewerTab } from './react/ChartTabs.js';
import { createRoot, type Root } from 'react-dom/client';
import { ViewerSettingsPanel, type SettingsPanelMode } from './react/ViewerSettingsPanel.js';
import { DEFAULT_VIEWER_SETTINGS, type ViewerSettings } from './settings.js';
export type { SettingsPanelMode } from './react/ViewerSettingsPanel.js';
export type { ViewerTab } from './react/ChartTabs.js';
/** Chart tab state; undefined renders no tabs. */
export interface ChartsState {
  tab: ViewerTab;
  profile?: IESProfile;
  onTabChange: (tab: ViewerTab) => void;
}

/** Custom-element bridge to the same React/Tailwind controls used by the React viewer. */
export class SettingsPanel {
  readonly root: HTMLDivElement;
  #host: HTMLElement;
  #reactRoot?: Root;
  #settings: ViewerSettings = { ...DEFAULT_VIEWER_SETTINGS };
  #panelMode: SettingsPanelMode = 'closed';
  #charts?: ChartsState;
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
  update(settings: ViewerSettings, mode: SettingsPanelMode, charts?: ChartsState): void {
    this.#settings = settings;
    this.#panelMode = mode;
    this.#charts = charts;
    // Exports hide controls immediately, independently of React scheduling.
    this.root.hidden = mode === 'hidden';
    this.#render();
  }
  #render(): void {
    const charts = this.#charts;
    this.#reactRoot?.render(
      createElement(
        Fragment,
        null,
        charts &&
          createElement(ChartTabs, {
            ...charts,
            mountingHeight: this.#settings.floorDistance,
          }),
        createElement(ViewerSettingsPanel, {
          settings: this.#settings,
          // The scene options apply to the 3D tab only.
          mode: charts && charts.tab !== '3d' ? 'hidden' : this.#panelMode,
          onChange: this.#change,
          onModeChange: this.#mode,
          onError: this.#error,
        }),
      ),
    );
  }
}
