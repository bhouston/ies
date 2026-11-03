// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { inspectPhotometry, validatePhotometry } from '@ies-tools/core';
import { iesSource } from '../../../core/test/iesSource.js';
import { ldtSource } from '../../test/photometryFixtures.js';
import { PhotometryInfoPanel } from './index.js';

const render = (text: string) =>
  renderToStaticMarkup(<PhotometryInfoPanel inspection={inspectPhotometry(text, 'ies')} validation={null} />);

describe('PhotometryInfoPanel extended metrics', () => {
  it('shows flux split, ratios, CIE flux code, peak, nadir and a collapsed zonal lumens table', () => {
    const html = render(iesSource({ lamps: 2, lumens: 1000, vertical: [0, 180] }));
    expect(html).toContain('Downward flux fraction');
    expect(html).toContain('50.0 %');
    expect(html).toContain('0.628 (DLOR 0.314 / ULOR 0.314)');
    expect(html).toContain('25 50 75 31 63');
    expect(html).toContain('100 cd at C0° γ0°');
    expect(html).toContain('Nadir intensity');
    expect(html).toMatch(/<details class="[^"]*"><summary[^>]*>Zonal lumens<\/summary>/);
    expect(html).toContain('<td class="text-left">90–180°</td><td>628.3</td><td>31.4</td><td>50.0</td>');
  });
  it('marks lamp-relative values unavailable for absolute photometry', () => {
    const html = render(iesSource({ vertical: [0, 180] }));
    expect(html).toContain('Not available (no declared lamp flux)');
    expect(html).toContain('25 50 75 — —');
    expect(html).toContain('<td>1256.6</td><td>—</td><td>100.0</td>');
  });
  it('omits extended rows and the zonal table for unsupported coordinates', () => {
    const html = render(iesSource({ type: 2, vertical: [-90, 0, 90] }));
    expect(html).not.toContain('Downward flux fraction');
    expect(html).not.toContain('Zonal lumens');
  });
  it('falls back to Not available for partial metrics and dashes for missing zonal percentages', () => {
    const inspection = inspectPhotometry(iesSource({ values: [[0, 0, 0]] }), 'ies');
    const html = renderToStaticMarkup(
      <PhotometryInfoPanel
        inspection={{ ...inspection, cieFluxCode: null, peakDirection: null, downwardFluxFraction: null }}
        validation={null}
      />,
    );
    expect(html).toContain(
      '<dt class="text-muted-foreground">CIE flux code</dt><dd class="m-0 min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">Not available</dd>',
    );
    expect(html).toContain(
      '<dt class="text-muted-foreground">Peak intensity (tilt applied)</dt><dd class="m-0 min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">Not available</dd>',
    );
    expect(html).toContain(
      '<dt class="text-muted-foreground">Downward flux fraction</dt><dd class="m-0 min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">Not available</dd>',
    );
    expect(html).toContain('<td class="text-left">0–180°</td><td>0.0</td><td>—</td><td>—</td>');
  });
  it('renders LDT lamp sets unselected (no metrics) and selected (relative metrics, relative to the set)', () => {
    const text = ldtSource({ alternatives: true });
    const unselected = renderToStaticMarkup(
      <PhotometryInfoPanel inspection={inspectPhotometry(text, 'ldt')} validation={validatePhotometry(text, 'ldt')} />,
    );
    expect(unselected).toContain('Select an alternative configuration to calculate intensity and flux.');
    expect(unselected).not.toContain('Downward flux fraction');
    expect(unselected).not.toContain('Zonal lumens');
    const selected = renderToStaticMarkup(
      <PhotometryInfoPanel inspection={inspectPhotometry(text, 'ldt', 1)} validation={null} />,
    );
    expect(selected).toContain('Second configuration (selected)');
    expect(selected).toContain('0.628 (DLOR 0.314 / ULOR 0.314)');
    expect(selected).toContain('25 50 75 31 63');
    const absolute = renderToStaticMarkup(
      <PhotometryInfoPanel inspection={inspectPhotometry(ldtSource({ absolute: true }), 'ldt')} validation={null} />,
    );
    expect(absolute).toContain('Not available (no declared lamp flux)');
    expect(absolute).toContain('25 50 75 — —');
  });
  it('expands the collapsed zonal lumens section on toggle', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(() =>
      root.render(
        <PhotometryInfoPanel
          inspection={inspectPhotometry(iesSource({ lamps: 2, lumens: 1000, vertical: [0, 180] }), 'ies')}
          validation={null}
        />,
      ),
    );
    const zonal = [...host.querySelectorAll('details')].find(
      (details) => details.querySelector('summary')?.textContent === 'Zonal lumens',
    )!;
    expect(zonal.open).toBe(false);
    zonal.querySelector('summary')!.click();
    expect(zonal.open).toBe(true);
    const rows = [...zonal.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent),
    );
    expect(rows).toHaveLength(9);
    expect(rows[0]).toEqual(['0–30°', expect.any(String), expect.any(String), expect.any(String)]);
    expect(rows.at(-1)).toEqual(['0–180°', '1256.6', '62.8', '100.0']);
    await act(() => root.unmount());
    host.remove();
  });
  it('renders file details, validation states, errors, advisories and measured beam widths around the metrics', () => {
    const text = iesSource({
      metadata: '[MANUFAC] Example',
      vertical: [0, 10, 20, 90],
      values: [[100, 100, 0, 0]],
      tilt: 'INCLUDE\n1\n2\n0 90\n1 0.5',
    });
    const validation = validatePhotometry(text, 'ies', true);
    const inspection = inspectPhotometry(text, 'ies');
    const html = renderToStaticMarkup(
      <PhotometryInfoPanel
        inspection={{ ...inspection, diagnostics: [{ code: 'EXTRA', severity: 'info', field: 'x', message: 'Extra' }] }}
        validation={validation}
        fileName="example.ies"
        fileSize={42}
        strict
        onStrictChange={() => {}}
        inspectionError="Parse failed"
        viewerError="No GPU"
      />,
    );
    for (const fragment of [
      'example.ies',
      '42 bytes (UTF-8)',
      'Strict validation',
      'Fails strict validation',
      'aria-label="Validation diagnostics"',
      'Field: ',
      'Parse failed',
      'No GPU',
      'Inspection advisories',
      'Extra',
      'Embedded curve',
      'Beam angle (50%)',
    ])
      expect(html).toContain(fragment);
    expect(html).not.toContain('Not available (no-crossing)');
    const errors = renderToStaticMarkup(
      <PhotometryInfoPanel
        inspection={null}
        validation={{ valid: false, diagnostics: [{ code: 'E', severity: 'error', message: 'Broken' }] }}
      />,
    );
    expect(errors).toContain('Invalid');
    expect(errors).toContain('text-destructive');
    expect(errors).toContain('No current inspection data');
    const clean = renderToStaticMarkup(
      <PhotometryInfoPanel inspection={null} validation={{ valid: true, diagnostics: [] }} />,
    );
    expect(clean).toContain('No validation issues.');
  });
});
