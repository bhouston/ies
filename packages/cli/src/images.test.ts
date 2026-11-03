import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePhotometry, parseLDT, serializeLDT, writeLDT } from '@ies-tools/core';
import { chartPhotometry } from './chart.js';
import { imageDimensions, requireHardwareGPU } from './render.js';
import yargs from 'yargs';
import { command as chart } from './commands/chart.js';
import { command as render } from './commands/render.js';
import { imageOptions, runImageCommand, writeImageExclusively, type ImageCommandOptions } from './images.js';

/** Parse through the real yargs command definitions, stopping before any rendering. */
async function parseImageArguments(name: 'render' | 'chart', argv: string[]) {
  let options: ImageCommandOptions | undefined;
  await yargs([name, ...argv])
    .command({
      ...(name === 'render' ? render : chart),
      handler: (parsed) => void (options = imageOptions(name, parsed)),
    })
    .strict()
    .exitProcess(false)
    .fail((message, error) => {
      throw error ?? new Error(message);
    })
    .parseAsync();
  return options!;
}

const fixture = resolve('fixtures/007cfb11e343e2f42e3b476be4ab684e.ies');
const bin = resolve('packages/cli/bin/cli.js');
const directories: string[] = [];
async function temporary() {
  const dir = await mkdtemp(join(tmpdir(), 'ies-image-test-'));
  directories.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('actual renderer identification guard', () => {
  it.each([
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080, OpenGL 4.6)',
    'Mesa Intel(R) Iris(R) Xe Graphics',
    'AMD Radeon RX 7900',
    'Adreno (TM) 740',
  ])('accepts identified hardware %s', (renderer) =>
    expect(() => requireHardwareGPU({ vendor: 'test', renderer, version: 'WebGL 2.0' })).not.toThrow(),
  );
  it.each([
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)',
    'llvmpipe (LLVM 15.0.7)',
    'lavapipe',
    'Mesa Softpipe',
    'Apple Software Renderer',
    'Microsoft Basic Render Driver',
  ])('rejects software even if a vendor-like name appears: %s', (renderer) =>
    expect(() => requireHardwareGPU({ vendor: 'Apple', renderer, version: 'WebGL 2.0' })).toThrow(
      'software renderer rejected',
    ),
  );
  it.each(['WebKit WebGL', 'ANGLE', '', 'Generic GPU'])(
    'refuses to claim hardware from masked/unknown %s',
    (renderer) =>
      expect(() => requireHardwareGPU({ vendor: 'Apple', renderer, version: 'WebGL 2.0' })).toThrow(
        'Unable to confirm',
      ),
  );
  it('requires WebGL 2 for the shared viewer', () =>
    expect(() => requireHardwareGPU({ vendor: 'Apple', renderer: 'Apple M3', version: 'WebGL 1.0' })).toThrow(
      'WebGL 2',
    ));
});

