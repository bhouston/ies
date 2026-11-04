import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('published viewer stylesheet', () => {
  it('ships compiled utilities and inherited theme fallbacks for the shadow root', () => {
    const css = readFileSync(new URL('../dist/viewer.css', import.meta.url), 'utf8');
    expect(css).toContain('var(--popover,#111820)');
    expect(css).toContain('var(--foreground,#e5e7eb)');
    expect(css).toContain('.settings-panel');
    expect(css).toContain('.pointer-events-auto');
    expect(css).toContain(':host');
    expect(css).not.toMatch(/:host\s*\{[^}]*--popover:/);
    // A top margin on the tabbed viewport collapses through :host and shifts the element (#120).
    expect(css).not.toMatch(/\.viewport\.with-tabs\s*\{[^}]*margin/);
    expect(css).toMatch(/\.viewport\.with-tabs\s*\{[^}]*position:\s*absolute/);
  });
  it('imports the built custom element on Node without HTMLElement or a CSS loader', () => {
    const target = fileURLToPath(new URL('../dist/element.js', import.meta.url));
    const result = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(target)}); console.log(typeof HTMLElement);`],
      { encoding: 'utf8' },
    );
    expect(result.trim()).toBe('undefined');
  });
});
