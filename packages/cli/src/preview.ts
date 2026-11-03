import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { parsePhotometry } from '@ies-tools/core';
import type { InputFormat } from './photometry.js';

export interface PreviewServer {
  server: Server;
  url: string;
}

/** Start a loopback-only preview server. Its input is captured, never resolved from request paths. */
export async function servePreview(
  text: string,
  port = 0,
  options: { format?: InputFormat; lampSetIndex?: number } = {},
): Promise<PreviewServer> {
  const document = parsePhotometry(text, options.format, { lampSetIndex: options.lampSetIndex });
  if (document.profile.photometricType !== 1) throw new Error('Preview supports Type C photometry only (type 1)');
  const profilePath = `/profile.${document.sourceFormat}`;
  const selection = options.lampSetIndex === undefined ? '' : ` lamp-set-index="${options.lampSetIndex}"`;
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new RangeError('Port must be an integer from 0 to 65535');
  const bundle = await readFile(new URL('../media/light-viewer.js', import.meta.url));
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Photometric Light Viewer</title><style>html,body{margin:0;background:#000;color:#fff;font-family:system-ui}light-viewer{display:block;width:100vw;height:100vh}</style><light-viewer src="${profilePath}" format="${document.sourceFormat}"${selection}></light-viewer><script type="module" src="/light-viewer.js"></script></html>`;
  const server = createServer((request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'",
    );
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const path = request.url?.split('?')[0];
    const route =
      path === '/'
        ? ([html, 'text/html; charset=utf-8'] as const)
        : path === profilePath
          ? ([text, 'text/plain; charset=utf-8'] as const)
          : path === '/light-viewer.js'
            ? ([bundle, 'application/javascript'] as const)
            : null;
    if (!route) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': route[1] });
    response.end(request.method === 'HEAD' ? undefined : route[0]);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to determine preview port');
  return { server, url: `http://127.0.0.1:${address.port}/` };
}
