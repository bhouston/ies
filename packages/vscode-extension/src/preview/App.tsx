import { createElement, useEffect, useMemo, useLayoutEffect, useRef, useState } from 'react';
import type { LightViewerElement } from '@ies-tools/viewer/element';
import { PhotometryInfoPanel } from '@ies-tools/viewer/react';
import { isUpdateMessage, type UpdateMessage } from '../protocol.js';
import { inspectPreview } from './inspection.js';

export function App({ initialUpdate }: { initialUpdate?: UpdateMessage }) {
  const viewer = useRef<LightViewerElement>(null);
  const [update, setUpdate] = useState<UpdateMessage | undefined>(initialUpdate);
  const [selectedLampSet, setSelectedLampSet] = useState<number>();
  const [strict, setStrict] = useState(false);
  const [viewerError, setViewerError] = useState('');
  const [status, setStatus] = useState('Waiting for a photometric file…');
  useLayoutEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (!isUpdateMessage(event.data)) return;
      const next = event.data;
      setSelectedLampSet((current) =>
        current !== undefined && current >= (next.lampSetLabels?.length ?? 0) ? undefined : current,
      );
      setUpdate(next);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  useLayoutEffect(() => {
    const element = viewer.current;
    if (!element) return;
    const loaded = () => {
      setViewerError('');
      setStatus('Drag to orbit. Scroll to zoom. Edit the source to update the preview.');
    };
    const failed = (event: Event) => {
      const detail: unknown = event instanceof CustomEvent ? event.detail : undefined;
      const message =
        typeof detail === 'object' && detail !== null && 'message' in detail && typeof detail.message === 'string'
          ? detail.message
          : 'Unable to preview this photometric profile.';
      setViewerError(message);
      setStatus('3D preview unavailable. See file information for details.');
    };
    element.addEventListener('load', loaded);
    element.addEventListener('error', failed);
    return () => {
      element.removeEventListener('load', loaded);
      element.removeEventListener('error', failed);
    };
  }, []);
  useEffect(() => {
    const element = viewer.current;
    if (!element || !update) return;
    setStatus('Loading photometric profile…');
    setViewerError('');
    if (selectedLampSet === undefined) element.removeAttribute('lamp-set-index');
    else element.setAttribute('lamp-set-index', String(selectedLampSet));
    if (update.format) element.setAttribute('format', update.format);
    else element.removeAttribute('format');
    element.photometryText = update.text;
  }, [update, selectedLampSet]);
  const analysis = useMemo(
    () => (update ? inspectPreview(update.text, update.format, strict, selectedLampSet) : null),
    [update, strict, selectedLampSet],
  );
  const labels = update?.lampSetLabels ?? [];
  return (
    <main
      className="photometry-workspace grid h-full min-h-0 grid-cols-[minmax(0,1fr)_360px] bg-background text-foreground"
      aria-label="IES and LDT photometric preview"
    >
      <section className="flex min-h-0 min-w-0 flex-col" aria-label="Light preview">
        {labels.length > 1 && (
          <label className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-3">
            Alternative lamp configuration
            <select
              className="min-w-0 flex-1 rounded-md border border-border bg-input p-1 text-foreground outline-ring focus-visible:outline"
              aria-label="Alternative lamp configuration"
              value={selectedLampSet ?? ''}
              onChange={(event) =>
                setSelectedLampSet(event.target.value === '' ? undefined : Number(event.target.value))
              }
            >
              <option value="">Choose a lamp configuration</option>
              {labels.map((label, index) => (
                <option key={index} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        {createElement('light-viewer', {
          ref: viewer,
          charts: 'true',
          className: 'min-h-[260px] w-full flex-1',
          'aria-label': 'Light on a floor and wall',
        })}
        <output id="status" className="m-0 border-t border-border bg-card px-4 py-3 text-muted-foreground">
          {status}
        </output>
      </section>
      <aside
        aria-label="Photometric file information"
        className="min-h-0 overflow-auto border-l border-border bg-background p-4"
      >
        <PhotometryInfoPanel
          inspection={analysis?.inspection ?? null}
          validation={analysis?.validation ?? null}
          inspectionError={analysis?.inspectionError}
          viewerError={viewerError}
          fileName={update?.fileName}
          fileSize={update ? new TextEncoder().encode(update.text).length : undefined}
          strict={strict}
          onStrictChange={setStrict}
        />
      </aside>
    </main>
  );
}
