import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { parseIES, type IESProfile } from 'ies-core';
import { LightViewer, IntensityGraph } from 'ies-viewer/react';
import './style.css';

function App() {
  const [profile, setProfile] = useState<IESProfile>();
  const [name, setName] = useState('No file selected');
  const [error, setError] = useState('');
  const [axis, setAxis] = useState<'vertical' | 'horizontal'>('vertical');
  const [angle, setAngle] = useState(0);
  const [exposure, setExposure] = useState(1);
  const [projection, setProjection] = useState<'polar' | 'cartesian' | 'topology'>('polar');
  const [upAxis, setUpAxis] = useState<'x' | 'y' | 'z'>('y');
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
          <h2>Intensity distribution</h2>
          <p className="muted">Candela · Type C photometry</p>
          <div className="controls">
            <label>
              View
              <select value={projection} onChange={(event) => setProjection(event.target.value as typeof projection)}>
                <option value="polar">Polar slice</option>
                <option value="cartesian">Cartesian slice</option>
                <option value="topology">3D topology</option>
              </select>
            </label>
            <label>
              Sweep
              <select
                value={axis}
                onChange={(event) => {
                  setAxis(event.target.value as typeof axis);
                  setAngle(0);
                }}
              >
                <option value="vertical">Vertical</option>
                <option value="horizontal">Horizontal</option>
              </select>
            </label>
            <label>
              Fixed plane: {angle}°
              <input
                type="range"
                min="0"
                max={axis === 'vertical' ? 360 : 180}
                step="1"
                value={angle}
                onChange={(event) => setAngle(Number(event.target.value))}
              />
            </label>
            {projection === 'topology' && (
              <label>
                Up axis
                <select value={upAxis} onChange={(event) => setUpAxis(event.target.value as typeof upAxis)}>
                  <option value="x">X</option>
                  <option value="y">Y</option>
                  <option value="z">Z</option>
                </select>
              </label>
            )}
          </div>
          {profile ? (
            <>
              <IntensityGraph profile={profile} axis={axis} angle={angle} projection={projection} upAxis={upAxis} />
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
            </>
          ) : (
            <p className="muted">The polar plot and topology appear here.</p>
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
