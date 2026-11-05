#!/usr/bin/env node
// Regenerates the viewer demo media in packages/docs/static/img/ on a hardware GPU:
//   social-card.png        Open Graph and Twitter image (static, 1200x630)
//   vscode-extension.gif   3D view, Measurement view, then each chart tab
//   viewer-move-light.gif  moving the light in the 3D view
// Usage: pnpm build && pnpm docs:media
// Needs ffmpeg. Not run in CI. Keep the alt text in sync with index.jsx, light-viewer.mdx and vscode.md.
// The VS Code extension's published READMEs link vscode-extension.gif on main, so keep that file name.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchRenderBrowser, requireHardwareGPU } from '../packages/cli/dist/render.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'packages/docs/static/img');
const bundle = readFileSync(join(root, 'packages/viewer/dist/light-viewer.js'));
const light = readFileSync(join(root, 'packages/docs/static/lights/track-light.ies'));
const RAISED = 'floor-distance="3" wall-distance="1"';
const ZOOM_NOTCHES = 13;
const CHART_TABS = ['Polar', 'Cartesian', 'Topology', 'Isolux', 'Cone', 'Luminance', 'Intensity table'];

const html = (attributes) => `<!doctype html>
<style>html,body{margin:0;background:#000}light-viewer{display:block;height:100vh}</style>
<script type="module" src="/light-viewer.js"></script>
<light-viewer src="/light.ies" ${attributes}></light-viewer>`;

async function openViewer(browser, width, height, attributes) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.route('http://media.test/**', (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/light-viewer.js') return route.fulfill({ body: bundle, contentType: 'text/javascript' });
    if (pathname === '/light.ies') return route.fulfill({ body: light, contentType: 'text/plain' });
    return route.fulfill({ body: html(attributes), contentType: 'text/html' });
  });
  await page.goto('http://media.test/');
  const gpu = await page.evaluate(async () => {
    await customElements.whenDefined('light-viewer');
    const viewer = document.querySelector('light-viewer');
    await viewer.whenReady();
    const gl = viewer.shadowRoot.querySelector('canvas').getContext('webgl2');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: gl.getParameter(debug.UNMASKED_VENDOR_WEBGL),
      renderer: gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),
      version: gl.getParameter(gl.VERSION),
    };
  });
  requireHardwareGPU(gpu);
  return page;
}

/** One press, moved through each point in `steps` increments per leg, then released. */
async function drag(page, points, steps, afterStep = async () => {}) {
  await page.mouse.move(...points[0]);
  await page.mouse.down();
  for (let leg = 1; leg < points.length; leg += 1) {
    const [from, to] = [points[leg - 1], points[leg]];
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      await page.mouse.move(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t);
      await afterStep();
    }
  }
  await page.mouse.up();
}

/** Click across the frame until the viewer shows its selection hint, then deselect. The light's pixel depends on the layout. */
async function findLight(page) {
  const hint = page.getByText('Drag to change height');
  for (let y = 60; y <= 400; y += 20)
    for (let x = 300; x <= 540; x += 20) {
      await page.mouse.click(x, y);
      if (await hint.isVisible()) {
        await page.keyboard.press('Escape');
        return [x, y];
      }
    }
  throw new Error('Could not select the light');
}

/** Orbit low and zoom in until the light and its pool on the floor fill the frame. Distances scale with the viewport height. */
async function frameScene(page, height) {
  const k = height / 525;
  await drag(
    page,
    [
      [100 * k, 420 * k],
      [250 * k, 320 * k],
    ],
    10,
  );
  for (let notch = 0; notch < ZOOM_NOTCHES; notch += 1) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(800);
}

/** Encode PNG frames, each shown for its own duration in seconds, as one palette-optimized GIF. */
function encodeGif(frames, output, { colors, width }) {
  const dir = mkdtempSync(join(tmpdir(), 'ies-gif-'));
  try {
    const list = frames.flatMap(({ image, seconds }, index) => {
      const file = join(dir, `${index}.png`);
      writeFileSync(file, image);
      return [`file '${file}'`, `duration ${seconds}`];
    });
    // The concat demuxer ignores the last duration unless the final file is listed again.
    writeFileSync(join(dir, 'list.txt'), [...list, list.at(-2)].join('\n'));
    const filter = `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-v',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        join(dir, 'list.txt'),
        '-vf',
        filter,
        '-loop',
        '0',
        output,
      ],
      { stdio: 'inherit' },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function socialCard(browser) {
  const page = await openViewer(browser, 1200, 630, `${RAISED} view-mode="measurement" settings-panel="hidden"`);
  await frameScene(page, 630);
  await page.screenshot({ path: join(outDir, 'social-card.png') });
  await page.close();
}

async function viewsGif(browser) {
  const page = await openViewer(browser, 840, 525, `${RAISED} charts`);
  await frameScene(page, 525);
  const frames = [];
  const hold = async (seconds) => {
    await page.waitForTimeout(500);
    frames.push({ image: await page.screenshot(), seconds });
  };
  await hold(2.5);
  await page.evaluate(() => document.querySelector('light-viewer').setAttribute('view-mode', 'measurement'));
  await hold(3);
  for (const name of CHART_TABS) {
    await page.locator('light-viewer').getByRole('tab', { name, exact: true }).click();
    await hold(1.8);
  }
  encodeGif(frames, join(outDir, 'vscode-extension.gif'), { colors: 128, width: 840 });
  await page.close();
}

async function moveLightGif(browser) {
  const page = await openViewer(browser, 840, 525, 'wall-distance="1" helper="false"');
  const frames = [];
  const shot = async (seconds = 0.1) => frames.push({ image: await page.screenshot(), seconds });
  const pause = async (seconds) => {
    await page.waitForTimeout(150);
    await shot(seconds);
  };
  const [x, y] = await findLight(page);
  await pause(1);
  await page.mouse.click(x, y);
  await pause(0.8);
  await drag(
    page,
    [
      [x, y],
      [x, y - 110],
      [x + 110, y - 80],
      [x - 70, y - 50],
    ],
    14,
    shot,
  );
  await pause(0.6);
  const height = await page.locator('light-viewer').getAttribute('floor-distance');
  if (height === null || Number(height) === 2) throw new Error(`The light did not move: floor-distance=${height}`);
  await page.keyboard.press('Escape');
  await drag(
    page,
    [
      [60, 420],
      [150, 345],
    ],
    18,
    shot,
  );
  await pause(0.5);
  for (let notch = 0; notch < 8; notch += 1) {
    await page.mouse.wheel(0, -60);
    await page.waitForTimeout(40);
    await shot();
  }
  await pause(1.5);
  encodeGif(frames, join(outDir, 'viewer-move-light.gif'), { colors: 64, width: 720 });
  await page.close();
}

const browser = await launchRenderBrowser(process.env.IES_BROWSER);
try {
  await socialCard(browser);
  await viewsGif(browser);
  await moveLightGif(browser);
} finally {
  await browser.close();
}
