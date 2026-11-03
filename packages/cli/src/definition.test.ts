import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { validate } from '@clidoc/core';
import { describe, expect, it } from 'vitest';
import { cliDocument } from './definition.js';

describe('OpenCLI document', () => {
  const document = cliDocument();
  it('is schema-valid and generated from every yargs command', () => {
    expect(validate(document)).toEqual({ valid: true, errors: [] });
    expect(Object.keys(document.commands!).toSorted()).toEqual(
      ['chart', 'convert', 'docgen', 'inspect', 'render', 'validate', 'view'].map((name) => `ies ${name}`),
    );
    expect(document.commands!['ies chart']!.flags).toContainEqual(
      expect.objectContaining({ name: 'mounting-height', type: 'number', default: 2 }),
    );
  });
  it('is served by docgen and __opencli', () => {
    const bin = resolve('packages/cli/bin/cli.js');
    const run = (...args: string[]) => execFileSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
    expect(JSON.parse(run('__opencli'))).toEqual(document);
    expect(JSON.parse(run('docgen'))).toEqual(document);
    expect(run('docgen', '--format', 'markdown')).toContain('ies convert');
  });
});
