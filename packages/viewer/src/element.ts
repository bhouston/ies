import { createLightViewer, type LightViewerController } from './viewer.js';

// Importing this module on an SSR server is safe; registration occurs only in a browser.
// oxlint-disable-next-line typescript/no-extraneous-class
const ElementBase = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;
export class LightViewerElement extends ElementBase {
  static observedAttributes = ['src', 'exposure'];
  #viewer?: LightViewerController;
  #text = '';
  #request?: AbortController;
  #revision = 0;
  #host?: HTMLDivElement;
  #status?: HTMLDivElement;
  get iesText(): string {
    return this.#text;
  }
  set iesText(value: string) {
    this.#request?.abort();
    ++this.#revision;
    this.#text = value;
    if (this.#viewer && value) this.#show(value);
  }
  get data(): string {
    return this.iesText;
  }
  set data(value: string) {
    this.iesText = value;
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
      if (this.#text) this.#show(this.#text);
      else if (this.getAttribute('src')) void this.#fetchSource();
    } catch (error) {
      this.#error(error);
    }
  }
  disconnectedCallback(): void {
    ++this.#revision;
    this.#request?.abort();
    this.#viewer?.dispose();
    this.#viewer = undefined;
  }
  attributeChangedCallback(name: string): void {
    if (name === 'src') {
      this.#text = '';
      this.#request?.abort();
      ++this.#revision;
      if (this.#viewer) void this.#fetchSource();
    } else if (this.#viewer) this.#applyExposure();
  }
  #applyExposure(): void {
    const value = this.getAttribute('exposure');
    try {
      this.#viewer?.setExposure(value === null ? 1 : Number(value));
    } catch (error) {
      this.#error(error);
    }
  }
  #show(text: string): void {
    try {
      const profile = this.#viewer!.load(text);
      this.#status!.textContent = '';
      this.dispatchEvent(new CustomEvent('load', { detail: { profile }, bubbles: true, composed: true }));
    } catch (error) {
      this.#error(error);
    }
  }
  async #fetchSource(): Promise<void> {
    this.#request?.abort();
    const revision = ++this.#revision;
    const src = this.getAttribute('src');
    if (!src) return;
    const request = new AbortController();
    this.#request = request;
    this.#status!.textContent = 'Loading IES…';
    try {
      const response = await fetch(src, { signal: request.signal });
      if (!response.ok) throw new Error(`Failed to load IES: HTTP ${response.status}`);
      const text = await response.text();
      if (revision !== this.#revision || !this.isConnected) return;
      this.#text = text;
      this.#show(text);
    } catch (error) {
      if (!request.signal.aborted && revision === this.#revision) this.#error(error);
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