describe('image command arguments', () => {
  it('accepts explicit dimensions, exposure and an explicit installed browser', () =>
    expect(
      parseImageArguments('render', [
        fixture,
        '-o',
        'out.png',
        '--width',
        '640',
        '--height',
        '480',
        '--exposure',
        '0.5',
        '--browser',
        '/chrome',
        '--lamp-set',
        '2',
      ]),
    ).resolves.toMatchObject({ width: 640, height: 480, exposure: 0.5, browser: '/chrome', lampSetIndex: 1 }));
  it('leaves the chart angle unset so vertical charts show the principal planes', async () =>
    expect((await parseImageArguments('chart', [fixture, '-o', 'out.svg'])).angle).toBeUndefined());
  it('accepts graph types, axes, negative slice angle and ground settings', () =>
    expect(
      parseImageArguments('chart', [
        fixture,
        '-o',
        'out.svg',
        '--type',
        'isolux',
        '--axis',
        'horizontal',
        '--angle',
        '-45',
        '--up-axis',
        'z',
        '--mounting-height',
        '3',
        '--extent',
        '8',
        '--resolution',
        '31',
        '--contours',
        '1, 2,5',
        '--min-contour',
        '0.5',
        '--color-scale',
        'linear',
      ]),
    ).resolves.toMatchObject({
      type: 'isolux',
      axis: 'horizontal',
      angle: -45,
      upAxis: 'z',
      mountingHeight: 3,
      extent: 8,
      resolution: 31,
      contours: [1, 2, 5],
      minContour: 0.5,
      colorScale: 'linear',
    }));
  it.each([
    ['render', []],
    ['render', [fixture]],
    ['render', [fixture, '-o', 'x.svg']],
    ['chart', [fixture, '-o', 'x.jpg']],
    ['render', [fixture, '-o', 'x.png', '--width', '1.5']],
    ['render', [fixture, '-o', 'x.png', '--height', '0']],
    ['render', [fixture, '-o', 'x.png', '--exposure', '-1']],
    ['render', [fixture, '-o', 'x.png', '--timeout', '0']],
    ['render', [fixture, '-o', 'x.png', '--width', 'NaN']],
    ['chart', [fixture, '-o', 'x.svg', '--type', 'unknown']],
    ['chart', [fixture, '-o', 'x.svg', '--axis', 'unknown']],
    ['chart', [fixture, '-o', 'x.svg', '--up-axis', 'a']],
    ['chart', [fixture, '-o', 'x.svg', '--lamp-set', '0']],
    ['chart', [fixture, '-o', 'x.svg', '--format', 'unknown']],
    ['chart', [fixture, '-o', 'x.svg', '--mounting-height', '0']],
    ['chart', [fixture, '-o', 'x.svg', '--extent', '-1']],
    ['chart', [fixture, '-o', 'x.svg', '--resolution', '1.5']],
    ['chart', [fixture, '-o', 'x.svg', '--contours', '5,2']],
    ['chart', [fixture, '-o', 'x.svg', '--contours', '1,x']],
    ['chart', [fixture, '-o', 'x.svg', '--min-contour', '0']],
    ['chart', [fixture, '-o', 'x.svg', '--color-scale', 'cubic']],
    ['render', [fixture, '-o', 'x.png', '--type', 'polar']],
    ['chart', [fixture, '-o', 'x.svg', '--browser', 'chrome']],
    ['render', [fixture, fixture, '-o', 'x.png']],
  ] as const)('rejects invalid %s options %j before output creation', (command, argv) =>
    expect(parseImageArguments(command, [...argv])).rejects.toThrow(),
  );
  it.each([
    [{ type: 'pie' }, 'Chart type'],
    [{ axis: 'diagonal' }, 'Axis'],
    [{ upAxis: 'w' }, 'Up axis'],
    [{ colorScale: 'cubic' }, 'Colour scale'],
    [{ timeout: 601 }, 'Timeout'],
    [{ exposure: -1 }, 'Exposure'],
    [{ angle: Infinity }, 'finite number'],
  ])('validates %j without relying on yargs choices', (extra, message) =>
    expect(() => imageOptions('chart', { file: fixture, output: 'x.svg', ...extra })).toThrow(message),
  );
  it('bounds image memory using finite integer dimensions', () => {
    expect(imageDimensions()).toEqual({ width: 1024, height: 768 });
    expect(() => imageDimensions(8193, 10)).toThrow();
  });
});

