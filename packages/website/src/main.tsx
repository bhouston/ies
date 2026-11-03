import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { parseIES, type IESProfile } from 'ies-core';
import { LightViewer } from 'ies-viewer/react';
import { GraphPanel } from './GraphPanel.js';
import './style.css';

function App() {
  const [profile, setProfile] = useState<IESProfile>();
  const [name, setName] = useState('No file selected');
  const [error, setError] = useState('');
  const [exposure, setExposure] = useState(1);
  const load = async (file?: File) => {
    if (!file) return;
    try {
      const next = parseIES(await file.text());
      setProfile(next);
      setName(file.name);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">PHOTOMETRIC WORKBENCH</p>
          <h1>Light, specified.</h1>
          <p>Inspect an IES distribution on a floor and wall. Files stay in your browser.</p>
        </div>
        <a href="https://github.com/bhouston/ies">GitHub ↗</a>
      </header>
      <section className="toolbar">
        <label className="file">
          Open .ies file
          <input type="file" accept=".ies" onChange={(event) => void load(event.target.files?.[0])} />
        </label>
        <span>{name}</span>
        <label>
          Exposure{' '}
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={exposure}
            onChange={(event) => setExposure(Number(event.target.value))}
          />
        </label>
      </section>
      {error && <p role="alert">{error}</p>}
      <div className="workspace">
        <section className="scene">
          <LightViewer
            profile={profile}
            exposure={exposure}
            style={{ height: '100%', minHeight: 520 }}
            onError={(reason) => setError(reason.message)}
          />
          {!profile && <div className="empty">Open an IES file to reveal its light distribution.</div>}
        </section>
        <aside>
          <GraphPanel profile={profile} />
          {profile && (
            <dl>
              {Object.entries(profile.metadata)
                .filter(([, value]) => value)
                .slice(0, 8)
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
          )}
        </aside>
      </div>
      <footer>
        IES toolkit · <a href="https://bhouston.github.io/ies/">Documentation</a> · Drag to orbit · Scroll to zoom
      </footer>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
