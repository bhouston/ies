// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { inspectPhotometry, validatePhotometry } from '@ies-tools/core';
import { iesSource } from '../../../core/test/iesSource.js';
import { ldtSource } from '../../test/photometryFixtures.js';
import { PhotometryInfoPanel, type PhotometryInfoPanelProps } from './PhotometryInfoPanel.js';

function panel(props: Partial<PhotometryInfoPanelProps> = {}) {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <PhotometryInfoPanel inspection={inspectPhotometry(iesSource(), 'ies')} validation={null} {...props} />,
  );
  return host;
}
const inspect = (text: string) => panel({ inspection: inspectPhotometry(text, 'ies') });
const disclosure = (host: HTMLElement, title: string) =>
  [...host.querySelectorAll('details')].find(
    (details) => details.querySelector('summary span')?.textContent === title,
  )!;
const rowValue = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll('dt')].find((term) => term.textContent === label)?.parentElement?.querySelector('dd')
    ?.textContent;
const tableRows = (host: HTMLElement) =>
  [...host.querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('th, td')].map((cell) => cell.textContent),
  );

describe('PhotometryInfoPanel hierarchy and source honesty', () => {
  it('leads with identity and useful output metrics, with technical details collapsed', () => {
    const host = inspect(
      iesSource({ metadata: '[MANUFAC] Example lighting\n[LUMINAIRE] Compact downlight\n[COLORTEMP] 3000K\n[CRI] 90' }),
    );
    expect(host.querySelector('h2')?.textContent).toBe('Compact downlight');
    expect(host.textContent).toContain('Example lighting');
    const overview = host.querySelector('section[aria-label="Lighting overview"]')!;
    expect([...overview.querySelectorAll('dt')].map((term) => term.textContent)).toEqual([
      'Output',
      'Peak intensity',
      'Power',
      'Beam angle',
      'Source',
    ]);
    expect(overview.textContent).toContain('1.257 klm');
    expect(overview.textContent).toContain('Integrated luminaire output');
    expect(overview.textContent).toContain('Declared input power');
    expect(rowValue(disclosure(host, 'Light source'), 'Color')).toBe('3,000 K');
    expect(disclosure(host, 'Light source').open).toBe(false);
    expect(disclosure(host, 'Beam & field').open).toBe(false);
    for (const title of ['Flux & efficiency', 'Distribution', 'Zonal lumens', 'File & geometry', 'Raw metadata']) {
      const details = disclosure(host, title);
      expect(details.open).toBe(false);
      expect(overview.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(disclosure(host, 'Lamp configurations (1)')).toBeUndefined();
  });
  it('keeps the five primary specifications above validation and technical disclosures', () => {
    const host = inspect(
      iesSource({ metadata: '[LAMP] LED module', vertical: [0, 10, 20, 90], values: [[100, 100, 0, 0]] }),
    );
    const overview = host.querySelector('section[aria-label="Lighting overview"]')!;
    expect(rowValue(overview as HTMLElement, 'Source')).toContain('LED module');
    expect(rowValue(overview as HTMLElement, 'Beam angle')).toContain('30°');
    expect(rowValue(overview as HTMLElement, 'Beam angle')).toContain('C0°–C180°');
    expect(
      overview.compareDocumentPosition(disclosure(host, 'Validation')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const info = inspectPhotometry(iesSource(), 'ies');
    const missing = panel({ inspection: { ...info, inputWatts: null } });
    expect(rowValue(missing, 'Power')).toBeUndefined();
    const zero = panel({ inspection: { ...info, inputWatts: 0 } });
    expect(rowValue(zero, 'Power')).toContain('0 W');
  });
  it('formats secondary measurements and preserves source geometry units', () => {
    const info = inspectPhotometry(iesSource({ metadata: '[COLORTEMP] 3000', lamps: 2, lumens: 1000 }), 'ies');
    const host = panel({
      inspection: {
        ...info,
        units: 'feet',
        dimensions: { width: 0.25, length: 2, height: 0 },
        peakCandela: 12500,
        luminousEfficacyLumensPerWatt: 125.6,
      },
      fileSize: 12345,
    });
    expect(rowValue(host, 'Peak intensity')).toContain('12.5 kcd');
    expect(rowValue(host, 'Integrated efficacy')).toBe('125.6 lm/W');
    expect(rowValue(host, 'Width')).toBe('0.25 ft');
    expect(rowValue(host, 'Height')).toBe('0 ft');
    expect(rowValue(host, 'Source size')).toBe('12.35 kB (UTF-8)');
    expect(rowValue(disclosure(host, 'Light source'), 'Color')).toBe('3,000 K');
  });
  it('omits absent source color rather than inventing the renderer fallback', () => {
    const host = inspect(iesSource());
    const source = disclosure(host, 'Light source');
    expect(rowValue(source, 'Color')).toBeUndefined();
    expect(rowValue(source, 'Color rendering')).toBeUndefined();
    expect(host.textContent).not.toContain('6500');
    const declared = inspect(iesSource({ metadata: '[COLORTEMP] 6500K' }));
    expect(rowValue(disclosure(declared, 'Light source'), 'Color')).toBe('6,500 K');
  });
  it('shows explicitly declared custom color keywords without inferring from descriptions', () => {
    const declared = inspect(iesSource({ metadata: '[_TEMPCOLOR] 3000K\n[_CRI] 90' }));
    expect(rowValue(disclosure(declared, 'Light source'), 'Color')).toBe('3,000 K');
    expect(rowValue(disclosure(declared, 'Light source'), 'Color rendering')).toBe('90');
    const described = inspect(iesSource({ metadata: '[LAMP] LED 2700K' }));
    expect(rowValue(disclosure(described, 'Light source'), 'Color')).toBeUndefined();
    expect(disclosure(described, 'Light source').textContent).toContain('LED 2700K');
    const conflicting = inspect(iesSource({ metadata: '[_TEMPCOLOR] 3000K\n[_CCT] 4000K' }));
    expect(rowValue(disclosure(conflicting, 'Light source'), 'Color')).toBe('4,000 K / 3,000 K');
    expect(conflicting.textContent).not.toContain('6500');
  });
  it('preserves declared versus integrated flux, ratios, CIE codes, directions and zonal data', () => {
    const host = inspect(iesSource({ lamps: 2, lumens: 1000, vertical: [0, 180] }));
    expect(rowValue(host, 'Declared lamp flux')).toBe('2 klm');
    expect(rowValue(host, 'Integrated luminaire flux')).toBe('1.257 klm');
    expect(rowValue(host, 'Downward flux fraction')).toBe('50 %');
    expect(rowValue(host, 'Light output ratio')).toBe('0.628 (DLOR 0.314 / ULOR 0.314)');
    expect(rowValue(host, 'CIE flux code')).toBe('25 50 75 31 63');
    expect(rowValue(host, 'Peak intensity (tilt applied)')).toBe('100 cd at C0° γ0°');
    expect(rowValue(host, 'Nadir intensity')).toBe('100 cd');
    const zonal = disclosure(host, 'Zonal lumens');
    expect(zonal.open).toBe(false);
    expect(tableRows(zonal)).toHaveLength(9);
    expect(tableRows(zonal)).toContainEqual(['90°–180°', '628.3 lm', '31.42 %', '50 %']);
    expect(zonal.querySelector('th[scope="row"]')).not.toBeNull();
  });
  it('marks lamp-relative values unavailable for absolute photometry', () => {
    const host = inspect(iesSource({ vertical: [0, 180] }));
    expect(rowValue(host, 'Light output ratio')).toBe('Not available (no declared lamp flux)');
    expect(rowValue(host, 'Lumens per lamp')).toBe('Not specified (absolute photometry)');
    expect(rowValue(host, 'CIE flux code')).toBe('25 50 75 — —');
    expect(tableRows(disclosure(host, 'Zonal lumens'))).toContainEqual(['0°–180°', '1.257 klm', '—', '100 %']);
  });
  it('explains unsupported coordinates without suggesting zero calculated output', () => {
    const host = inspect(iesSource({ type: 2, vertical: [-90, 0, 90] }));
    expect(disclosure(host, 'Distribution')).toBeUndefined();
    expect(disclosure(host, 'Zonal lumens')).toBeUndefined();
    expect(disclosure(host, 'Beam & field')).toBeUndefined();
    const overview = host.querySelector('section[aria-label="Lighting overview"]')!;
    expect(overview.querySelectorAll('[aria-label="Not available"]')).toHaveLength(2);
    expect(overview.textContent).toContain('Type C');
    expect(rowValue(overview as HTMLElement, 'Power')).toContain('10');
  });
  it('keeps null and zero measurements distinct', () => {
    const inspection = inspectPhotometry(iesSource({ values: [[0, 0, 0]] }), 'ies');
    const host = panel({
      inspection: { ...inspection, cieFluxCode: null, peakDirection: null, downwardFluxFraction: null },
    });
    for (const label of ['CIE flux code', 'Peak intensity (tilt applied)', 'Downward flux fraction'])
      expect(rowValue(host, label)).toBe('Not available');
    expect(rowValue(host, 'Integrated luminaire flux')).toBe('0 lm');
    expect(tableRows(disclosure(host, 'Zonal lumens'))).toContainEqual(['0°–180°', '0 lm', '—', '—']);
  });
  it('distinguishes unselected LDT alternatives from the selected source color and output', () => {
    const text = ldtSource({ alternatives: true });
    const unselected = panel({
      inspection: inspectPhotometry(text, 'ldt'),
      validation: validatePhotometry(text, 'ldt'),
    });
    expect(unselected.textContent).toContain('Select an alternative configuration to calculate intensity and flux.');
    expect(disclosure(unselected, 'Lamp configurations (2)').open).toBe(true);
    expect(disclosure(unselected, 'Light source')).toBeUndefined();
    expect(unselected.querySelector('section[aria-label="Lighting overview"]')).toBeNull();
    expect(disclosure(unselected, 'Distribution')).toBeUndefined();
    const selected = panel({ inspection: inspectPhotometry(text, 'ldt', 1) });
    expect(disclosure(selected, 'Lamp configurations (2)').open).toBe(false);
    expect(selected.textContent).toContain('Second configuration (selected)');
    expect(rowValue(disclosure(selected, 'Light source'), 'Color')).toBe('4,000 K');
    expect(rowValue(selected, 'Light output ratio')).toBe('0.628 (DLOR 0.314 / ULOR 0.314)');
    const absolute = panel({ inspection: inspectPhotometry(ldtSource({ absolute: true }), 'ldt') });
    expect(rowValue(absolute, 'Declared luminaire flux')).toBe('2 klm');
    expect(rowValue(disclosure(absolute, 'Light source'), 'Lamp count')).toBe('1');
    expect(rowValue(absolute, 'Light output ratio')).toBe('Not available (no declared lamp flux)');
  });
  it('keeps clean validation compact, exposes warning counts and expands failures', () => {
    const clean = panel({ validation: { valid: true, diagnostics: [] } });
    expect(disclosure(clean, 'Validation').open).toBe(false);
    expect(disclosure(clean, 'Validation').querySelector('summary')?.textContent).toContain('Valid');
    expect(clean.textContent).toContain('No validation issues.');
    const warning = { code: 'W', severity: 'warning' as const, message: 'Missing test data' };
    const warned = panel({ validation: { valid: true, diagnostics: [warning] } });
    expect(disclosure(warned, 'Validation').querySelector('summary')?.textContent).toContain('1 warning');
    const strict = panel({ validation: { valid: false, diagnostics: [warning] }, strict: true });
    expect(disclosure(strict, 'Validation').open).toBe(true);
    expect(strict.querySelector('[role="alert"]')?.textContent).toContain('Fails strict validation');
    const broken = panel({
      inspection: null,
      validation: { valid: false, diagnostics: [{ code: 'E', severity: 'error', message: 'Broken' }] },
    });
    expect(disclosure(broken, 'Validation').open).toBe(true);
    expect(broken.textContent).toContain('Invalid');
    expect(broken.textContent).toContain('No current inspection data');
    expect(broken.querySelector('[aria-label="Validation diagnostics"]')?.textContent).toContain('Broken');
  });
  it('preserves file provenance, beam details, advisories and rendering failures', () => {
    const text = iesSource({
      metadata: '[MANUFAC] Example',
      vertical: [0, 10, 20, 90],
      values: [[100, 100, 0, 0]],
      tilt: 'INCLUDE\n1\n2\n0 90\n1 0.5',
    });
    const inspection = inspectPhotometry(text, 'ies');
    const host = panel({
      inspection: { ...inspection, diagnostics: [{ code: 'EXTRA', severity: 'info', field: 'x', message: 'Extra' }] },
      validation: validatePhotometry(text, 'ies', true),
      fileName: 'example.ies',
      fileSize: 42,
      strict: true,
      onStrictChange: () => {},
      inspectionError: 'Parse failed',
      viewerError: 'No GPU',
    });
    for (const fragment of [
      'example.ies',
      'Strict validation',
      'Parse failed',
      'No GPU',
      'Inspection advisories',
      'Extra',
      'Embedded curve',
      'Beam angle (50%)',
    ])
      expect(host.textContent).toContain(fragment);
    expect(rowValue(host, 'Source size')).toBe('42 B (UTF-8)');
    expect(host.querySelector('table[aria-label="Beam and field angles"]')).not.toBeNull();
    expect(disclosure(host, 'Beam & field').open).toBe(true);
    expect(host.textContent).not.toContain('Not available (no-crossing)');
    expect(disclosure(host, 'Inspection advisories').open).toBe(false);
  });
  it('preserves all raw metadata as safe, wrapping text without duplicate advisories', () => {
    const text = iesSource({
      metadata: '[LUMINAIRE] <img src=x onerror=alert(1)>\n[_CUSTOM] A long note\n[MORE] More details',
    });
    const inspection = inspectPhotometry(text, 'ies');
    const host = panel({ inspection, validation: { valid: true, diagnostics: inspection.diagnostics } });
    expect(disclosure(host, 'Inspection advisories')).toBeUndefined();
    expect(host.querySelector('img')).toBeNull();
    expect(disclosure(host, 'Raw metadata').open).toBe(false);
    expect(rowValue(disclosure(host, 'Raw metadata'), '_CUSTOM')).toBe('A long note\nMore details');
    expect(host.querySelector('h2')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });
  it('toggles native disclosures and strict validation without changing the selected configuration', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    let strict = false;
    const inspection = inspectPhotometry(ldtSource({ alternatives: true }), 'ldt', 1);
    try {
      await act(() =>
        root.render(
          <PhotometryInfoPanel
            inspection={inspection}
            validation={{ valid: true, diagnostics: [] }}
            onStrictChange={(value) => {
              strict = value;
            }}
          />,
        ),
      );
      const zonal = disclosure(host, 'Zonal lumens');
      expect(zonal.open).toBe(false);
      zonal.querySelector('summary')!.click();
      expect(zonal.open).toBe(true);
      expect(tableRows(zonal)).toHaveLength(9);
      const validation = disclosure(host, 'Validation');
      validation.querySelector('summary')!.click();
      expect(validation.open).toBe(true);
      await act(() => (validation.querySelector('input') as HTMLInputElement).click());
      expect(strict).toBe(true);
      expect(rowValue(disclosure(host, 'Light source'), 'Color')).toBe('4,000 K');
    } finally {
      await act(() => root.unmount());
      host.remove();
    }
  });
});
