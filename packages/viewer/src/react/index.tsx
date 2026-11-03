import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { type IESProfile, type PhotometricDocument } from 'ies-core';
import { createPhotometrySourceLoader, type PhotometryFormat, type PhotometryLoadInfo } from '../source.js';
import { createLightViewer } from '../viewer.js';
import type { ViewerSettings, ViewerSettingsChangeDetail } from '../settings.js';

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
  className?: string;
  style?: CSSProperties;
  onLoad?: (profile: IESProfile, info: PhotometryLoadInfo) => void;
  onError?: (error: Error) => void;
  onSettingsChange?: (detail: ViewerSettingsChangeDetail) => void;
}
export function LightViewer({
  document: photometry,
  text,
  format,
  lampSetIndex,
  profile,
  iesText,
  src,
  exposure = 1,
  showWall = true,
  wallDistance = 2,
  floorDistance = 2,
  toneMapping = 'aces',
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
  useEffect(() => {
    if (!container.current) return;
    const request = new AbortController();
    const loader = createPhotometrySourceLoader();
    let viewer: ReturnType<typeof createLightViewer> | undefined;
    try {
      viewer = createLightViewer(container.current);
      controller.current = viewer;
      viewer.addEventListener('settingschange', (event) => callbacks.current.onSettingsChange?.(event.detail));
    } catch (reason) {
      const failure = reason instanceof Error ? reason : new Error(String(reason));
      queueMicrotask(() => {
        if (!request.signal.aborted) {
          setError(failure.message);
          callbacks.current.onError?.(failure);
        }
      });
      return () => request.abort();
    }
    const load = async () => {
      try {
        const next = await loader.load({ document: photometry, profile, text, iesText, src, format, lampSetIndex });
        if (request.signal.aborted) return;
        if (next) {
          viewer!.setDocument(next);
          setError('');
          callbacks.current.onLoad?.(next.profile, { document: next, sourceFormat: next.sourceFormat });
        }
      } catch (reason) {
        if (request.signal.aborted) return;
        const failure = reason instanceof Error ? reason : new Error(String(reason));
        setError(failure.message);
        callbacks.current.onError?.(failure);
      }
    };
    void load();
    return () => {
      request.abort();
      loader.cancel();
      viewer?.dispose();
      controller.current = undefined;
    };
  }, [photometry, profile, text, iesText, src, format, lampSetIndex]);
  /* oxlint-disable react/exhaustive-effect-dependencies */
  useEffect(() => {
    try {
      controller.current?.setSettings({ exposure, showWall, wallDistance, floorDistance, toneMapping });
    } catch (reason) {
      const failure = reason instanceof Error ? reason : new Error(String(reason));
      callbacks.current.onError?.(failure);
    }
    // A new document recreates the controller, so reapply exposure to that controller.
  }, [
    exposure,
    showWall,
    wallDistance,
    floorDistance,
    toneMapping,
    photometry,
    profile,
    text,
    iesText,
    src,
    format,
    lampSetIndex,
  ]);
  /* oxlint-enable react/exhaustive-effect-dependencies */
  return (
    <div className={className} style={{ height: 480, position: 'relative', background: '#000', ...style }}>
      <div ref={container} style={{ width: '100%', height: '100%' }} />
      {error && (
        <p role="alert" style={{ position: 'absolute', bottom: 8, left: 12, color: '#fff' }}>
          {error}
        </p>
      )}
    </div>
  );
}

export { IntensityGraph } from './IntensityGraph.js';
export type { IntensityGraphProps } from './IntensityGraph.js';
export { IsoluxGraph } from './IsoluxGraph.js';
export type { IsoluxGraphProps } from './IsoluxGraph.js';
