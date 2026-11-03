import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseIES } from '@ies-tools/core';
import { IntensityGraph, IsoluxGraph, LightViewer } from './index.js';
import { buildIntensityCurves } from '../graphs.js';
const profile = parseIES(`IESNA:LM-63-2002
TILT=NONE
1 1000 1 3 1 1 2 0 0 0
1 1 10
0 90 180
0
100 20 0
`);

/** Single-plane profile measured at γ 0, 15, 30, 60, 90°. */
const source = (values: string) =>
  parseIES(`IESNA:LM-63-2002\nTILT=NONE\n1 1000 1 5 1 1 2 0 0 0\n1 1 10\n0 15 30 60 90\n0\n${values}\n`);

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
  it('labels horizontal-sweep spokes 0–330° and draws no beam markers for horizontal cuts', () => {
    const polar = renderToStaticMarkup(createElement(IntensityGraph, { profile, axis: 'horizontal', angle: 45 }));
    for (let label = 0; label < 360; label += 30) expect(polar).toContain(`>${label}°<`);
    expect(polar).not.toContain('>360°<');
    expect(polar.match(/stroke-dasharray="1 3"/g)).toHaveLength(12);
    expect(polar).not.toContain('data-marker');
  });
  it('skips markers for no-crossing and multiple-lobes cuts', () => {
    const lobes = source('100 0 100 0 0');
    expect(buildIntensityCurves(lobes).curves[0]!.beam!.beamAngleStatus).toBe('multiple-lobes');
    // Coverage stops at 90° with 100 cd there: no crossing for the 10 % field threshold.
    const open = source('100 80 60 40 20');
    expect(buildIntensityCurves(open).curves[0]!.beam!.fieldAngleStatus).toBe('no-crossing');
    for (const projection of ['polar', 'cartesian'] as const) {
      const multiple = renderToStaticMarkup(createElement(IntensityGraph, { profile: lobes, projection }));
      expect(multiple).not.toContain('data-marker');
      expect(multiple).not.toContain('beam 50 % / field 10 %');
      const partial = renderToStaticMarkup(createElement(IntensityGraph, { profile: open, projection }));
      expect(partial.match(/data-marker="beam"/g)).toHaveLength(2);
      expect(partial).not.toContain('data-marker="field"');
    }
  });
  it('puts log Cartesian ticks on 1-2-5 values and keeps dark profiles finite', () => {
    const cartesian = renderToStaticMarkup(
      createElement(IntensityGraph, { profile, projection: 'cartesian', logScale: true }),
    );
    expect(cartesian).toContain('Intensity (cd, log)');
    expect(cartesian).toContain('log scale');
    for (const tick of ['0.1', '0.2', '0.5', '1', '2', '5', '10', '20', '50', '100'])
      expect(cartesian).toContain(`>${tick}</text>`);
    expect(cartesian).not.toContain('>0.05</text>');
    const dark = parseIES('IESNA:LM-63-2002\nTILT=NONE\n1 1000 1 3 1 1 2 0 0 0\n1 1 10\n0 90 180\n0\n0 0 0\n');
    for (const projection of ['polar', 'cartesian'] as const) {
      const markup = renderToStaticMarkup(createElement(IntensityGraph, { profile: dark, projection, logScale: true }));
      expect(markup).not.toMatch(/NaN|Infinity/);
      expect(markup).not.toContain('<circle');
      expect(markup).not.toContain('data-marker');
    }
    // Topology ignores the log scale.
    expect(
      renderToStaticMarkup(createElement(IntensityGraph, { profile, projection: 'topology', logScale: true })),
    ).not.toMatch(/log scale|cd \(log\)/);
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
  it('renders a server placeholder without constructing a WebGL context', () => {
    const markup = renderToStaticMarkup(createElement(LightViewer, { profile }));
    expect(markup).toContain('height:480px');
    expect(markup).not.toContain('<canvas');
  });
});
