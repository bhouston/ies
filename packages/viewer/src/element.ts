import { ErrorOverlay } from './errorOverlay.js';
import type { PhotometricDocument } from '@ies-tools/core';
import {
  DEFAULT_VIEWER_SETTINGS,
  VIEWER_SETTINGS_ATTRIBUTES,
  resolveViewerSettings,
  settingsEqual,
  viewerSettingFromAttribute,
  type ViewerSettings,
} from './settings.js';
import { SettingsPanel, type SettingsPanelMode, type ViewerTab } from './settingsPanel.js';
import type { IESProfile } from '@ies-tools/core';
import { ELEMENT_STYLES } from './elementStyles.js';
import { createLightViewer, type LightViewerCaptureOptions, type LightViewerController } from './viewer.js';
import { createPhotometrySourceLoader, parseLampSetIndex, type PhotometryFormat } from './source.js';
import { ViewerReadiness } from './readiness.js';

// Importing this module on an SSR server is safe; registration occurs only in a browser.
// oxlint-disable-next-line typescript/no-extraneous-class
const ElementBase = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;
export class LightViewerElement extends ElementBase {
  static observedAttributes = [
    'src',
    'format',
    'lamp-set-index',
    'settings-panel',
    'charts',
    'errors',
    ...VIEWER_SETTINGS_ATTRIBUTES,
  ];
  #viewer?: LightViewerController;
  #settings: ViewerSettings = { ...DEFAULT_VIEWER_SETTINGS };
  #reflecting = false;
  #applying = false;
  #panel?: SettingsPanel;
  #tab: ViewerTab = '3d';
  #profile?: IESProfile;
  get settings(): ViewerSettings {
    return { ...this.#settings };
  }
  set settings(patch: Partial<ViewerSettings>) {
    let next = resolveViewerSettings(patch, this.#settings);
    if (this.#viewer) {
      // The viewer's own settingschange for this call is applied below, not re-entered.
      this.#applying = true;
      try {
        this.#viewer.setSettings(next);
      } finally {
        this.#applying = false;
      }
      // Auto exposure replaces `exposure` with the metered EV.
      next = this.#viewer.getSettings();
    }
    if (settingsEqual(next, this.#settings)) {
      this.#updatePanel();
      return;
    }
    const previousSettings = this.settings;
    this.#settings = next;
    this.#reflecting = true;
    try {
      // Reflect only changed settings, and never rewrite an attribute that already matches: setAttribute
      // flushes queued callbacks, which would be ignored here, for attributes not yet applied during upgrade.
      for (const [name, key] of [
        ['show-wall', 'showWall'],
        ['wall-distance', 'wallDistance'],
        ['floor-distance', 'floorDistance'],
        ['light-offset', 'lightOffset'],
        ['tone-mapping', 'toneMapping'],
        ['auto-exposure', 'autoExposure'],
        ['exposure', 'exposure'],
        ['helper', 'helper'],
        ['photometric-solid', 'photometricSolid'],
        ['rulers', 'rulers'],
        ['view-mode', 'viewMode'],
        ['units', 'units'],
      ] as const)
        if (next[key] !== previousSettings[key] && this.getAttribute(name) !== String(next[key]))
          this.setAttribute(name, String(next[key]));
    } finally {
      this.#reflecting = false;
    }
    this.#updatePanel();
    this.dispatchEvent(
      new CustomEvent('settingschange', {
        detail: { settings: this.settings, previousSettings },
        bubbles: true,
        composed: true,
      }),
    );
  }
  #updatePanel(): void {
    const value = this.getAttribute('charts');
    const charts = value !== null && value !== 'false';
    this.#host?.classList.toggle('with-tabs', charts);
    this.#panel?.update(
      this.settings,
      this.#panelMode(),
      charts
        ? {
            tab: this.#tab,
            profile: this.#profile,
            onTabChange: (tab) => {
              this.#tab = tab;
              this.#updatePanel();
            },
          }
        : undefined,
    );
  }
  #panelMode(): SettingsPanelMode {
    const value = this.getAttribute('settings-panel');
    return value === 'open' || value === 'hidden' ? value : 'closed';
  }
  #readiness = new ViewerReadiness();
  /**
   * Resolve once the current source is loaded and its frame rendered (immediately for an empty viewer).
   * If the source changes first, it waits for the new source instead. Rejects with the load's error (network,
   * parse, unsupported type), if the WebGL context is lost or failed to start, or if the element is disconnected.
   */
  whenReady(): Promise<void> {
    return this.#readiness.whenReady();
  }
  /**
   * Wait for {@link whenReady}, then render the current settings and encode the opaque 3D scene only: no legend,
   * ruler labels, settings panel or charts. Without `width`/`height` the image matches the canvas's pixels.
   */
  toBlob(options?: LightViewerCaptureOptions): Promise<Blob> {
    return this.#readiness.toBlob(options);
  }
  #text?: string;
  #document?: PhotometricDocument;
  #loader = createPhotometrySourceLoader();
  #revision = 0;
  #host?: HTMLDivElement;
  #status?: HTMLDivElement;
  #errors?: ErrorOverlay;
  get photometryText(): string {
    return this.#text ?? '';
  }
  set photometryText(value: string) {
    this.#loader.cancel();
    this.#document = undefined;
    this.#text = value;
    if (this.#viewer) void this.#load();
  }
  get iesText(): string {
    return this.photometryText;
  }
  set iesText(value: string) {
    this.photometryText = value;
  }
  get data(): string {
    return this.photometryText;
  }
  set data(value: string) {
    this.photometryText = value;
  }
  /** Supply the shared native-source model directly, without serializing to IES. */
  get photometry(): PhotometricDocument | undefined {
    return this.#document;
  }
  set photometry(value: PhotometricDocument | undefined) {
    this.#loader.cancel();
    this.#document = value;
    if (value) this.#text = undefined;
    if (this.#viewer) void this.#load();
  }
  connectedCallback(): void {
    if (this.#viewer) return;
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = ELEMENT_STYLES;
      this.#host = document.createElement('div');
      this.#host.className = 'viewport';
      this.#status = document.createElement('div');
      this.#status.className = 'status';
      this.#status.setAttribute('role', 'status');
      this.#errors = new ErrorOverlay(this);
      this.#panel = new SettingsPanel(
        this,
        (patch) => {
          this.settings = patch;
        },
        (mode) => this.setAttribute('settings-panel', mode),
        (error) => {
          this.#updatePanel();
          this.#error(error);
        },
      );
      root.append(style, this.#host, this.#status, this.#panel.root, this.#errors.root);
    }
    this.#readiness.pending();
    try {
      this.#viewer = createLightViewer(this.#host!, this.#settings);
      this.#readiness.attach(this.#viewer);
      // Dragging the light changes settings inside the viewer; reflect them like panel edits.
      this.#viewer.addEventListener('settingschange', ({ detail }) => {
        if (!this.#applying && !settingsEqual(detail.settings, this.#settings)) this.settings = detail.settings;
      });
      this.#panel?.connect();
      this.#updatePanel();
      void this.#load();
    } catch (error) {
      this.#readiness.finish(error);
      this.#error(error);
    }
  }
  disconnectedCallback(): void {
    this.#readiness.disconnect();
    ++this.#revision;
    this.#loader.cancel();
    this.#panel?.disconnect();
    this.#viewer?.dispose();
    this.#viewer = undefined;
  }
  attributeChangedCallback(name: string): void {
    if (this.#reflecting) return;
    if (name === 'errors') {
      this.#errors?.syncVisibility();
      return;
    }
    if (name === 'settings-panel' || name === 'charts') {
      this.#updatePanel();
      return;
    }
    if ((VIEWER_SETTINGS_ATTRIBUTES as readonly string[]).includes(name)) {
      try {
        this.settings = viewerSettingFromAttribute(name, this.getAttribute(name));
      } catch (error) {
        this.#error(error);
      }
      return;
    }
    this.#loader.cancel();
    if (name === 'src') {
      this.#text = undefined;
      this.#document = undefined;
    }
    if (this.#viewer) void this.#load();
  }
  async #load(): Promise<void> {
    if (!this.#viewer) return;
    const revision = ++this.#revision;
    if (!this.#readiness.loading) this.#readiness.pending();
    try {
      this.#errors?.clear();
      this.#status!.textContent = 'Loading photometry…';
      const next = await this.#loader.load({
        document: this.#document,
        text: this.#text,
        src: this.getAttribute('src') ?? undefined,
        format: (this.getAttribute('format') as PhotometryFormat | undefined) ?? undefined,
        lampSetIndex: parseLampSetIndex(this.getAttribute('lamp-set-index')),
      });
      if (revision !== this.#revision || !this.isConnected || !this.#viewer) return;
      if (!next) {
        this.#viewer.clear();
        this.#profile = undefined;
        this.#updatePanel();
        this.#status!.textContent = '';
        this.#readiness.finish();
        return;
      }
      this.#viewer.setDocument(next);
      this.#profile = next.profile;
      this.#updatePanel();
      this.#status!.textContent = '';
      this.#readiness.finish();
      this.dispatchEvent(
        new CustomEvent('load', {
          detail: { profile: next.profile, document: next, sourceFormat: next.sourceFormat },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      if (revision === this.#revision && this.isConnected) {
        this.#readiness.finish(error);
        this.#error(error, 'Unable to load photometry');
      }
    }
  }
  #error(error: unknown, title = 'Viewer error'): void {
    const message = error instanceof Error ? error.message : String(error);
    if (this.#status) this.#status.textContent = '';
    const source = this.#document
      ? 'Provided photometric document'
      : this.#text !== undefined
        ? 'Inline photometry'
        : this.getAttribute('src');
    this.#errors?.show(title, error, source);
    this.dispatchEvent(new CustomEvent('error', { detail: { message, error }, bubbles: true, composed: true }));
  }
}
if (typeof customElements !== 'undefined' && !customElements.get('light-viewer'))
  customElements.define('light-viewer', LightViewerElement);
