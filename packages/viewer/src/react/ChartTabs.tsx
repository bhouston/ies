import { useState } from 'react';
import { type IESProfile } from '@ies-tools/core';
import { IntensityGraph } from './IntensityGraph.js';
import { IsoluxGraph } from './IsoluxGraph.js';
import { ConeDiagramGraph, IntensityTableGraph, LuminanceTableGraph } from './TableCharts.js';

export const VIEWER_TABS = [
  ['3d', '3D view'],
  ['polar', 'Polar'],
  ['cartesian', 'Cartesian'],
  ['topology', 'Topology'],
  ['isolux', 'Isolux'],
  ['cone', 'Cone'],
  ['luminance', 'Luminance'],
  ['intensity-table', 'Intensity table'],
] as const;
export type ViewerTab = (typeof VIEWER_TABS)[number][0];
/** Props for {@link ChartTabs}. */
export interface ChartTabsProps {
  tab: ViewerTab;
  onTabChange: (tab: ViewerTab) => void;
  /** Loaded profile to chart; undefined while loading. */
  profile?: IESProfile;
  /** Isolux mounting height in meters. */
  mountingHeight: number;
}

/** Tab bar over the 3D viewport; chart tabs cover the viewport with the selected chart. */
export function ChartTabs({ tab, onTabChange, profile, mountingHeight }: ChartTabsProps) {
  const [logScale, setLogScale] = useState(false);
  return (
    <>
      <div
        role="tablist"
        aria-label="Light views"
        className="pointer-events-auto absolute inset-x-0 top-0 flex h-10 items-end gap-1 overflow-x-auto border-b border-border bg-card px-2"
      >
        {VIEWER_TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={`cursor-pointer rounded-t-md border border-b-0 px-3 py-1.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              tab === value
                ? 'border-border bg-background text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => onTabChange(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab !== '3d' && (
        <div
          role="tabpanel"
          className="pointer-events-auto absolute inset-x-0 top-10 bottom-0 grid place-items-center overflow-auto bg-background p-3 text-foreground"
        >
          {!profile ? (
            <p className="text-muted-foreground">Loading photometry…</p>
          ) : profile.photometricType !== 1 ? (
            <p role="alert">
              Charts support Type C photometry only. Inspect or validate Type A/B files with ies inspect / ies validate
              or the VS Code information panel.
            </p>
          ) : tab === 'cone' ? (
            <ConeDiagramGraph profile={profile} style={{ maxHeight: '100%' }} />
          ) : tab === 'luminance' ? (
            <LuminanceTableGraph profile={profile} style={{ maxHeight: '100%' }} />
          ) : tab === 'intensity-table' ? (
            // Wide grids keep readable cells; auto margins keep an overflowing table scrollable from its start.
            <IntensityTableGraph profile={profile} style={{ width: 'auto', maxWidth: 'none', margin: 'auto' }} />
          ) : tab === 'isolux' ? (
            <IsoluxGraph profile={profile} mountingHeight={mountingHeight} style={{ maxHeight: '100%' }} />
          ) : (
            <>
              <IntensityGraph
                profile={profile}
                projection={tab}
                principalPlanes={tab !== 'topology'}
                logScale={logScale}
                style={{ maxHeight: '100%' }}
              />
              {tab !== 'topology' && (
                <label className="absolute top-3 right-3 flex items-center gap-2 text-sm">
                  <input
                    name="logScale"
                    type="checkbox"
                    checked={logScale}
                    className="size-4 accent-primary focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => setLogScale(event.currentTarget.checked)}
                  />
                  Log scale
                </label>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
