import React, { useEffect } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';

// The docs generation step copies the workspace standalone bundle to static/viewer.
// Keep it out of webpack, which breaks the bundle's native custom-element class.

export default function LiveLightViewer({ src = '/lights/track-light.ies', style, ...attributes }) {
  const url = useBaseUrl(src);
  const bundleUrl = useBaseUrl('/viewer/light-viewer.js');
  useEffect(() => {
    import(/* webpackIgnore: true */ bundleUrl);
  }, [bundleUrl]);
  return <light-viewer src={url} style={{ display: 'block', height: 480, ...style }} {...attributes} />;
}
