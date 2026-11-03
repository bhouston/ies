import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { type IESProfile, type PhotometricDocument } from 'ies-core';
import { createPhotometrySourceLoader, type PhotometryFormat, type PhotometryLoadInfo } from '../source.js';
import { createLightViewer } from '../viewer.js';
import {
  DEFAULT_VIEWER_SETTINGS,
  resolveViewerSettings,
  type ViewerSettings,
  type ViewerSettingsChangeDetail,
} from '../settings.js';
import { ViewerSettingsPanel, type SettingsPanelMode } from './ViewerSettingsPanel.js';

export interface LightViewerProps extends Partial<ViewerSettings> {
  /** A native-source document takes precedence, followed by profile, text, iesText, and src. */
  document?: PhotometricDocument;
  text?: string;
  format?: PhotometryFormat;
  /** Zero-based LDT alternative lamp configuration. */
  lampSetIndex?: number;
  profile?: IESProfile;
  iesText?: string;
  src?: string;
  exposure?: number;
  settingsPanel?: SettingsPanelMode;
  className?: string;
  style?: CSSProperties;
  onLoad?: (profile: IESProfile, info: PhotometryLoadInfo) => void;
  onError?: (error: Error) => void;
  onSettingsChange?: (detail: ViewerSettingsChangeDetail) => void;
}
function providedSettings(settings: Partial<ViewerSettings>): Partial<ViewerSettings> {
  return Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined));
}

export function LightViewer({
  document: photometry,
  text,
  format,
  lampSetIndex,
  profile,
  iesText,
  src,
  exposure,
  showWall,
  wallDistance,
  floorDistance,
  toneMapping,
  settingsPanel = 'closed',
  className,
  style,
  onLoad,
  onError,
  onSettingsChange,
}: LightViewerProps) {
  const container = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof createLightViewer> | undefined>(undefined);
  const callbacks = useRef({ onLoad, onError, onSettingsChange });
  useEffect(() => {
    callbacks.current = { onLoad, onError, onSettingsChange };
  }, [onLoad, onError, onSettingsChange]);
  const [error, setError] = useState('');
  const [panelState, setPanelState] = useState({ external: settingsPanel, mode: settingsPanel });
  let panelMode = panelState.mode;
  if (panelState.external !== settingsPanel) {
    setPanelState({ external: settingsPanel, mode: settingsPanel });
    panelMode = settingsPanel;
  }
  const setPanelMode = (mode: SettingsPanelMode) => setPanelState({ external: settingsPanel, mode });
  const [panelSettings, setPanelSettings] = useState<ViewerSettings>(() => {
    try {
      return resolveViewerSettings(providedSettings({ exposure, showWall, wallDistance, floorDistance, toneMapping }));
    } catch {
      return { ...DEFAULT_VIEWER_SETTINGS };
    }
  });
  const reportError = (reason: unknown) => {
    const failure = reason instanceof Error ? reason : new Error(String(reason));
    setError(failure.message);
    callbacks.current.onError?.(failure);
  };
  useEffect(() => {
    if (!container.current) return;
    let active = true;
    try {
      const viewer = createLightViewer(container.current);
      controller.current = viewer;
      const changed = (event: CustomEvent<ViewerSettingsChangeDetail>) => {
        setPanelSettings(event.detail.settings);
        callbacks.current.onSettingsChange?.(event.detail);
      };
      viewer.addEventListener('settingschange', changed);
      return () => {
        active = false;
        viewer.removeEventListener('settingschange', changed);
        viewer.dispose();
        controller.current = undefined;
      };
    } catch (reason) {
      const failure = reason instanceof Error ? reason : new Error(String(reason));
      queueMicrotask(() => {
        if (active) {
          setError(failure.message);
          callbacks.current.onError?.(failure);
        }
      });
      return () => {
        active = false;
      };
    }
  }, []);
  useEffect(() => {
    const loader = createPhotometrySourceLoader();
    let active = true;
    void loader
      .load({ document: photometry, profile, text, iesText, src, format, lampSetIndex })
      .then((next) => {
        if (!active || !next || !controller.current) return;
        controller.current.setDocument(next);
        setError('');
        callbacks.current.onLoad?.(next.profile, { document: next, sourceFormat: next.sourceFormat });
      })
      .catch((reason) => {
        if (!active) return;
        const failure = reason instanceof Error ? reason : new Error(String(reason));
        setError(failure.message);
        callbacks.current.onError?.(failure);
      });
    return () => {
      active = false;
      loader.cancel();
    };
  }, [photometry, profile, text, iesText, src, format, lampSetIndex]);
  useEffect(() => {
    let active = true;
    try {
      const patch = providedSettings({ exposure, showWall, wallDistance, floorDistance, toneMapping });
      controller.current?.setSettings(patch);
    } catch (reason) {
      const failure = reason instanceof Error ? reason : new Error(String(reason));
      queueMicrotask(() => {
        if (active) {
          setError(failure.message);
          callbacks.current.onError?.(failure);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [exposure, showWall, wallDistance, floorDistance, toneMapping]);
  const updateSettings = (patch: Partial<ViewerSettings>) => {
    const next = resolveViewerSettings(patch, controller.current?.getSettings() ?? panelSettings);
    controller.current?.setSettings(next);
    setPanelSettings(next);
  };
  return (
    <div className={className} style={{ height: 480, position: 'relative', background: '#000', ...style }}>
      <div ref={container} style={{ width: '100%', height: '100%' }} />
      <ViewerSettingsPanel
        settings={panelSettings}
        mode={panelMode}
        onChange={updateSettings}
        onModeChange={setPanelMode}
        onError={reportError}
      />
      {error && (
        <p
          role="alert"
          className="absolute bottom-2 left-3 rounded-md bg-popover px-3 py-2 text-sm text-popover-foreground"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export { ViewerSettingsPanel } from './ViewerSettingsPanel.js';
export type { ViewerSettingsPanelProps, SettingsPanelMode } from './ViewerSettingsPanel.js';
export { IntensityGraph } from './IntensityGraph.js';
export type { IntensityGraphProps } from './IntensityGraph.js';
export { IsoluxGraph } from './IsoluxGraph.js';
export type { IsoluxGraphProps } from './IsoluxGraph.js';

export { PhotometryInfoPanel, ValidationChecks } from './PhotometryInfoPanel.js';
export type { PhotometryInfoPanelProps, PhotometryValidation } from './PhotometryInfoPanel.js';
