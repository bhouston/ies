import type { Browser } from 'playwright-core';
import { parsePhotometry, serializeIES } from 'ies-core';
import { servePreview } from './index.js';

export interface HardwareGPUInfo {
  vendor: string;
  renderer: string;
  version: string;
}
export interface RenderOptions {
  width?: number;
  height?: number;
  exposure?: number;
  browser?: string;
  /** Browser startup/load/render timeout in seconds. */
  timeout?: number;
  lampSetIndex?: number;
}
export interface RenderedPhotometry {
  png: Buffer;
  width: number;
  height: number;
  gpu: HardwareGPUInfo;
}

/** A named vendor/adapter must identify actual hardware; software and generic masked strings are rejected. */
export function requireHardwareGPU(info: HardwareGPUInfo): void {
  const identification = `${info.vendor} ${info.renderer}`;
  if (
    /swiftshader|llvmpipe|lavapipe|softpipe|software|basic render|microsoft basic|mesa offscreen/i.test(identification)
  )
    throw new Error(`Hardware WebGL is required; software renderer rejected: ${info.renderer}`);
  if (!/apple|nvidia|geforce|quadro|amd|radeon|\bati\b|intel|adreno|mali|powervr|vivante|broadcom/i.test(info.renderer))
    throw new Error(`Unable to confirm a hardware GPU from WebGL renderer: ${info.renderer || '(unavailable)'}`);
  if (!/WebGL 2/i.test(info.version)) throw new Error(`The shared viewer requires WebGL 2: ${info.version}`);
}
export function imageDimensions(width = 1024, height = 768): { width: number; height: number } {
  if (![width, height].every((value) => Number.isInteger(value) && value >= 1 && value <= 8192))
    throw new RangeError('Image width and height must be integers from 1 to 8192');
  return { width, height };
}

/** Prefer installed Chrome/Edge, then a preinstalled Playwright Chromium. Never download a browser automatically. */
export async function launchRenderBrowser(executablePath?: string, timeout = 60): Promise<Browser> {
  const { chromium } = await import('playwright-core');
  const shared = {
    headless: true,
    timeout: timeout * 1000,
    args: process.platform === 'darwin' ? ['--enable-gpu', '--use-angle=metal'] : ['--enable-gpu'],
    ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
  };
  const attempts = executablePath
    ? [() => chromium.launch({ ...shared, executablePath })]
    : [
        () => chromium.launch({ ...shared, channel: 'chrome' }),
        () => chromium.launch({ ...shared, channel: 'msedge' }),
        () => chromium.launch(shared),
      ];
  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      errors.push((error instanceof Error ? error.message : String(error)).split('\n')[0]!);
    }
  }
  throw new Error(
    `ies render needs an installed hardware-capable Chromium browser. Install Chrome/Edge or set IES_BROWSER/--browser.\n${errors.map((error) => `  ${error}`).join('\n')}`,
  );
}

const initialState = `
window.__iesImageState = { loaded: false, error: '' };
document.addEventListener('load', (event) => {
  if (event.target && event.target.localName === 'light-viewer') window.__iesImageState.loaded = true;
}, true);
document.addEventListener('error', (event) => {
  if (event.target && event.target.localName === 'light-viewer') window.__iesImageState.error = event.detail?.message || 'Shared viewer failed';
}, true);`;
const gpuState = `(() => {
  const canvas = document.querySelector('light-viewer')?.shadowRoot?.querySelector('canvas');
  const gl = canvas?.getContext('webgl2');
  if (!gl) throw new Error('A WebGL 2 context is required to export the shared viewer');
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return { vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : '', renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : '', version: gl.getParameter(gl.VERSION) };
})()`;

/** Capture the same custom element used by `ies view`, after checking its real renderer and completing GPU work. */
export async function renderPhotometry(text: string, options: RenderOptions = {}): Promise<RenderedPhotometry> {
  const { width, height } = imageDimensions(options.width, options.height);
  const exposure = options.exposure ?? 1;
  const timeout = options.timeout ?? 60;
  if (!Number.isFinite(exposure) || exposure < 0) throw new RangeError('Exposure must be finite and nonnegative');
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 600)
    throw new RangeError('Timeout must be between 0 and 600 seconds');
  const document = parsePhotometry(text, undefined, { lampSetIndex: options.lampSetIndex });
  const preview = await servePreview(serializeIES(document).value);
  let browser: Browser | undefined;
  try {
    browser = await launchRenderBrowser(options.browser ?? process.env.IES_BROWSER, timeout);
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript({ content: initialState });
    await page.goto(preview.url, { waitUntil: 'networkidle', timeout: timeout * 1000 });
    await page.waitForFunction('window.__iesImageState?.loaded || window.__iesImageState?.error', undefined, {
      timeout: timeout * 1000,
    });
    const state = await page.evaluate<{ loaded: boolean; error: string }>('window.__iesImageState');
    if (state.error) throw new Error(state.error);
    const gpu = await page.evaluate<HardwareGPUInfo>(gpuState);
    requireHardwareGPU(gpu);
    // Attribute updates invoke the shared viewer's synchronous render. finish() waits for that GPU work.
    const glError = await page.evaluate<number>(`(() => {
      const viewer = document.querySelector('light-viewer');
      viewer.setAttribute('exposure', ${JSON.stringify(exposure)});
      const gl = viewer.shadowRoot.querySelector('canvas').getContext('webgl2');
      gl.finish();
      return gl.getError();
    })()`);
    if (glError !== 0) throw new Error(`WebGL failed while completing the image (error ${glError})`);
    if (pageErrors.length) throw new Error(`Shared viewer error: ${pageErrors.join('; ')}`);
    const png = await page.screenshot({ type: 'png', animations: 'disabled', timeout: timeout * 1000 });
    return { png, width, height, gpu };
  } finally {
    await browser?.close();
    preview.server.closeAllConnections();
    await new Promise<void>((resolve, reject) => preview.server.close((error) => (error ? reject(error) : resolve())));
  }
}
