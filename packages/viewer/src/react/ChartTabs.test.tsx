// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseIES } from '@ies-tools/core';
import { ChartTabs, type ViewerTab } from './ChartTabs.js';

const typeC = parseIES('IESNA:LM-63-2002\nTILT=NONE\n1 -1 1 3 1 1 2 0 0 0\n1 1 10\n0 90 180\n0\n100 20 0\n');
let root: Root | undefined;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});
async function show(tab: ViewerTab, profile = typeC) {
  if (!root) {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }
  await act(async () =>
    root!.render(<ChartTabs tab={tab} onTabChange={() => {}} profile={profile} mountingHeight={2} />),
  );
}
const checkbox = () => document.querySelector<HTMLInputElement>('input[name="logScale"]');
const title = () => document.querySelector('svg title')?.textContent ?? '';

describe('ChartTabs log-scale toggle', () => {
  it('toggles the polar and Cartesian charts and keeps the choice across tabs', async () => {
    await show('polar');
    expect(checkbox()!.checked).toBe(false);
    expect(title()).not.toContain('log scale');
    await act(async () => checkbox()!.click());
    expect(checkbox()!.checked).toBe(true);
    expect(title()).toContain('polar');
    expect(title()).toContain('log scale');
    await show('cartesian');
    expect(checkbox()!.checked).toBe(true);
    expect(title()).toContain('cartesian');
    expect(title()).toContain('log scale');
    await act(async () => checkbox()!.click());
    expect(title()).not.toContain('log scale');
  });
  it('hides the toggle where it does not apply', async () => {
    await show('topology');
    expect(checkbox()).toBeNull();
    await show('isolux');
    expect(checkbox()).toBeNull();
    await show('3d');
    expect(document.querySelector('[role="tabpanel"]')).toBeNull();
  });
  it('reports loading and unsupported photometry instead of a chart', async () => {
    await act(async () => {
      const container = document.createElement('div');
      document.body.append(container);
      root = createRoot(container);
      root.render(<ChartTabs tab="polar" onTabChange={() => {}} mountingHeight={2} />);
    });
    expect(document.body.textContent).toContain('Loading photometry');
    await show('polar', { ...typeC, photometricType: 2 });
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('Type C');
    expect(checkbox()).toBeNull();
  });
});
