import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { inspectPhotometry } from '@ies-tools/core';
import { iesSource } from '../../../core/test/iesSource.js';
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
});
