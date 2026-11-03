import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { iesSource } from '../../../core/test/iesSource.js';
import { ldtSource } from '../../../viewer/test/photometryFixtures.js';
import { command } from './inspect.js';

// In-process so v8 coverage sees the formatting; the spawned-binary tests exercise the real entry point.
let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ies-inspect-'));
});
afterAll(() => rm(directory, { recursive: true, force: true }));

async function inspect(name: string, text: string, options: { json?: boolean; lampSet?: number } = {}) {
  const file = join(directory, name);
  await writeFile(file, text);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await (command.handler as (argv: Record<string, unknown>) => Promise<void>)({ file, ...options });
    return log.mock.calls.map((call) => String(call[0])).join('\n');
  } finally {
    log.mockRestore();
  }
}

describe('ies inspect extended metric output', () => {
  it('prints LOR, DFF, CIE flux code, peak, nadir and zonal lumens for relative photometry', async () => {
    const text = await inspect('relative.ies', iesSource({ lamps: 2, lumens: 1000, vertical: [0, 180] }));
    for (const line of [
      'Downward / upward flux: 628.319 lm / 628.319 lm',
      'DFF 50 %',
      'LOR 0.63 (DLOR 0.31 / ULOR 0.31)',
      'CIE flux code: 25 50 75 31 63',
      'Peak (tilt applied): 100.000 cd at C0° γ0°',
      'Nadir intensity: 100.000 cd',
      'Zonal lumens:',
    ])
      expect(text).toContain(line);
    expect(text).toMatch(/ {2}Zone {15}lm {5}% lamp {2}% luminaire/);
    expect(text).toMatch(/90–180°\s+628\.319\s+31\.4\s+50\.0/);
  });
  it('marks lamp-relative values unavailable for absolute photometry and dark output', async () => {
    const text = await inspect('dark.ies', iesSource({ values: [[0, 0, 0]] }));
    expect(text).toContain('Declared lamp flux: not specified (absolute photometry)');
    expect(text).toContain('DFF unavailable (no light)');
    expect(text).toContain('LOR unavailable (no declared lamp flux)');
    expect(text).toContain('CIE flux code: — — — — —');
    expect(text).toMatch(/0–180°\s+0\.000\s+—\s+—/);
  });
  it('omits extended lines for Type B and unselected LDT alternatives, and shows them once selected', async () => {
    const typeB = await inspect('type-b.ies', iesSource({ type: 2, vertical: [-90, 0, 90] }));
    expect(typeB).toContain('Integrated luminaire flux: unavailable (Type C only)');
    expect(typeB).not.toContain('Zonal lumens');
    const alternatives = ldtSource({ alternatives: true });
    const unselected = await inspect('alternatives.ldt', alternatives);
    expect(unselected).toContain('Integrated luminaire flux: unavailable (select a lamp configuration)');
    expect(unselected).toContain('Lamp count: select a lamp configuration');
    expect(unselected).not.toContain('CIE flux code');
    const selected = await inspect('alternatives.ldt', alternatives, { lampSet: 2 });
    expect(selected).toContain('Lamp configuration 2 (selected): Second configuration; 500 lm; 5 W');
    expect(selected).toContain('CIE flux code: 25 50 75 31 63');
    expect(selected).toContain('Nadir intensity: 25.000 cd');
  });
  it('includes the extended fields in --json for an absolute LDT file', async () => {
    const summary = JSON.parse(await inspect('absolute.ldt', ldtSource({ absolute: true }), { json: true }));
    expect(summary.declaredLuminaireFluxLumens).toBe(2000);
    expect(summary.lightOutputRatio).toBeNull();
    expect(summary.downwardFluxFraction).toBeCloseTo(0.5, 12);
    expect(summary.zonalLumens).toHaveLength(9);
    expect(summary.peakDirection).toEqual({ horizontalDegrees: 0, verticalDegrees: 0 });
  });
  it('prints measured beam widths, embedded tilt, metadata and absolute LDT source flux in text mode', async () => {
    const real = await inspect(
      'real.ies',
      await readFile(resolve('fixtures/007cfb11e343e2f42e3b476be4ab684e.ies'), 'utf8'),
    );
    expect(real).toContain('C0–C180 beam / field estimate: 54.444° / 88.429° (peak direction -15°)');
    expect(real).toContain('CIE flux code: 81 95 99 — —');
    expect(real).toContain('Metadata:');
    const tilted = await inspect('tilt.ies', iesSource({ tilt: 'INCLUDE\n1\n2\n0 90\n1 0.5' }));
    expect(tilted).toContain('Tilt correction: embedded');
    const absolute = await inspect('absolute.ldt', ldtSource({ absolute: true }));
    expect(absolute).toContain('Declared luminaire flux: 2000 lm (source rating)');
    expect(absolute).toContain('LOR unavailable (no declared lamp flux)');
  });
});
