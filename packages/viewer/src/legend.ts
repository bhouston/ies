import { formatGraphValue, illuminanceRampRgb, logRadius, type IlluminanceLegend } from '@ies-tools/core';

const STOPS = 10;
const GRADIENT = `linear-gradient(to top, ${Array.from(
  { length: STOPS + 1 },
  (_, i) => `rgb(${illuminanceRampRgb(i / STOPS).join(' ')}) ${(i / STOPS) * 100}%`,
).join(', ')})`;

/**
 * Fill `root` with a vertical false-colour bar and its isolux levels, or empty it when `legend` is undefined.
 * Styles are inline so the legend renders the same in the shadow DOM and in React hosts.
 */
export function renderIlluminanceLegend(root: HTMLElement, legend: IlluminanceLegend | undefined): void {
  root.replaceChildren();
  root.hidden = !legend;
  if (!legend) return;
  const document = root.ownerDocument;
  const element = (style: string, text = '') => {
    const node = document.createElement('div');
    node.style.cssText = style;
    node.textContent = text;
    return node;
  };
  const title = element('font-weight:600;margin-bottom:6px;white-space:nowrap', `Illuminance (${legend.unit})`);
  const peak = element(
    'color:#b7c1ce;margin-bottom:8px;white-space:nowrap',
    `peak ${formatGraphValue(legend.peakValue)}`,
  );
  const body = element('position:relative;display:flex;height:200px');
  const bar = element(`position:relative;width:12px;border-radius:2px;background:${GRADIENT}`);
  const labels = element('position:relative;margin-left:6px;min-width:2.5em');
  for (const level of legend.levels) {
    const top = `${(1 - logRadius(level.lux, legend.peak, legend.decades)) * 100}%`;
    bar.append(element(`position:absolute;left:0;right:0;top:${top};height:1px;background:rgb(255 255 255 / 80%)`));
    labels.append(
      element(`position:absolute;top:${top};transform:translateY(-50%);line-height:1`, formatGraphValue(level.value)),
    );
  }
  body.append(bar, labels);
  root.append(title, peak, body);
}
