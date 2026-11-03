import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseIES } from '@ies-tools/core';
import { IntensityGraph, IsoluxGraph, LightViewer } from './index.js';
const profile = parseIES(`IESNA:LM-63-2002
TILT=NONE
1 1000 1 3 1 1 2 0 0 0
1 1 10
0 90 180
0
100 20 0
`);

const viewBox = (svg: string) =>
  svg
    .match(/viewBox="([^"]+)"/)![1]!
    .split(' ')
    .map(Number) as [number, number, number, number];
const background = (svg: string) => {
  const [x, y, width, height] = viewBox(svg);
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#111">`;
};
const invalid =
  (props: Record<string, unknown>, graph: typeof IntensityGraph | typeof IsoluxGraph = IntensityGraph) =>
  () =>
    renderToStaticMarkup(createElement(graph as typeof IntensityGraph, { profile, ...props }));
const center = ([x, y, width, height]: number[]) => [x! + width! / 2, y! + height! / 2];

describe('Graph aspect ratio', () => {
  it('keeps the native viewBox and size without an aspect ratio', () => {
    for (const projection of ['polar', 'cartesian', 'topology'] as const) {
      const svg = renderToStaticMarkup(createElement(IntensityGraph, { profile, projection }));
      expect(viewBox(svg)).toEqual([0, 0, 520, 560]);
      expect(svg).toContain('width="520" height="560"');
      expect(svg).toContain(background(svg));
    }
    const isolux = renderToStaticMarkup(createElement(IsoluxGraph, { profile, resolution: 11 }));
    expect(viewBox(isolux).slice(0, 3)).toEqual([0, 0, 520]);
    expect(isolux).toContain(background(isolux));
  });
  it.each([
    ['polar', 9],
    ['polar', 1 / 9],
    ['topology', 9],
    ['topology', 1 / 9],
  ] as const)('centers the %s layout in a full-background %d frame', (projection, aspectRatio) => {
    const svg = renderToStaticMarkup(createElement(IntensityGraph, { profile, projection, aspectRatio }));
    const box = viewBox(svg);
    expect(box[2] / box[3]).toBeCloseTo(aspectRatio, 9);
    expect(center(box)).toEqual([260, 280]);
    expect(svg).toContain(background(svg));
    expect(svg).toContain(`width="${box[2]}" height="${box[3]}"`);
  });
  it('widens the cartesian plot into extra width and centers it vertically when tall', () => {
    const wide = renderToStaticMarkup(
      createElement(IntensityGraph, { profile, projection: 'cartesian', aspectRatio: 2 }),
    );
    expect(viewBox(wide)).toEqual([0, 0, 1120, 560]);
    expect(wide).toContain('h1000"'); // plot width = layout width 1120 − 120 margins
    expect(wide).toContain(background(wide));
    const tall = renderToStaticMarkup(
      createElement(IntensityGraph, { profile, projection: 'cartesian', aspectRatio: 0.5 }),
    );
    expect(viewBox(tall)).toEqual([0, -240, 520, 1040]);
    expect(tall).toContain('h400"');
    expect(tall).toContain(background(tall));
  });
  it.each([3, 1 / 3])('centers the isolux layout in a full-background %d frame', (aspectRatio) => {
    const native = viewBox(renderToStaticMarkup(createElement(IsoluxGraph, { profile, resolution: 11 })));
    const svg = renderToStaticMarkup(createElement(IsoluxGraph, { profile, resolution: 11, aspectRatio }));
    const box = viewBox(svg);
    expect(box[2] / box[3]).toBeCloseTo(aspectRatio, 9);
    expect(center(box)).toEqual(center(native));
    expect(svg).toContain(background(svg));
  });
  it('rejects invalid aspect ratios', () => {
    for (const aspectRatio of [0, -2, NaN, Infinity]) {
      expect(() => renderToStaticMarkup(createElement(IntensityGraph, { profile, aspectRatio }))).toThrow(RangeError);
      expect(() => renderToStaticMarkup(createElement(IsoluxGraph, { profile, aspectRatio }))).toThrow(RangeError);
    }
  });
});

