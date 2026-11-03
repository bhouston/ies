// Replaced with a static CSS string in dist/ by build-element.mjs; the standalone
// esbuild bundle inlines the same stylesheet. No runtime CSS loader is required.
declare const __IES_VIEWER_STYLES__: string;
export const ELEMENT_STYLES = typeof __IES_VIEWER_STYLES__ === 'undefined' ? '' : __IES_VIEWER_STYLES__;
