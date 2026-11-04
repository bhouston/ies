import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Computed styles from the published shadow stylesheet in a real browser (#144).
// Only CSS is exercised, so no WebGL context is created.
const css = readFileSync(new URL('../dist/viewer.css', import.meta.url), 'utf8');

const HSL_HOST_TOKENS = `:root {
  --background: 40 20% 97%; --foreground: 222 39% 11%; --card: 0 0% 100%;
  --input: 30 10% 88%; --primary: 222 74% 35%; --primary-foreground: 40 20% 97%;
  --popover: 0 0% 100%; --border: 30 10% 80%;
}
body { color: hsl(var(--foreground)); }`;

const DEFAULTS = { tabBg: 'rgb(14, 18, 24)', tabText: 'rgb(229, 231, 235)', toggleBg: 'rgb(32, 37, 46)' };

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  page = await browser.newPage();
  // A cold CI runner can take well over the default 10 s hook timeout to start Chrome.
}, 60_000);
afterAll(async () => browser?.close());

async function mount(pageCss: string) {
  await page.setContent(`<style>${pageCss}</style><test-viewer></test-viewer>`);
  await page.evaluate((shadowCss) => {
    const host = document.querySelector('test-viewer')!;
    host.attachShadow({ mode: 'open' }).innerHTML = `<style>${shadowCss}</style>
      <div class="bg-card"><button id="tab" class="border-border bg-background text-foreground">3D</button></div>
      <div id="toggle" class="bg-input"><button id="on" aria-pressed="true" class="text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground">m</button></div>
      <div id="panel" class="bg-popover text-popover-foreground">Options</div>`;
  }, css);
}

function read() {
  return page.evaluate(() => {
    const root = document.querySelector('test-viewer')!.shadowRoot!;
    const style = (id: string) => getComputedStyle(root.getElementById(id)!);
    return {
      tabBg: style('tab').backgroundColor,
      tabText: style('tab').color,
      toggleBg: style('toggle').backgroundColor,
      onBg: style('on').backgroundColor,
      panelBg: style('panel').backgroundColor,
    };
  });
}

describe('<light-viewer> theme tokens', () => {
  it('uses readable defaults without host tokens', async () => {
    await mount('');
    expect(await read()).toMatchObject(DEFAULTS);
  });

  it('ignores generic HSL-channel host tokens', async () => {
    await mount(HSL_HOST_TOKENS);
    const s = await read();
    expect(s).toMatchObject(DEFAULTS);
    expect(s.panelBg).toBe('rgb(17, 24, 32)');
    expect(s.onBg).toBe('rgb(125, 211, 252)');
  });

  it('applies namespaced complete colours, including an explicit host mapping', async () => {
    await mount(`${HSL_HOST_TOKENS}
      test-viewer {
        --ies-viewer-background: hsl(var(--background));
        --ies-viewer-foreground: hsl(var(--foreground));
        --ies-viewer-input: #e0dcd8;
        --ies-viewer-primary: rgb(1 2 3);
      }`);
    expect(await read()).toMatchObject({
      tabBg: 'rgb(249, 248, 246)',
      tabText: 'rgb(17, 24, 39)',
      toggleBg: 'rgb(224, 220, 216)',
      onBg: 'rgb(1, 2, 3)',
    });
  });

  it('follows token changes after mount', async () => {
    await mount('');
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('test-viewer')!;
      host.style.setProperty('--ies-viewer-background', '#ffffff');
      host.style.setProperty('--ies-viewer-popover', '#fafafa');
    });
    const s = await read();
    expect(s.tabBg).toBe('rgb(255, 255, 255)');
    expect(s.panelBg).toBe('rgb(250, 250, 250)');
  });
});
