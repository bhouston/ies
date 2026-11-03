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
