// Regenerates the syntax-highlighting screenshots from the real TextMate grammars:
//   pnpm --filter ies-vscode-extension syntax-images
// Writes images/{ies,ldt}-syntax.png and copies them to the docs site. Not run in CI.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const pkg = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const { INITIAL, Registry } = require('vscode-textmate');
const { createOnigScanner, createOnigString, loadWASM } = require('vscode-oniguruma');
// playwright-core is already installed for @ies-tools/cli; resolve it from there instead of adding a dependency.
const { chromium } = createRequire(new URL('../../cli/package.json', import.meta.url))('playwright-core');

// Lines 1-16 of fixtures/06b4cfdc8805709e767b5e2e904be8ad.ies (from the three.js examples), with one
// user keyword added because the file has none. BEGA's "K3" suffix denotes 3000 K.
const iesLines = readFileSync(new URL('../../fixtures/06b4cfdc8805709e767b5e2e904be8ad.ies', pkg), 'utf8')
  .split(/\r?\n/)
  .slice(0, 16)
  .map((line) => line.trimEnd());
iesLines.splice(8, 0, '[_TEMPCOLOR] 3000K');

// Top of a synthetic EULUMDAT file with a deliberately generic manufacturer.
const ldtLines = [
  'Example Lighting Co.',
  '1',
  '2',
  '24',
  '15',
  '37',
  '2.5',
  'EX-2026-0142',
  'Recessed downlight 150 opal',
  'EX-DL150-OP-830',
  'ex-dl150-op-830.ldt',
  '2026-11-03 / Example Photometry Lab',
  '150',
  '0',
  '95',
  '140',
  '0',
];

// Minimal rule subset from VS Code's Dark Modern theme chain (dark_modern.json includes dark_plus.json,
// which includes dark_vs.json) in microsoft/vscode extensions/theme-defaults/themes, MIT licensed.
const theme = {
  background: '#1f1f1f', // dark_modern editor.background
  foreground: '#cccccc', // dark_modern editor.foreground
  lineNumber: '#6e7681', // dark_modern editorLineNumber.foreground
  rules: {
    keyword: '#569cd6', // dark_vs
    'keyword.control': '#c586c0', // dark_plus overrides dark_vs
    'keyword.operator': '#d4d4d4', // dark_vs
    'entity.name.tag': '#569cd6', // dark_vs
    'entity.other.attribute-name': '#9cdcfe', // dark_vs
    'punctuation.definition.tag': '#808080', // dark_vs
    string: '#ce9178', // dark_vs
    'constant.language': '#569cd6', // dark_vs
    'constant.numeric': '#b5cea8', // dark_vs
  },
};

/** TextMate precedence: the innermost scope with a match wins; within it, the longest matching selector. */
function colorFor(scopes) {
  for (const scope of scopes.toReversed()) {
    const match = Object.keys(theme.rules)
      .filter((selector) => scope === selector || scope.startsWith(`${selector}.`))
      .toSorted((a, b) => b.length - a.length)[0];
    if (match) return theme.rules[match];
  }
  return theme.foreground;
}

await loadWASM(readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')));
const registry = new Registry({
  onigLib: Promise.resolve({ createOnigScanner, createOnigString }),
  loadGrammar: async (scopeName) =>
    JSON.parse(readFileSync(new URL(`syntaxes/${scopeName.slice('source.'.length)}.tmLanguage.json`, pkg), 'utf8')),
});

const escape = (text) => text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

async function html(scopeName, lines) {
  const grammar = await registry.loadGrammar(scopeName);
  let state = INITIAL;
  const rows = lines.map((line, index) => {
    const result = grammar.tokenizeLine(line, state);
    state = result.ruleStack;
    const code = result.tokens
      .map((t) => `<span style="color:${colorFor(t.scopes)}">${escape(line.slice(t.startIndex, t.endIndex))}</span>`)
      .join('');
    return `<div class="row"><span class="ln">${index + 1}</span><span>${code}</span></div>`;
  });
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; background: transparent; }
    #code { display: inline-block; padding: 12px 16px 12px 12px; border-radius: 6px; background: ${theme.background};
      color: ${theme.foreground}; font: 13px/20px Menlo, 'SF Mono', Monaco, Consolas, monospace; white-space: pre; }
    .ln { display: inline-block; width: 2ch; padding-right: 2ch; text-align: right; color: ${theme.lineNumber}; }
  </style><div id="code">${rows.join('')}</div>`;
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  for (const [name, scopeName, lines] of [
    ['ies-syntax.png', 'source.ies', iesLines],
    ['ldt-syntax.png', 'source.eulumdat', ldtLines],
  ]) {
    await page.setContent(await html(scopeName, lines));
    await page.evaluate(() => document.fonts.ready);
    const out = new URL(`images/${name}`, pkg);
    await page.locator('#code').screenshot({ path: out.pathname, omitBackground: true });
    const docs = new URL('../docs/static/img/vscode/', pkg);
    mkdirSync(docs, { recursive: true });
    copyFileSync(out, new URL(name, docs));
    console.log(`wrote images/${name}`);
  }
} finally {
  await browser.close();
}
