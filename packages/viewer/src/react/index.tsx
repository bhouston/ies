import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { parseIES, sampleIntensity, type IESProfile } from 'ies-core';
import { createLightViewer } from '../viewer.js';
import { intensitySamples } from '../photometry.js';

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

export interface IntensityGraphProps {
  profile: IESProfile;
  /** Sweep the vertical angle at a fixed horizontal plane, or vice versa. */
  axis?: 'vertical' | 'horizontal';
  angle?: number;
  /** Topology projects the full candela surface with the selected world axis pointing up. */
  projection?: 'polar' | 'cartesian' | 'topology';
  upAxis?: 'x' | 'y' | 'z';
  className?: string;
  style?: CSSProperties;
}
export function IntensityGraph({
  profile,
  axis = 'vertical',
  angle = 0,
  projection = 'polar',
  upAxis = 'y',
  className,
  style,
}: IntensityGraphProps) {
  const samples = intensitySamples(profile, axis, angle);
  const maximum = profile.candelaValues.reduce(
    (max, row) => row.reduce((peak, value) => Math.max(peak, value), max),
    1,
  );
  const points = samples
    .map((sample) => {
      const radius = (sample.intensity / maximum) * 140;
      const radians = (sample.angle * Math.PI) / 180;
      return projection === 'cartesian'
        ? `${30 + (sample.angle / (axis === 'vertical' ? 180 : 360)) * 300},${310 - radius * 2}`
        : `${180 + Math.sin(radians) * radius},${180 + Math.cos(radians) * radius}`;
    })
    .join(' ');
  const topology: string[] = [];
  if (projection === 'topology') {
    for (let h = 0; h < 360; h += 15) {
      const curve: string[] = [];
      for (let v = 0; v <= 180; v += 5) {
        const radius = (sampleIntensity(profile, v, h) / maximum) * 130;
        const theta = (v * Math.PI) / 180,
          phi = (h * Math.PI) / 180;
        const x = radius * Math.sin(theta) * Math.cos(phi),
          y = -radius * Math.cos(theta),
          z = radius * Math.sin(theta) * Math.sin(phi);
        const [a, b, c] = upAxis === 'x' ? [y, x, z] : upAxis === 'z' ? [x, z, y] : [x, y, z];
        curve.push(`${180 + a * 0.85 + c * 0.45},${180 - b * 0.85 + c * 0.25}`);
      }
      topology.push(curve.join(' '));
    }
  }
  return (
    <svg
      className={className}
      style={{ width: '100%', maxWidth: 500, background: '#111', color: '#ddd', ...style }}
      viewBox="0 0 360 360"
      // SVG is the semantic image element here; an HTML img cannot contain graph geometry.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="img"
      aria-label={`${projection} luminous intensity graph, ${axis} axis, ${angle} degrees, maximum ${maximum.toFixed(1)} candela`}
    >
      <title>
        Luminous intensity · {projection} · {axis} · {angle}°
      </title>
      <path d="M20 180H340M180 20V340" fill="none" stroke="#444" />
      {projection === 'polar' &&
        [45, 90, 135].map((radius) => <circle key={radius} cx="180" cy="180" r={radius} fill="none" stroke="#333" />)}
      {projection === 'topology' ? (
        topology.map((curve, i) => (
          <polyline key={i} points={curve} fill="none" stroke="#71ceff" strokeWidth="1" opacity="0.7" />
        ))
      ) : (
        <polyline points={points} fill="none" stroke="#71ceff" strokeWidth="2" />
      )}
      <text x="12" y="22" fill="currentColor" fontSize="12">
        {maximum.toFixed(1)} cd ·{' '}
        {projection === 'topology' ? `${upAxis.toUpperCase()} up` : `${axis} · plane ${angle}°`}
      </text>
    </svg>
  );
}
