import { readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { parseIES, parseLDT, parsePhotometry, serializeIES, serializeLDT } from '@ies-tools/core';
import { inputFormat, inspectPhotometry, validatePhotometry, type InputFormat } from './photometry.js';

export const help = `ies — photometric lighting tools

Usage:
  ies inspect <file.ies|file.ldt> [--json] [--lamp-set N]  Show source and photometric statistics
  ies validate <file.ies|file.ldt> [--json] [--strict]    Validate numeric data and metadata
  ies convert <file> [--to ies|ldt|json] [-o file]       Convert locally (JSON by default)
  ies view <file.ies|file.ldt> [--port 0] [--open]        Serve a local interactive light preview
  ies render <file> -o output.png [--width 1024 --height 768 --exposure 1]
  ies chart <file> -o output.svg [--type polar|cartesian|topology|isolux]
  ies --help
  ies --version

All file commands accept --format ies|ldt to override extension/content detection.
--lamp-set N selects one alternative LDT lamp configuration (1-based).
The viewer binds to 127.0.0.1; press Ctrl+C to stop. Files remain on your computer.
`;

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

export async function main(argv = process.argv.slice(2)): Promise<void> {
  if (argv.length === 0 || (argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0]!))) {
    console.log(help);
    return;
  }
  if (argv.length === 1 && ['--version', '-v'].includes(argv[0]!)) {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    console.log(pkg.version);
    return;
  }
  const [command, ...rest] = argv;
  if (command === 'render' || command === 'chart') {
    await (await import('./images.js')).runImageCommand(command, rest);
    return;
  }
  if (!['inspect', 'validate', 'convert', 'view'].includes(command!))
    throw new Error(`Unknown command: ${command}. Run ies --help.`);
  let file: string | undefined;
  let json = false;
  let strict = false;
  let output: string | undefined;
  let port = 0;
  let open = false;
  let formatHint: InputFormat | undefined;
  let lampSetIndex: number | undefined;
  let target: 'ies' | 'ldt' | 'json' = 'json';
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === '--json' && (command === 'inspect' || command === 'validate')) json = true;
    else if (arg === '--strict' && command === 'validate') strict = true;
    else if (arg === '--format') {
      const value = rest[++i];
      if (value !== 'ies' && value !== 'ldt') throw new Error('Input format must be ies or ldt');
      formatHint = value;
    } else if (arg === '--lamp-set') {
      const value = rest[++i];
      if (!value || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw new Error('Lamp set must be a positive integer (1-based)');
      lampSetIndex = Number(value) - 1;
    } else if (arg === '--to' && command === 'convert') {
      const value = rest[++i];
      if (value !== 'ies' && value !== 'ldt' && value !== 'json')
        throw new Error('Conversion target must be ies, ldt or json');
      target = value;
    } else if ((arg === '-o' || arg === '--output') && command === 'convert') {
      output = rest[++i];
      if (!output || output.startsWith('-')) throw new Error('Missing output file');
    } else if (arg === '--port' && command === 'view') {
      const value = rest[++i];
      if (!value || !/^\d+$/.test(value)) throw new Error('Missing or invalid port');
      port = Number(value);
    } else if (arg === '--open' && command === 'view') open = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (file) throw new Error('Expected exactly one input file');
    else file = arg;
  }
  if (!file) throw new Error(`Missing input file. Run ies ${command} <file.ies>.`);
  const text = await readFile(file, 'utf8');
  const format = inputFormat(text, file, formatHint);
  if (format === 'ies' && lampSetIndex !== undefined) throw new Error('--lamp-set applies to LDT inputs only');
  if (command === 'validate') {
    const result = validatePhotometry(text, format, strict, lampSetIndex);
    if (json) {
      console.log(
        JSON.stringify(
          {
            valid: result.valid,
            file,
            ...(result.profile && !result.diagnostics.some((item) => item.severity === 'error')
              ? inspectPhotometry(text, format, lampSetIndex)
              : {}),
            sourceFormat: format,
            diagnostics: result.diagnostics,
          },
          null,
          2,
        ),
      );
    } else {
      const label = result.valid ? 'valid' : 'invalid';
      const message = `${file}: ${label}${result.profile ? ` ${format === 'ies' ? 'IES LM-63' : 'EULUMDAT LDT'}` : ''}`;
      if (result.valid) console.log(message);
      else console.error(message);
      for (const diagnostic of result.diagnostics) {
        console.error(
          `${diagnostic.severity} [${diagnostic.code}]${diagnostic.field ? ` (${diagnostic.field})` : ''}: ${diagnostic.message}`,
        );
      }
    }
    if (!result.valid) process.exitCode = 1;
    return;
  }
  if (command === 'inspect') {
    const summary = inspectPhotometry(text, format, lampSetIndex);
    if (json) console.log(JSON.stringify(summary, null, 2));
    else {
      const dimensions = summary.dimensions;
      const lines = [
        file,
        `Format: ${summary.format}`,
        `Version: ${summary.version}`,
        `Photometric type: Type ${summary.photometricTypeName} (${summary.photometricType})`,
        `Photometry: ${summary.photometry}`,
        `Manufacturer: ${summary.manufacturer}`,
        `Luminaire: ${summary.luminaire}`,
        `Light source: ${summary.lightSource}`,
        `Lamp catalog: ${summary.lampCatalog}`,
        `Lamp count: ${summary.lampCount ?? 'select a lamp configuration'}`,
        `Lumens per lamp: ${summary.lumensPerLamp === null ? 'select a lamp configuration' : summary.lumensPerLamp === -1 ? 'not specified (absolute photometry)' : `${summary.lumensPerLamp} lm`}`,
        `Input power: ${summary.inputWatts === null ? 'select a lamp configuration' : `${summary.inputWatts} W`}`,
        `Peak intensity: ${summary.peakCandela === null ? 'select a lamp configuration' : `${summary.peakCandela} cd`}`,
        `Declared lamp flux: ${summary.declaredLampFluxLumens === null ? 'not specified (absolute photometry)' : `${summary.declaredLampFluxLumens} lm (lamp rating, not luminaire output)`}`,
        ...(summary.declaredLuminaireFluxLumens === null
          ? []
          : [`Declared luminaire flux: ${summary.declaredLuminaireFluxLumens} lm (source rating)`]),
        `Integrated luminaire flux: ${summary.integratedFluxLumens === null ? (summary.photometricType === 1 ? 'unavailable (select a lamp configuration)' : 'unavailable (Type C only)') : `${summary.integratedFluxLumens.toFixed(3)} lm (angular table estimate)`}`,
        `Integrated luminous efficacy: ${summary.luminousEfficacyLumensPerWatt === null ? 'unavailable (unsupported coordinates or zero input power)' : `${summary.luminousEfficacyLumensPerWatt.toFixed(3)} lm/W`}`,
        `Metrics lamp tilt: ${summary.metricsTiltDegrees}°`,
        ...(summary.metricsUnsupportedReason ? [`Metrics: ${summary.metricsUnsupportedReason}`] : []),
        ...summary.beamAngles.map(
          (cut) =>
            `C${cut.horizontalDegrees}–C${(cut.horizontalDegrees + 180) % 360} beam / field estimate: ${cut.beamAngleDegrees === null ? `unavailable (${cut.beamAngleStatus})` : `${cut.beamAngleDegrees.toFixed(3)}°`} / ${cut.fieldAngleDegrees === null ? `unavailable (${cut.fieldAngleStatus})` : `${cut.fieldAngleDegrees.toFixed(3)}°`} (peak direction ${cut.peakDirectionDegrees}°)`,
        ),
        `Angles: ${summary.verticalAngles} vertical × ${summary.horizontalAngles} horizontal`,
        `Dimensions (width × length × height): ${dimensions.width} × ${dimensions.length} × ${dimensions.height} ${summary.units}`,
        `Tilt correction: ${summary.hasTilt ? 'embedded' : 'none'}`,
        ...(summary.fileGenerationType === null
          ? []
          : [
              `File generation type: ${summary.fileGenerationType.toFixed(5)} (provenance, not an intensity multiplier)`,
            ]),
      ];
      const metadata = Object.entries(summary.metadata).map(([key, value]) => `${key}: ${value}`);
      const diagnostics = summary.diagnostics.map((item) => `${item.severity} [${item.code}]: ${item.message}`);
      const lampSets =
        summary.sourceFormat === 'ldt'
          ? summary.lampSets.map(
              (set, index) =>
                `Lamp configuration ${index + 1}${summary.selectedLampSetIndex === index ? ' (selected)' : ''}: ${set.description || 'not specified'}; ${set.totalLumens} lm; ${set.watts} W`,
            )
          : [];
      console.log(
        [...lines, ...lampSets, ...(metadata.length ? ['Metadata:', ...metadata] : []), ...diagnostics].join('\n'),
      );
    }
  } else if (command === 'convert') {
    const native = format === 'ies' ? parseIES(text) : parseLDT(text);
    if (
      format === 'ldt' &&
      'lampSets' in native &&
      native.lampSets.length > 1 &&
      target === 'ies' &&
      lampSetIndex === undefined
    )
      throw new Error('This file has alternative lamp configurations; select one with --lamp-set N');
    const conversion =
      target === 'json'
        ? { value: `${JSON.stringify(native, null, 2)}\n`, warnings: [] }
        : target === 'ies'
          ? serializeIES(native, { lampSetIndex })
          : serializeLDT(native, { lampSetIndex });
    const converted = conversion.value;
    for (const warning of conversion.warnings) console.error(`warning [${warning.code}]: ${warning.message}`);
    if (output) await writeFile(output, converted, { flag: 'wx' });
    else process.stdout.write(converted);
  } else {
    if (format === 'ldt' && lampSetIndex === undefined && parseLDT(text).lampSets.length > 1)
      throw new Error('This file has alternative lamp configurations; select one with --lamp-set N');
    const preview = await servePreview(text, port, { format, lampSetIndex });
    console.log(`Photometric preview: ${preview.url}\nPress Ctrl+C to stop.`);
    const stop = () => {
      preview.server.closeAllConnections();
      preview.server.close();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    preview.server.once('close', () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    });
    if (open) {
      const executable =
        process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open';
      const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', preview.url] : [preview.url];
      spawn(executable, args, { stdio: 'ignore' }).on('error', (error) =>
        console.error(`Could not open browser: ${error.message}. Open ${preview.url} manually.`),
      );
    }
  }
}
