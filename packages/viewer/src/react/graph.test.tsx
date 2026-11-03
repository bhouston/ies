import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseIES } from '@ies-tools/core';
import {
  ConeDiagramGraph,
  IntensityGraph,
  IntensityTableGraph,
  IsoluxGraph,
  LightViewer,
  LuminanceTableGraph,
} from './index.js';
import { ChartTabs, VIEWER_TABS } from './ChartTabs.js';
const profile = parseIES(`IESNA:LM-63-2002
TILT=NONE
1 1000 1 3 1 1 2 0 0 0
1 1 10
0 90 180
0
100 20 0
`);

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
  });
  it.each([
    ['cone', 'Cone diagram, centre intensity 100 candela'],
    ['luminance', 'Average luminance'],
    ['intensity-table', 'Luminous intensity table in cd'],
  ] as const)('shows the %s chart tab', (tab, text) => {
    expect(VIEWER_TABS.map(([value]) => value)).toContain(tab);
    const markup = renderToStaticMarkup(
      createElement(ChartTabs, { tab, onTabChange: () => {}, profile, mountingHeight: 2 }),
    );
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain(text);
    expect(markup).not.toContain('NaN');
  });
  it('renders cone, luminance and intensity tables with their values', () => {
    const cone = renderToStaticMarkup(createElement(ConeDiagramGraph, { profile, maxDistance: 3 }));
    expect(cone).toContain('25 lx');
    expect(cone).toContain('Field Ø C90');
    const sized = { ...profile, dimensions: { width: 0.1, length: 0.1, height: 0 } };
    const luminance = renderToStaticMarkup(createElement(LuminanceTableGraph, { profile: sized }));
    expect(luminance).toContain('Luminous intensity · cd');
    expect(luminance).not.toContain('Luminance unavailable');
    const dark = renderToStaticMarkup(createElement(LuminanceTableGraph, { profile }));
    expect(dark).toContain('Luminance unavailable');
    const table = renderToStaticMarkup(createElement(IntensityTableGraph, { profile, unit: 'cd/klm' }));
    expect(table).toContain('cd/klm');
    expect(table).toContain('fill-opacity');
  });
  it('explains that table charts need Type C photometry', () => {
    const typeB = { ...profile, photometricType: 2 as const };
    for (const component of [ConeDiagramGraph, LuminanceTableGraph, IntensityTableGraph])
      expect(renderToStaticMarkup(createElement(component, { profile: typeB }))).toContain(
        'available for Type C photometry only',
      );
  });
  it('renders a server placeholder without constructing a WebGL context', () => {
    const markup = renderToStaticMarkup(createElement(LightViewer, { profile }));
    expect(markup).toContain('height:480px');
    expect(markup).not.toContain('<canvas');
  });
});
