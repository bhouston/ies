import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { parseIES, type IESProfile } from 'ies-core';
import { createLightViewer } from '../viewer.js';

export interface LightViewerProps {
  /** Supply a profile, raw IES text, or a URL. Profile takes precedence. */
  profile?: IESProfile;
  iesText?: string;
  src?: string;
  exposure?: number;
  className?: string;
  style?: CSSProperties;
  onLoad?: (profile: IESProfile) => void;
  onError?: (error: Error) => void;
}
export function LightViewer({
  profile,
  iesText,
  src,
  exposure = 1,
  className,
  style,
  onLoad,
  onError,
}: LightViewerProps) {
  const container = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof createLightViewer> | undefined>(undefined);
  const callbacks = useRef({ onLoad, onError });
  useEffect(() => {
    callbacks.current = { onLoad, onError };
  }, [onLoad, onError]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!container.current) return;
    const request = new AbortController();
    let viewer: ReturnType<typeof createLightViewer> | undefined;
    try {
      viewer = createLightViewer(container.current);
      controller.current = viewer;
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
        let next = profile;
        if (!next && iesText) next = parseIES(iesText);
        if (!next && src) {
          const response = await fetch(src, { signal: request.signal });
          if (!response.ok) throw new Error(`Failed to load IES: HTTP ${response.status}`);
          next = parseIES(await response.text());
        }
        if (request.signal.aborted) return;
        if (next) {
          viewer!.setProfile(next);
          setError('');
          callbacks.current.onLoad?.(next);
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
      viewer?.dispose();
      controller.current = undefined;
    };
  }, [profile, iesText, src]);
  useEffect(() => {
    try {
      controller.current?.setExposure(exposure);
    } catch (reason) {
      const failure = reason instanceof Error ? reason : new Error(String(reason));
      callbacks.current.onError?.(failure);
    }
    // A new document recreates the controller, so reapply exposure to that controller.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [exposure, profile, iesText, src]);
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
