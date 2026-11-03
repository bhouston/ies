import type { PhotometricDocument } from 'ies-core';
import {
  DEFAULT_VIEWER_SETTINGS,
  VIEWER_SETTINGS_ATTRIBUTES,
  resolveViewerSettings,
  settingsEqual,
  viewerSettingFromAttribute,
  type ViewerSettings,
} from './settings.js';
import { SettingsPanel, type SettingsPanelMode } from './settingsPanel.js';
import { ELEMENT_STYLES } from './elementStyles.js';
import { createLightViewer, type LightViewerController } from './viewer.js';
import { createPhotometrySourceLoader, parseLampSetIndex, type PhotometryFormat } from './source.js';

// Importing this module on an SSR server is safe; registration occurs only in a browser.
// oxlint-disable-next-line typescript/no-extraneous-class
const ElementBase = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;
export class LightViewerElement extends ElementBase {
  static observedAttributes = ['src', 'format', 'lamp-set-index', 'settings-panel', ...VIEWER_SETTINGS_ATTRIBUTES];
  #viewer?: LightViewerController;
  #settings: ViewerSettings = { ...DEFAULT_VIEWER_SETTINGS };
  #reflecting = false;
  #panel?: SettingsPanel;
  get settings(): ViewerSettings {
    return { ...this.#settings };
  }
  set settings(patch: Partial<ViewerSettings>) {
    const next = resolveViewerSettings(patch, this.#settings);
    if (settingsEqual(next, this.#settings)) {
      this.#panel?.update(next, this.#panelMode());
      return;
    }
    const previousSettings = this.settings;
    this.#viewer?.setSettings(next);
    this.#settings = next;
    this.#reflecting = true;
    try {
      for (const [name, value] of [
        ['show-wall', String(next.showWall)],
        ['wall-distance', String(next.wallDistance)],
        ['floor-distance', String(next.floorDistance)],
        ['tone-mapping', next.toneMapping],
        ['exposure', String(next.exposure)],
      ])
        this.setAttribute(name!, value!);
    } finally {
      this.#reflecting = false;
    }
    this.#panel?.update(next, this.#panelMode());
    this.dispatchEvent(
      new CustomEvent('settingschange', {
        detail: { settings: this.settings, previousSettings },
        bubbles: true,
        composed: true,
      }),
    );
  }
  #panelMode(): SettingsPanelMode {
    const value = this.getAttribute('settings-panel');
    return value === 'open' || value === 'hidden' ? value : 'closed';
  }
  #text?: string;
  #document?: PhotometricDocument;
  #loader = createPhotometrySourceLoader();
  #revision = 0;
  #host?: HTMLDivElement;
  #status?: HTMLDivElement;
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
      this.#panel = new SettingsPanel(
        this,
        (patch) => {
          this.settings = patch;
        },
        (mode) => this.setAttribute('settings-panel', mode),
        (error) => {
          this.#panel?.update(this.settings, this.#panelMode());
          this.#error(error);
        },
      );
      root.append(style, this.#host, this.#status, this.#panel.root);
    }
    try {
      this.#viewer = createLightViewer(this.#host!, this.#settings);
      this.#panel?.connect();
      this.#panel?.update(this.settings, this.#panelMode());
      void this.#load();
    } catch (error) {
      this.#error(error);
    }
  }
  disconnectedCallback(): void {
    ++this.#revision;
    this.#loader.cancel();
    this.#panel?.disconnect();
    this.#viewer?.dispose();
    this.#viewer = undefined;
  }
  attributeChangedCallback(name: string): void {
    if (this.#reflecting) return;
    if (name === 'settings-panel') {
      this.#panel?.update(this.settings, this.#panelMode());
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
    try {
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
        this.#status!.textContent = '';
        return;
      }
      this.#viewer.setDocument(next);
      this.#status!.textContent = '';
      this.dispatchEvent(
        new CustomEvent('load', {
          detail: { profile: next.profile, document: next, sourceFormat: next.sourceFormat },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      if (revision === this.#revision && this.isConnected) this.#error(error);
    }
  }
  #error(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (this.#status) this.#status.textContent = message;
    this.dispatchEvent(new CustomEvent('error', { detail: { message, error }, bubbles: true, composed: true }));
  }
}
if (typeof customElements !== 'undefined' && !customElements.get('light-viewer'))
  customElements.define('light-viewer', LightViewerElement);