describe('exclusive image outputs', () => {
  it('does not invoke a renderer or overwrite an existing file', async () => {
    const output = join(await temporary(), 'existing.png');
    await writeFile(output, 'original');
    let invoked = false;
    await expect(
      writeImageExclusively(output, async () => {
        invoked = true;
        return { data: Buffer.from('replacement') };
      }),
    ).rejects.toMatchObject({ code: 'EEXIST' });
    expect(invoked).toBe(false);
    expect(await readFile(output, 'utf8')).toBe('original');
  });
  it('removes its own placeholder after an export failure', async () => {
    const output = join(await temporary(), 'failed.png');
    await expect(
      writeImageExclusively(output, async () => {
        throw new Error('Render failed');
      }),
    ).rejects.toThrow('Render failed');
    await expect(stat(output)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('shared graph exports', () => {
  it.each(['polar', 'cartesian', 'topology', 'isolux'] as const)(
    'exports the shared %s graph as standalone SVG and sized PNG',
    async (type) => {
      const text = await readFile(fixture, 'utf8');
      const svg = await chartPhotometry(text, { type, format: 'svg', width: 420, height: 300, resolution: 11 });
      expect(svg.data.toString()).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg.data.toString()).toContain('width="420" height="300"');
      const png = await chartPhotometry(text, { type, format: 'png', width: 420, height: 300, resolution: 11 });
      const metadata = await (await import('sharp')).default(png.data).metadata();
      expect(metadata).toMatchObject({ width: 420, height: 300, format: 'png' });
    },
  );
  it.each(
    (['polar', 'cartesian', 'topology', 'isolux'] as const).flatMap((type) =>
      [
        [900, 700],
        [700, 900],
        [700, 700],
      ].map(([width, height]) => [type, width!, height!] as const),
    ),
  )('fills the whole %s canvas at %dx%d without letterboxing', async (type, width, height) => {
    const text = await readFile(fixture, 'utf8');
    const svg = (await chartPhotometry(text, { type, format: 'svg', width, height, resolution: 11 })).data.toString();
    const [, , boxWidth, boxHeight] = svg
      .match(/viewBox="([^"]+)"/)![1]!
      .split(' ')
      .map(Number);
    expect(boxWidth! / boxHeight!).toBeCloseTo(width / height, 6);
    const png = await chartPhotometry(text, { type, format: 'png', width, height, resolution: 11 });
    const { data, info } = await (await import('sharp')).default(png.data).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
    const alpha = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    for (let i = 0; i < width; i++) expect([alpha(i, 0), alpha(i, height - 1)]).toEqual([255, 255]);
    for (let i = 0; i < height; i++) expect([alpha(0, i), alpha(width - 1, i)]).toEqual([255, 255]);
  });
  it.each([
    [{ type: 'pie' }, 'Unknown chart type'],
    [{ format: 'jpg' }, 'svg or png'],
    [{ axis: 'diagonal' }, 'Invalid chart axis'],
    [{ upAxis: 'w' }, 'Invalid chart axis'],
    [{ angle: NaN }, 'finite'],
  ])('rejects chart options %j', async (extra, message) => {
    const text = await readFile(fixture, 'utf8');
    await expect(chartPhotometry(text, extra as Parameters<typeof chartPhotometry>[1])).rejects.toThrow(message);
  });
  it('defaults to a 900×700 polar SVG framed at that aspect ratio', async () => {
    const exported = await chartPhotometry(await readFile(fixture, 'utf8'));
    expect(exported).toMatchObject({ type: 'polar', format: 'svg', width: 900, height: 700 });
    const [, , width, height] = exported.data
      .toString()
      .match(/viewBox="([^"]+)"/)![1]!
      .split(' ')
      .map(Number);
    expect(width! / height!).toBeCloseTo(900 / 700, 9);
  });
  it.each([
    [false, /^Wrote .*chart\.svg \(640 × 320; isolux\)$/],
    [true, /"format": "svg"/],
  ])('runs the chart command in-process (json %s)', async (json, report) => {
    const output = join(await temporary(), 'chart.svg');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runImageCommand('chart', {
        input: fixture,
        output,
        json,
        type: 'isolux',
        width: 640,
        height: 320,
        resolution: 11,
      });
      expect(log.mock.calls[0]![0]).toMatch(report);
    } finally {
      log.mockRestore();
    }
    const [, , width, height] = (await readFile(output, 'utf8'))
      .match(/viewBox="([^"]+)"/)![1]!
      .split(' ')
      .map(Number);
    expect(width! / height!).toBeCloseTo(2, 9);
  });
  it('exports LDT input and requires an explicit selection for alternative configurations', async () => {
    const native = parseLDT(serializeLDT(parsePhotometry(await readFile(fixture, 'utf8'))).value);
    native.lampSets[0]!.lampCount = 1;
    native.lampSets.push({
      ...native.lampSets[0]!,
      description: 'Alternative configuration',
      totalLumens: native.lampSets[0]!.totalLumens * 2,
    });
    const text = writeLDT(native);
    await expect(chartPhotometry(text)).rejects.toThrow('lampSetIndex');
    const image = await chartPhotometry(text, { lampSetIndex: 1, format: 'png', width: 320, height: 240 });
    expect(await (await import('sharp')).default(image.data).metadata()).toMatchObject({ width: 320, height: 240 });
  });
  it('runs the chart CLI and preserves existing outputs', async () => {
    const output = join(await temporary(), 'polar.png');
    const report = JSON.parse(
      execFileSync(
        process.execPath,
        [bin, 'chart', fixture, '-o', output, '--width', '320', '--height', '240', '--json'],
        { encoding: 'utf8' },
      ),
    );
    expect(report).toMatchObject({ output, width: 320, height: 240, type: 'polar', format: 'png' });
    const repeat = spawnSync(process.execPath, [bin, 'chart', fixture, '-o', output], { encoding: 'utf8' });
    expect(repeat.status).toBe(1);
    expect(repeat.stderr).toContain('EEXIST');
  });
  it('honors explicit input format over an incorrect filename extension', async () => {
    const directory = await temporary();
    const input = join(directory, 'misnamed.ldt');
    const output = join(directory, 'chart.svg');
    await writeFile(input, await readFile(fixture));
    const failed = spawnSync(process.execPath, [bin, 'chart', input, '-o', output], { encoding: 'utf8' });
    expect(failed.status).toBe(1);
    await expect(stat(output)).rejects.toMatchObject({ code: 'ENOENT' });
    const report = JSON.parse(
      execFileSync(process.execPath, [bin, 'chart', input, '-o', output, '--format', 'ies', '--json'], {
        encoding: 'utf8',
      }),
    );
    expect(report.type).toBe('polar');
    expect(await readFile(output, 'utf8')).toContain('<svg');
  });
  it('rejects render arguments without requiring a browser/GPU in CI', () => {
    const result = spawnSync(process.execPath, [bin, 'render', fixture, '-o', 'bad.svg'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Render output must use .png');
  });
});
