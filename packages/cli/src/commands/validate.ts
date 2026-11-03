import { defineCommand } from 'yargs-file-commands';
import { inputOptions, readInput } from '../options.js';
import { inspectPhotometry, validatePhotometry } from '../photometry.js';

export const command = defineCommand({
  command: 'validate <file>',
  describe: 'Validate numeric data and metadata; exits 1 when the file is invalid',
  builder: (yargs) =>
    inputOptions(yargs)
      .option('json', { type: 'boolean', describe: 'Emit diagnostics and the summary as JSON' })
      .option('strict', { type: 'boolean', describe: 'Treat warnings as failures' }),
  handler: async (argv) => {
    const { file } = argv;
    const { text, format, lampSetIndex } = await readInput(argv);
    const result = validatePhotometry(text, format, argv.strict ?? false, lampSetIndex);
    if (argv.json) {
      const summary =
        result.profile && !result.diagnostics.some((item) => item.severity === 'error')
          ? inspectPhotometry(text, format, lampSetIndex)
          : {};
      console.log(
        JSON.stringify(
          { valid: result.valid, file, ...summary, sourceFormat: format, diagnostics: result.diagnostics },
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
  },
});
