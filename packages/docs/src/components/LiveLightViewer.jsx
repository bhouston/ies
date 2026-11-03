import React, { useEffect } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';

// The published self-contained bundle, loaded exactly as the <light-viewer> guide shows. It must stay out of
// webpack: Docusaurus transpiles workspace packages, which breaks the bundle's native custom-element class.
const BUNDLE = 'https://cdn.jsdelivr.net/npm/@ies-tools/viewer/dist/light-viewer.js';

export default function LiveLightViewer({ src = '/lights/track-light.ies', style, ...attributes }) {
  const url = useBaseUrl(src);
  useEffect(() => {
    import(/* webpackIgnore: true */ BUNDLE);
  }, []);
  return <light-viewer src={url} style={{ display: 'block', height: 480, ...style }} {...attributes} />;
}