describe('React presentation without a GPU', () => {
  it('renders accessible polar and cartesian slices for the requested plane', () => {
    const polar = renderToStaticMarkup(createElement(IntensityGraph, { profile, axis: 'horizontal', angle: 45 }));
    expect(polar).toContain('horizontal axis, 45 degrees');
    expect(polar).toContain('60 candela');
    const cartesian = renderToStaticMarkup(createElement(IntensityGraph, { profile, projection: 'cartesian' }));
    expect(cartesian).toContain('cartesian');
    expect(cartesian).not.toEqual(polar);
  });
  it('projects the full measured surface with configurable up axes', () => {
    const x = renderToStaticMarkup(createElement(IntensityGraph, { profile, projection: 'topology', upAxis: 'x' }));
    const z = renderToStaticMarkup(createElement(IntensityGraph, { profile, projection: 'topology', upAxis: 'z' }));
    expect(x).toContain('X up');
    expect(z).toContain('Z up');
    expect(x).not.toEqual(z);
    expect(x.match(/<polygon/g)?.length).toBeGreaterThan(100);
    const wireframe = renderToStaticMarkup(
      createElement(IntensityGraph, {
        profile,
        projection: 'topology',
        surface: 'wireframe',
        topologyProjection: 'perspective',
      }),
    );
    expect(wireframe).toContain('fill="none"');
    expect(wireframe).toContain('perspective');
  });
  it('labels opposed principal-plane overlays, cartesian axes and units', () => {
    const polar = renderToStaticMarkup(createElement(IntensityGraph, { profile, principalPlanes: true }));
    expect(polar).toContain('C0°–C180°');
    expect(polar).toContain('C90°–C270°');
    expect(polar.match(/<polyline/g)).toHaveLength(2);
    const cartesian = renderToStaticMarkup(
      createElement(IntensityGraph, { profile, projection: 'cartesian', planes: [0, 45, 90] }),
    );
    expect(cartesian).toContain('Intensity (cd)');
    expect(cartesian).toContain('Signed vertical angle');
    expect(cartesian).toContain('180°');
    expect(cartesian.match(/<polyline/g)).toHaveLength(3);
  });
  it('draws 30° spokes, beam/field markers at the cos²γ crossings, and a log-scale option', () => {
    const vertical = Array.from({ length: 91 }, (_, i) => i);
    const cosine = parseIES(`IESNA:LM-63-2002
TILT=NONE
1 1000 1 91 1 1 2 0 0 0
1 1 10
${vertical.join(' ')}
0
${vertical.map((v) => 1000 * Math.cos((v * Math.PI) / 180) ** 2).join(' ')}
`);
    const polar = renderToStaticMarkup(createElement(IntensityGraph, { profile: cosine }));
    for (const label of [0, 30, 60, 90, 120, 150, 180]) expect(polar).toContain(`>${label}°<`);
    expect(polar.match(/stroke-dasharray="1 3"/g)).toHaveLength(12);
    const angles = (kind: string) =>
      [...polar.matchAll(new RegExp(`data-marker="${kind}" data-angle="([^"]+)"`, 'g'))].map((m) => Number(m[1]));
    expect(angles('beam')).toHaveLength(2);
    expect(angles('beam')[0]).toBeCloseTo(-45, 6);
    expect(angles('beam')[1]).toBeCloseTo(45, 6);
    expect(angles('field')[1]).toBeCloseTo((Math.acos(Math.sqrt(0.1)) * 180) / Math.PI, 1);
    expect(polar).toContain('beam 50 % / field 10 %');
    expect(renderToStaticMarkup(createElement(IntensityGraph, { profile: cosine, projection: 'cartesian' }))).toContain(
      'data-marker="beam"',
    );
    // An isotropic source has no bracketed crossing, so no markers or marker legend.
    const isotropic = parseIES(
      'IESNA:LM-63-2002\nTILT=NONE\n1 1000 1 3 1 1 2 0 0 0\n1 1 10\n0 90 180\n0\n100 100 100\n',
    );
    expect(renderToStaticMarkup(createElement(IntensityGraph, { profile: isotropic }))).not.toContain('data-marker');
    const log = renderToStaticMarkup(createElement(IntensityGraph, { profile: cosine, logScale: true }));
    expect(log).toContain('cd (log)');
    for (const ring of ['1 cd', '2 cd', '5 cd', '500 cd', '1000 cd']) expect(log).toContain(`>${ring}<`);
    expect(log).not.toEqual(polar);
  });
  it('renders an accessible physically scaled isolux map with requested contours', () => {
    const markup = renderToStaticMarkup(
      createElement(IsoluxGraph, { profile, mountingHeight: 2, extent: 4, resolution: 11, contours: [5, 10] }),
    );
    expect(markup).toContain('Ground illuminance isolux graph');
    expect(markup).toContain('maximum 25 lux');
    expect(markup).toContain('data-level="5"');
    expect(markup).toContain('data-level="10"');
    expect(markup).toContain('X (m)');
    expect(markup).toContain('Z (m)');
    expect(markup).not.toContain('NaN');
    expect(markup).not.toContain('<canvas');
  });
  it('labels default 1-2-5 contours without overlap over a smooth image fill', () => {
    const markup = renderToStaticMarkup(createElement(IsoluxGraph, { profile, mountingHeight: 2, extent: 8 }));
    const labels = [...markup.matchAll(/<text data-label="([\d.]+)" x="([\d.]+)" y="([\d.]+)"/g)].map((m) => ({
      text: m[1]!,
      x: Number(m[2]),
      y: Number(m[3]),
    }));
    expect(labels.map((label) => label.text).toSorted((a, b) => Number(a) - Number(b))).toEqual([
      '1',
      '2',
      '5',
      '10',
      '20',
    ]);
    for (const [i, a] of labels.entries())
      for (const b of labels.slice(i + 1))
        expect(Math.abs(a.x - b.x) >= (a.text.length + b.text.length) * 3 + 6 || Math.abs(a.y - b.y) >= 14).toBe(true);
    expect(new Set(labels.map((label) => label.y)).size).toBeGreaterThan(1);
    expect(markup).toContain('href="data:image/png;base64,');
    expect(markup.match(/<rect/g)?.length).toBeLessThanOrEqual(3);
    expect(markup).toContain('U0 ');
    expect(markup).toContain('log colour');
  });
  it('accepts explicit contour levels, a contour floor and linear colour', () => {
    const explicit = renderToStaticMarkup(
      createElement(IsoluxGraph, { profile, mountingHeight: 2, extent: 8, contourLevels: [3, 7] }),
    );
    expect(explicit.match(/data-level=/g)).toHaveLength(2);
    const floor = renderToStaticMarkup(
      createElement(IsoluxGraph, { profile, mountingHeight: 2, extent: 8, minContour: 5, colorScale: 'linear' }),
    );
    expect(floor).not.toContain('data-level="2"');
    expect(floor).toContain('data-level="5"');
    expect(floor).toContain('linear colour');
  });
  it('throws clear invalid option errors before emitting broken SVG', () => {
    expect(() => renderToStaticMarkup(createElement(IsoluxGraph, { profile, mountingHeight: 0 }))).toThrow(
      'Mounting height',
    );
    expect(() =>
      renderToStaticMarkup(createElement(IntensityGraph, { profile: { ...profile, photometricType: 3 } })),
    ).toThrow('Type C');
    expect(invalid({ projection: 'radar' })).toThrow('projection');
    expect(invalid({ projection: 'topology', surface: 'dots' })).toThrow('surface');
    expect(invalid({ colorScale: 'cubic' }, IsoluxGraph)).toThrow('Colour scale');
    expect(invalid({ contours: [-1] }, IsoluxGraph)).toThrow('nonnegative');
  });
  it('renders a server placeholder without constructing a WebGL context', () => {
    const markup = renderToStaticMarkup(createElement(LightViewer, { profile }));
    expect(markup).toContain('height:480px');
    expect(markup).not.toContain('<canvas');
  });
});
