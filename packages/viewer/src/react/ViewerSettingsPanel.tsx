import { useEffect, useId, useRef } from 'react';
import { TONE_MAPPING_OPTIONS, type ViewerSettings } from '../settings.js';

/** `open` shows the panel, `closed` shows only its toggle button, and `hidden` shows neither. */
export type SettingsPanelMode = 'open' | 'closed' | 'hidden';
/** Props for {@link ViewerSettingsPanel}. */
export interface ViewerSettingsPanelProps {
  /** Current settings to display. */
  settings: ViewerSettings;
  mode?: SettingsPanelMode;
  /** Called with each changed setting. */
  onChange: (patch: Partial<ViewerSettings>) => void;
  /** Called when the user opens or closes the panel. */
  onModeChange: (mode: SettingsPanelMode) => void;
  /** Called when an entered value is rejected. */
  onError?: (error: unknown) => void;
}

/**
 * Shared React controls for the custom element, React viewer, and embedded applications.
 *
 * @param props - See {@link ViewerSettingsPanelProps}.
 */
export function ViewerSettingsPanel({
  settings,
  mode = 'closed',
  onChange,
  onModeChange,
  onError,
}: ViewerSettingsPanelProps) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (mode !== 'open') return;
    const document = button.current?.ownerDocument;
    if (!document) return;
    const outside = (event: Event) => {
      const path = event.composedPath();
      if (!path.includes(panel.current!) && !path.includes(button.current!)) onModeChange('closed');
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onModeChange('closed');
      button.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [mode, onModeChange]);
  const change = (patch: Partial<ViewerSettings>) => {
    try {
      onChange(patch);
    } catch (error) {
      if (onError) onError(error);
      else throw error;
    }
  };
  const close = () => {
    onModeChange('closed');
    button.current?.focus();
  };
  const control =
    'rounded-md border border-border bg-input px-2 py-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <div
      className="settings-ui pointer-events-none absolute inset-0 z-20 font-sans text-[length:var(--vscode-font-size,13px)] text-foreground"
      hidden={mode === 'hidden'}
    >
      <button
        ref={button}
        type="button"
        aria-label="Viewer options"
        title="Viewer options"
        aria-controls={id}
        aria-expanded={mode === 'open'}
        className={`settings-toggle pointer-events-auto absolute right-3 bottom-3 grid size-9 cursor-pointer place-items-center text-xl shadow-sm ${control}`}
        onClick={() => onModeChange(mode === 'open' ? 'closed' : 'open')}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path
            d="m9 3-.8 2.2-2 .9L4 5.5 2.5 8l1.6 1.7-.2 2.3L2 13.5 3.5 16l2.3-.4 1.8 1.4.4 2.4h3l.8-2.2 2-.9 2.2.6 1.5-2.5-1.6-1.7.2-2.3L18 8.5 16.5 6l-2.3.4-1.8-1.4L12 3Z"
            transform="translate(2 1)"
          />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      <section
        ref={panel}
        id={id}
        className="settings-panel pointer-events-auto absolute right-3 bottom-14 max-h-[calc(100%-72px)] w-[min(300px,calc(100%-24px))] overflow-auto rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-xl"
        aria-label="Viewer options"
        hidden={mode !== 'open'}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <strong className="font-semibold">Viewer options</strong>
          <button
            type="button"
            aria-label="Close viewer options"
            className={`grid size-7 cursor-pointer place-items-center text-lg ${control}`}
            onClick={close}
          >
            ×
          </button>
        </div>
        {(
          [
            ['showWall', 'Back wall'],
            ['helper', 'Helper'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="my-3 flex items-center justify-between gap-3">
            {label}
            <input
              name={key}
              type="checkbox"
              checked={settings[key]}
              className="size-4 accent-primary focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => change({ [key]: event.currentTarget.checked })}
            />
          </label>
        ))}
        {(
          [
            ['wallDistance', 'Wall distance (m)', 0.1, 100],
            ['floorDistance', 'Floor distance (m)', 0.1, 100],
            ['exposure', 'Exposure', 0, undefined],
          ] as const
        ).map(([key, label, min, max]) => (
          <label key={key} className="my-3 flex items-center justify-between gap-3">
            {label}
            <input
              name={key}
              type="number"
              min={min}
              max={max}
              step="0.1"
              value={settings[key]}
              className={`w-24 ${control}`}
              onChange={(event) => change({ [key]: event.currentTarget.valueAsNumber })}
            />
          </label>
        ))}
        <label className="my-3 flex items-center justify-between gap-3">
          Tone mapping
          <select
            name="toneMapping"
            value={settings.toneMapping}
            className={`w-36 ${control}`}
            onChange={(event) => change({ toneMapping: event.currentTarget.value as ViewerSettings['toneMapping'] })}
          >
            {TONE_MAPPING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>
    </div>
  );
}
