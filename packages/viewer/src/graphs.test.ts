import { describe, expect, it } from 'vitest';
import { graphFrame, heatColor } from './graphs.js';

describe('Heat colormap', () => {
  it('shares the clamped heat colormap', () => {
    expect(heatColor(-1)).toBe(heatColor(0));
    expect(heatColor(2)).toBe('hsl(40 80% 65%)');
  });
});

describe('Graph frame', () => {
  it('returns the native layout without an aspect ratio', () => {
    expect(graphFrame(520, 560)).toEqual({ x: 0, y: 0, width: 520, height: 560 });
  });
  it('keeps the layout when the ratio already matches', () => {
    expect(graphFrame(520, 560, 520 / 560)).toEqual({ x: 0, y: 0, width: 520, height: 560 });
  });
  it.each([
    [10, 5600, 560],
    [0.01, 520, 52000],
    [1, 560, 560],
  ])('widens or heightens around the centered layout at ratio %d', (ratio, width, height) => {
    const frame = graphFrame(520, 560, ratio);
    expect(frame.width).toBeCloseTo(Math.max(width, 520), 6);
    expect(frame.height).toBeCloseTo(Math.max(height, 560), 6);
    expect(frame.width / frame.height).toBeCloseTo(ratio, 9);
    expect(frame.x + frame.width / 2).toBeCloseTo(260, 6);
    expect(frame.y + frame.height / 2).toBeCloseTo(280, 6);
    expect(frame.width).toBeGreaterThanOrEqual(520);
    expect(frame.height).toBeGreaterThanOrEqual(560);
  });
  it.each([0, -1, NaN, Infinity, -Infinity])('rejects aspect ratio %d', (ratio) => {
    expect(() => graphFrame(520, 560, ratio)).toThrow(RangeError);
  });
});
