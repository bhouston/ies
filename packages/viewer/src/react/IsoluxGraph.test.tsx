import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { parseIES } from '@ies-tools/core';
import { buildIsoluxGrid } from '../graphs.js';
import { IsoluxGraph, pngDataUri, type IsoluxGraphProps } from './IsoluxGraph.js';
import { illuminanceRampRgb as rampRgb } from '@ies-tools/core';

const lamp = (values: string) =>
  parseIES(`IESNA:LM-63-2002\nTILT=NONE\n1 -1 1 3 1 1 2 0 0 0\n1 1 10\n0 90 180\n0\n${values}\n`);
const isotropic = lamp('100 100 100');
const render = (props: Omit<IsoluxGraphProps, 'profile'>, profile = isotropic) =>
  renderToStaticMarkup(createElement(IsoluxGraph, { profile, ...props }));

/** Decode an RGB PNG data URI with Sharp, independently of our encoder. */
async function decode(uri: string) {
  const { data, info } = await sharp(Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64'))
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, channels: info.channels, data };
}
const heatmapUri = (markup: string) => /href="(data:image\/png;base64,[^"]+)"/.exec(markup)![1]!;
const pixel = (image: Awaited<ReturnType<typeof decode>>, x: number, y: number) => [
  ...image.data.subarray((y * image.width + x) * 3, (y * image.width + x) * 3 + 3),
];
const labelCount = (markup: string) => markup.match(/data-label=/g)?.length ?? 0;

describe('inline PNG encoder', () => {
  it.each([
    [1, 1],
    [3, 2],
    [2, 5],
    // 200 × 120 RGB plus filter bytes exceeds one 65,535-byte stored deflate block.
    [200, 120],
  ])('round-trips a %i×%i RGB image through Sharp', async (width, height) => {
    const rgb = Uint8Array.from({ length: width * height * 3 }, (_, i) => (i * 37 + (i >> 7)) & 255);
    const raw = new Uint8Array(height * (1 + width * 3));
    for (let row = 0; row < height; row++)
      raw.set(rgb.subarray(row * width * 3, (row + 1) * width * 3), row * (1 + width * 3) + 1);
    const image = await decode(pngDataUri(width, height, raw));
    expect(image).toMatchObject({ width, height, channels: 3 });
    expect([...image.data]).toEqual([...rgb]);
  });
});

describe('isolux heatmap shading', () => {
  const options = { mountingHeight: 2, extent: [4, 6] as [number, number], resolution: [5, 3] as [number, number] };
  const grid = buildIsoluxGrid(isotropic, options);
  const corner = grid.values[0]![0]!;

  it('emits one pixel per grid point with z descending, and the peak at full scale', async () => {
    const image = await decode(heatmapUri(render(options)));
    expect(image).toMatchObject({ width: 5, height: 3 });
    expect(pixel(image, 2, 1)).toEqual(rampRgb(1));
  });
  it('maps lux logarithmically from the lowest contour level by default', async () => {
    const image = await decode(heatmapUri(render({ ...options, contourLevels: [corner] })));
    expect(pixel(image, 0, 0)).toEqual(rampRgb(0));
    const edge = grid.values[1]![0]!;
    expect(pixel(image, 0, 1)).toEqual(rampRgb(Math.log(edge / corner) / Math.log(grid.maximum / corner)));
  });
  it('falls back to 1% of the peak as the log floor without a usable lowest level', async () => {
    const expected = rampRgb(Math.log(corner / (grid.maximum / 100)) / Math.log(100));
    for (const contourLevels of [[], [grid.maximum * 2]]) {
      const image = await decode(heatmapUri(render({ ...options, contourLevels })));
      expect(pixel(image, 0, 0)).toEqual(expected);
    }
  });
  it('maps lux proportionally with the linear colour scale', async () => {
    const markup = render({ ...options, colorScale: 'linear' });
    expect(markup).toContain('linear colour');
    const image = await decode(heatmapUri(markup));
    expect(pixel(image, 0, 0)).toEqual(rampRgb(corner / grid.maximum));
  });
  it('renders an unlit grid at the bottom of the ramp for both scales', async () => {
    const dark = lamp('0 0 0');
    for (const colorScale of ['log', 'linear'] as const) {
      const markup = render({ ...options, colorScale }, dark);
      expect(markup).not.toContain('NaN');
      expect(markup).toContain('none in this range');
      const image = await decode(heatmapUri(markup));
      expect(new Set(image.data)).toEqual(new Set(rampRgb(0)));
    }
  });
  it('omits the image and colour note when the heatmap is off', () => {
    const markup = render({ ...options, heatmap: false });
    expect(markup).not.toContain('<image');
    expect(markup).not.toContain('colour');
  });
});

describe('isolux contours and labels', () => {
  it('honours the deprecated contours alias, with contourLevels taking precedence', () => {
    expect(render({ extent: 8, contours: [3, 7] }).match(/data-level=/g)).toHaveLength(2);
    const both = render({ extent: 8, contours: [3, 7], contourLevels: [5] });
    expect(both.match(/data-level=/g)).toHaveLength(1);
    expect(both).toContain('data-level="5"');
  });
  it('skips a label that would overlap one already placed', () => {
    // Aimed off nadir so the marker is far away; two tiny rings around the peak leave room for one label only.
    const options = { mountingHeight: 2, extent: 4, resolution: 201, aimAngle: 30 };
    const beam = lamp('100 20 0');
    const peak = buildIsoluxGrid(beam, options).maximum;
    const contourLevels = [peak * 0.995, peak * 0.998];
    const markup = render({ ...options, contourLevels }, beam);
    expect(markup.match(/data-level=/g)).toHaveLength(2);
    expect(labelCount(markup)).toBe(1);
  });
  it('skips a label when no point on the contour fits inside the plot', () => {
    // A level just above the corner minimum only crosses the grid within a few pixels of each corner.
    const grid = buildIsoluxGrid(isotropic, { mountingHeight: 2, extent: 8, resolution: 41 });
    const level = grid.values[0]![0]! * 1.01;
    const markup = render({ mountingHeight: 2, extent: 8, resolution: 41, contourLevels: [level] });
    expect(markup.match(/data-level=/g)).toHaveLength(1);
    expect(labelCount(markup)).toBe(0);
  });
  it('wraps a long legend onto extra rows and grows the layout to fit', () => {
    const markup = render({ mountingHeight: 2, extent: 8, contourLevels: [2, 3, 4, 5, 6, 8, 10] });
    expect(markup).toContain('Contours: 2 lx · 3 lx · 4 lx · 5 lx · 6 lx');
    expect(markup).toMatch(/>8 lx · 10 lx</);
    expect(markup).toContain('viewBox="0 0 520 578"');
  });
  it('widens the viewBox to a requested aspect ratio around the native layout', () => {
    expect(render({ extent: 8, aspectRatio: 2 })).toContain('viewBox="-300 0 1120 560"');
  });
  it('rejects negative levels and unknown colour scales', () => {
    expect(() => render({ contourLevels: [-1, 2] })).toThrow('nonnegative');
    expect(() => render({ colorScale: 'cubic' as 'log' })).toThrow('Colour scale');
  });
});
