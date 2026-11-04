import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { type IESProfile, type PhotometricDocument } from '@ies-tools/core';
import { createPhotometrySourceLoader, type PhotometryFormat, type PhotometryLoadInfo } from '../source.js';
import { createLightViewer } from '../viewer.js';
import {
  DEFAULT_VIEWER_SETTINGS,
  resolveViewerSettings,
  type ViewerSettings,
  type ViewerSettingsChangeDetail,
} from '../settings.js';
import { ViewerSettingsPanel, type SettingsPanelMode } from './ViewerSettingsPanel.js';

/** Props for {@link LightViewer}. Viewer settings such as `exposure` and `showWall` may be passed directly. */
export interface LightViewerProps extends Partial<ViewerSettings> {
  /** A native-source document takes precedence, followed by profile, text, iesText, and src. */
  document?: PhotometricDocument;
  /** Raw IES or EULUMDAT source text; the format is detected automatically. */
  text?: string;
  /** Explicit `ies` or `ldt` input hint for `text` and `src`. */
  format?: PhotometryFormat;
  /** Zero-based LDT alternative lamp configuration. */
  lampSetIndex?: number;
  /** Parsed compatible profile; takes precedence over text and URL sources. */
  profile?: IESProfile;
  /** Compatibility alias for `text`. */
  iesText?: string;
  /** URL to fetch; the request is cancelled when the component unmounts or the source changes. */
  src?: string;
  /** Manual camera exposure as EV100, -6 to 20, used when `autoExposure` is false. Defaults to 6. */
  exposure?: number;
  /** Initial state of the built-in options panel. Defaults to `closed`. */
  settingsPanel?: SettingsPanelMode;
  /** Wrapper class name. */
  className?: string;
  /** Wrapper style; the default height is 480 pixels. */
  style?: CSSProperties;
  /** Called after each source loads, with the normalized profile and its native document. */
  onLoad?: (profile: IESProfile, info: PhotometryLoadInfo) => void;
  /** Called with load and rendering errors; errors are also shown in the component. */
  onError?: (error: Error) => void;
  /** Called when the user changes a setting in the options panel. */
  onSettingsChange?: (detail: ViewerSettingsChangeDetail) => void;
}
function providedSettings(settings: Partial<ViewerSettings>): Partial<ViewerSettings> {
  return Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined));
}

/**
 * Interactive Three.js preview of a luminaire lighting a floor and wall. Requires WebGL2 on a hardware GPU.
 *
 * @param props - See {@link LightViewerProps}.
 *
 * @example
 * ```tsx
 * <LightViewer src="/lights/luminaire.ldt" lampSetIndex={0} autoExposure={false} exposure={7} onError={console.error} />
 * ```
 */
export function LightViewer({
  document: photometry,
  text,
  format,
  lampSetIndex,
  profile,
  iesText,
  src,
  autoExposure,
  exposure,
  showWall,
  wallDistance,
  floorDistance,
  lightOffset,
  toneMapping,
  helper,
  photometricSolid,
  rulers,
  viewMode,
  units,
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
      return resolveViewerSettings(
        providedSettings({
          autoExposure,
          exposure,
          showWall,
          wallDistance,
          floorDistance,
          lightOffset,
          toneMapping,
          helper,
          photometricSolid,
          rulers,
          viewMode,
          units,
        }),
      );
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
        if (!active || !controller.current) return;
        if (!next) {
          controller.current.clear();
          setError('');
          return;
        }
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
      const patch = providedSettings({
        autoExposure,
        exposure,
        showWall,
        wallDistance,
        floorDistance,
        lightOffset,
        toneMapping,
        helper,
        photometricSolid,
        rulers,
        viewMode,
        units,
      });
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
  }, [
    autoExposure,
    exposure,
    showWall,
    wallDistance,
    floorDistance,
    lightOffset,
    toneMapping,
    helper,
    photometricSolid,
    rulers,
    viewMode,
    units,
  ]);
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

// Types referenced by the component props, re-exported so React users need only this entry point.
export type { GraphAxis, UpAxis, Point2 } from '../graphs.js';
export { DEFAULT_VIEWER_SETTINGS, TONE_MAPPING_OPTIONS } from '../settings.js';
export type { ViewerSettings, ViewerSettingsChangeDetail, ToneMappingName, ViewMode, Units } from '../settings.js';
export type { PhotometryFormat, PhotometryLoadInfo } from '../source.js';
export { ConeDiagramGraph, IntensityTableGraph, LuminanceTableGraph } from './TableCharts.js';
export type { ConeDiagramGraphProps, IntensityTableGraphProps, LuminanceTableGraphProps } from './TableCharts.js';
