// Chart data builders live in @ies-tools/core; re-exported here so `@ies-tools/viewer/graphs` keeps its API.
export {
  LOG_DECADES,
  buildConeDiagram,
  buildIntensityCurves,
  buildIntensityTable,
  buildIntensityTopology,
  buildIsoluxGrid,
  buildLuminanceTable,
  extractContours,
  formatGraphValue,
  groundIlluminance,
  isoluxContourLevels,
  logRadius,
  logTicks,
  niceTicks,
  orientGraphPoint,
} from '@ies-tools/core';
export type {
  ConeDiagram,
  ConeOptions,
  ConePlane,
  ConeRow,
  Contour,
  ContourGrid,
  ContourLevelOptions,
  GraphAxis,
  IntensityCurve,
  IntensityCurveOptions,
  IntensityCurves,
  IntensityTable,
  IntensityTableOptions,
  IntensityTopology,
  IsoluxGrid,
  IsoluxOptions,
  LuminanceTable,
  LuminanceTableOptions,
  Point2,
  Point3,
  TopologyOptions,
  TopologyVertex,
  UpAxis,
} from '@ies-tools/core';

/**
 * SVG viewBox for a `width`×`height` graph layout, widened or heightened to `aspectRatio` (width / height)
 * with the layout centered. Without an aspect ratio the viewBox is the layout itself.
 */
export function graphFrame(width: number, height: number, aspectRatio?: number) {
  if (aspectRatio === undefined) return { x: 0, y: 0, width, height };
  if (!Number.isFinite(aspectRatio) || aspectRatio < Number.MIN_VALUE)
    throw new RangeError(`Graph aspect ratio must be finite and in [${Number.MIN_VALUE}, Infinity]`);
  const frameWidth = Math.max(width, height * aspectRatio),
    frameHeight = frameWidth / aspectRatio;
  return { x: (width - frameWidth) / 2, y: (height - frameHeight) / 2, width: frameWidth, height: frameHeight };
}

/** Shared heat-map colormap (dark blue → yellow) for a fraction in [0, 1]. */
export function heatColor(fraction: number): string {
  const t = Math.max(0, Math.min(1, fraction));
  return `hsl(${235 - t * 195} 80% ${15 + t * 50}%)`;
}
