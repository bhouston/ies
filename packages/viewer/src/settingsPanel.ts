import { TONE_MAPPING_OPTIONS, type ViewerSettings } from './settings.js';

export type SettingsPanelMode = 'open' | 'closed' | 'hidden';
/** Small shadow-DOM overlay shared by every custom-element integration, including VS Code. */
export class SettingsPanel {
  readonly root: HTMLDivElement;
  readonly button: HTMLButtonElement;
  readonly panel: HTMLDivElement;
  #host: HTMLElement;
  #change: (patch: Partial<ViewerSettings>) => void;
  #mode: (mode: SettingsPanelMode) => void;
  #error: (error: unknown) => void;
  #inputs = new Map<keyof ViewerSettings, HTMLInputElement | HTMLSelectElement>();
  #outside = (event: Event) => {
    if (!this.panel.hidden && !event.composedPath().includes(this.panel) && !event.composedPath().includes(this.button))
      this.#mode('closed');
  };
  #escape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !this.panel.hidden) {
      event.preventDefault();
      this.#mode('closed');
      this.button.focus();
    }
  };
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
    const document = host.ownerDocument;
    this.root = document.createElement('div');
    this.root.className = 'settings-ui';
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'settings-toggle';
    this.button.textContent = '⚙';
    this.button.setAttribute('aria-label', 'Viewer options');
    this.button.setAttribute('aria-controls', 'viewer-options');
    this.button.addEventListener('click', () => this.#mode(this.panel.hidden ? 'open' : 'closed'));
    this.panel = document.createElement('div');
    this.panel.id = 'viewer-options';
    this.panel.className = 'settings-panel';
    this.panel.setAttribute('role', 'region');
    this.panel.setAttribute('aria-label', 'Viewer options');
    const heading = document.createElement('div');
    heading.className = 'settings-heading';
    const title = document.createElement('strong');
    title.textContent = 'Viewer options';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close viewer options');
    close.addEventListener('click', () => {
      this.#mode('closed');
      this.button.focus();
    });
    heading.append(title, close);
    this.panel.append(heading);
    const add = (key: keyof ViewerSettings, text: string, input: HTMLInputElement | HTMLSelectElement) => {
      const label = document.createElement('label');
      label.textContent = text;
      input.name = key;
      label.append(input);
      this.panel.append(label);
      this.#inputs.set(key, input);
      input.addEventListener('change', () => {
        try {
          const value =
            input instanceof document.defaultView!.HTMLSelectElement
              ? input.value
              : input.type === 'checkbox'
                ? input.checked
                : input.valueAsNumber;
          this.#change({ [key]: value });
        } catch (reason) {
          this.#error(reason);
        }
      });
    };
    const wall = document.createElement('input');
    wall.type = 'checkbox';
    add('showWall', 'Back wall', wall);
    for (const [key, label, min, max, step] of [
      ['wallDistance', 'Wall distance (m)', 0.1, 100, 0.1],
      ['floorDistance', 'Floor distance (m)', 0.1, 100, 0.1],
      ['exposure', 'Exposure', 0, Infinity, 0.1],
    ] as const) {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(min);
      if (Number.isFinite(max)) input.max = String(max);
      input.step = String(step);
      add(key, label, input);
    }
    const tone = document.createElement('select');
    for (const option of TONE_MAPPING_OPTIONS) {
      const element = document.createElement('option');
      element.value = option.value;
      element.textContent = option.label;
      tone.append(element);
    }
    add('toneMapping', 'Tone mapping', tone);
    this.root.append(this.button, this.panel);
  }
  connect(): void {
    this.#host.ownerDocument.addEventListener('pointerdown', this.#outside);
    this.#host.ownerDocument.addEventListener('keydown', this.#escape);
  }
  disconnect(): void {
    this.#host.ownerDocument.removeEventListener('pointerdown', this.#outside);
    this.#host.ownerDocument.removeEventListener('keydown', this.#escape);
  }
  update(settings: ViewerSettings, mode: SettingsPanelMode): void {
    this.root.hidden = mode === 'hidden';
    this.panel.hidden = mode !== 'open';
    this.button.setAttribute('aria-expanded', String(mode === 'open'));
    for (const [key, input] of this.#inputs) {
      if (key === 'showWall') (input as HTMLInputElement).checked = settings.showWall;
      else input.value = String(settings[key]);
    }
  }
}
export const SETTINGS_PANEL_CSS = `
.settings-ui{font:13px/1.4 system-ui,sans-serif;color:#e5e7eb;position:absolute;inset:0;pointer-events:none;z-index:2}
.settings-ui[hidden],.settings-panel[hidden]{display:none}
.settings-ui .settings-toggle{position:absolute;right:12px;bottom:12px;width:36px;height:36px;font-size:23px;line-height:1;display:grid;place-items:center;padding:0;pointer-events:auto}
.settings-ui button,.settings-ui input,.settings-ui select{color:inherit;background:#20252e;border:1px solid #535b69;border-radius:5px;font:inherit}
.settings-ui button{cursor:pointer}.settings-ui button:focus-visible,.settings-ui input:focus-visible,.settings-ui select:focus-visible{outline:2px solid #8bd4ff;outline-offset:2px}
.settings-panel{pointer-events:auto;position:absolute;right:12px;bottom:56px;width:min(290px,calc(100% - 24px));max-height:calc(100% - 72px);overflow:auto;box-sizing:border-box;padding:14px;background:rgba(14,18,24,.96);border:1px solid #49515e;border-radius:9px;box-shadow:0 8px 30px #0009}
.settings-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.settings-heading button{width:26px;height:26px;font-size:20px}
.settings-panel label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0}.settings-panel input[type=number]{box-sizing:border-box;width:88px;padding:5px}.settings-panel select{width:130px;padding:5px}.settings-panel input[type=checkbox]{accent-color:#7dd3fc}
`;
