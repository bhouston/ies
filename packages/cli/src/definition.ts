import { createRequire } from 'node:module';
import { mergeDocument, type OpenCliDocument } from '@clidoc/core';
import { fromYargs } from '@clidoc/yargs';
import { command as chart } from './commands/chart.js';
import { command as convert } from './commands/convert.js';
import { command as docgen } from './commands/docgen.js';
import { command as inspect } from './commands/inspect.js';
import { command as render } from './commands/render.js';
import { command as validate } from './commands/validate.js';
import { command as view } from './commands/view.js';

const packageJson = createRequire(import.meta.url)('../package.json') as { version: string; description: string };

export const info = { title: 'ies', binary: 'ies', version: packageJson.version, summary: packageJson.description };
export const commands = [inspect, validate, convert, view, render, chart, docgen];

const badInput = [
  { code: 1, status: 'BAD_USER_INPUT_ERROR', summary: 'Invalid arguments or unreadable input' },
] as const;

/** Documentation and runtime share the same command definitions; this adds what yargs cannot describe. */
export function cliDocument(): OpenCliDocument {
  return mergeDocument(fromYargs(commands, info), {
    info: {
      description: 'Files stay on your computer. The command line has no authentication, telemetry or cloud service.',
      license: { name: 'MIT', spdxId: 'MIT' },
    },
    install: [{ name: 'npm', command: 'npm install -g @ies-tools/cli' }],
    global: {
      flags: [
        { name: 'help', type: 'boolean', aliases: ['h'], summary: 'Show help' },
        { name: 'version', type: 'boolean', aliases: ['v'], summary: 'Show version number' },
      ],
    },
    commands: {
      'ies inspect': {
        exitCodes: [...badInput],
        examples: [
          { title: 'Summary', content: 'ies inspect luminaire.ies' },
          { title: 'JSON for one LDT lamp set', content: 'ies inspect luminaire.ldt --json --lamp-set 2' },
        ],
      },
      'ies validate': {
        exitCodes: [{ code: 1, status: 'BAD_USER_INPUT_ERROR', summary: 'The file is invalid or unreadable' }],
        examples: [{ title: 'Treat warnings as failures', content: 'ies validate luminaire.ies --strict' }],
      },
      'ies convert': {
        exitCodes: [...badInput],
        examples: [
          { title: 'Native JSON', content: 'ies convert luminaire.ies -o luminaire.json' },
          { title: 'LDT to IES', content: 'ies convert luminaire.ldt --to ies --lamp-set 1 -o luminaire.ies' },
        ],
      },
      'ies view': {
        exitCodes: [...badInput],
        examples: [{ title: 'Open in the browser', content: 'ies view luminaire.ies --open' }],
      },
      'ies render': {
        exitCodes: [...badInput],
        examples: [{ title: 'PNG', content: 'ies render luminaire.ies -o luminaire.png --exposure 7' }],
        flags: [{ name: 'browser', alternativeSources: [{ type: '$ENV', property: 'IES_BROWSER' }] }],
      },
      'ies chart': {
        exitCodes: [...badInput],
        examples: [
          { title: 'Polar SVG', content: 'ies chart luminaire.ies -o polar.svg' },
          { title: 'Isolux PNG', content: 'ies chart luminaire.ies -o isolux.png --type isolux --mounting-height 3' },
          {
            title: 'Isolux with explicit contours',
            content:
              'ies chart luminaire.ies -o isolux.svg --type isolux --extent 30 --contours 1,2,5,10 --color-scale linear',
          },
        ],
      },
      'ies docgen': { examples: [{ title: 'JSON', content: 'ies docgen -o ies.json' }] },
    },
  });
}
