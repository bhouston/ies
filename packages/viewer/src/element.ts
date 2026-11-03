import type { PhotometricDocument } from 'ies-core';
import { createLightViewer, type LightViewerController } from './viewer.js';
import { createPhotometrySourceLoader, parseLampSetIndex, type PhotometryFormat } from './source.js';

// Importing this module on an SSR server is safe; registration occurs only in a browser.
// oxlint-disable-next-line typescript/no-extraneous-class
const ElementBase = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;
export class LightViewerElement extends ElementBase {
  static observedAttributes = ['src', 'exposure', 'format', 'lamp-set-index'];
  #viewer?: LightViewerController;
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
      style.textContent =
        ':host{display:block;height:480px;background:#000;position:relative;min-width:0} .viewport{width:100%;height:100%} .status{position:absolute;bottom:8px;left:12px;color:#fff;font:13px system-ui;pointer-events:none} canvas{display:block}';
      this.#host = document.createElement('div');
      this.#host.className = 'viewport';
      this.#status = document.createElement('div');
      this.#status.className = 'status';
      this.#status.setAttribute('role', 'status');
      root.append(style, this.#host, this.#status);
    }
    try {
      this.#viewer = createLightViewer(this.#host!);
      this.#applyExposure();
      void this.#load();
    } catch (error) {
      this.#error(error);
    }
  }
  disconnectedCallback(): void {
    ++this.#revision;
    this.#loader.cancel();
    this.#viewer?.dispose();
    this.#viewer = undefined;
  }
  attributeChangedCallback(name: string): void {
    if (name === 'exposure') {
      if (this.#viewer) this.#applyExposure();
      return;
    }
    this.#loader.cancel();
    if (name === 'src') {
      this.#text = undefined;
      this.#document = undefined;
    }
    if (this.#viewer) void this.#load();
  }
  #applyExposure(): void {
    const value = this.getAttribute('exposure');
    try {
      this.#viewer?.setExposure(value === null ? 1 : Number(value));
    } catch (error) {
      this.#error(error);
    }
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
