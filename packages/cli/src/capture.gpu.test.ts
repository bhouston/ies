import { describe, expect, it } from 'vitest';
import { iesSource } from '../../core/test/iesSource.js';
import { servePreview } from './preview.js';
import { launchRenderBrowser, requireHardwareGPU, type HardwareGPUInfo } from './render.js';

// Needs a real hardware GPU and an installed Chrome/Edge, so CI skips it: IES_GPU_TESTS=1 pnpm test capture.gpu
describe.skipIf(!process.env.IES_GPU_TESTS)('<light-viewer> whenReady/toBlob on a hardware GPU', () => {
  it('captures nonempty PNG, JPEG and WebP at requested sizes and rejects malformed input', async () => {
    const preview = await servePreview(iesSource());
    const browser = await launchRenderBrowser(process.env.IES_BROWSER);
    try {
      const page = await browser.newPage({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 });
      await page.goto(preview.url);
      const result = await page.evaluate(async () => {
        const viewer = document.querySelector('light-viewer') as HTMLElement & {
          whenReady(): Promise<void>;
          toBlob(options?: object): Promise<Blob>;
          photometryText: string;
        };
        await customElements.whenDefined('light-viewer');
        await viewer.whenReady();
        const gl = viewer.shadowRoot!.querySelector('canvas')!.getContext('webgl2')!;
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        const gpu = {
          vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : '',
          renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : '',
          version: gl.getParameter(gl.VERSION),
        };
        const images = [];
        for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
          const blob = await viewer.toBlob({ type, quality: 0.9, width: 256, height: 128 });
          const bitmap = await createImageBitmap(blob);
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d')!;
          context.drawImage(bitmap, 0, 0);
          const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
          let lit = 0;
          for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! + pixels[i + 1]! + pixels[i + 2]! > 30) lit++;
          images.push({
            type: blob.type,
            width: bitmap.width,
            height: bitmap.height,
            litFraction: lit / (pixels.length / 4),
            magic: Array.from(new Uint8Array(await blob.slice(0, 12).arrayBuffer())),
          });
        }
        const canvasSize = [viewer.shadowRoot!.querySelector('canvas')!.width, 300];
        viewer.setAttribute('errors', 'silent');
        viewer.photometryText = 'not photometry';
        const malformed = await viewer.whenReady().then(
          () => 'resolved',
          (error: Error) => error.message,
        );
        return { gpu, images, canvasSize, malformed };
      });
      requireHardwareGPU(result.gpu as HardwareGPUInfo);
      const [png, jpeg, webp] = result.images;
      expect(png!.type).toBe('image/png');
      expect(png!.magic.slice(0, 4)).toEqual([0x89, 0x50, 0x4e, 0x47]);
      expect(jpeg!.type).toBe('image/jpeg');
      expect(jpeg!.magic.slice(0, 3)).toEqual([0xff, 0xd8, 0xff]);
      expect(webp!.type).toBe('image/webp');
      expect(String.fromCharCode(...webp!.magic.slice(8, 12))).toBe('WEBP');
      for (const image of result.images) {
        expect([image.width, image.height]).toEqual([256, 128]);
        // The lit floor and wall fill much of the frame; a blank or black capture fails here.
        expect(image.litFraction).toBeGreaterThan(0.2);
      }
      // The on-screen canvas is restored after a sized capture.
      expect(result.canvasSize[0]).toBe(400);
      expect(result.malformed).not.toBe('resolved');
    } finally {
      await browser.close();
      preview.server.closeAllConnections();
      preview.server.close();
    }
  });
});
