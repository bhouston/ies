import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  detectPhotometricFormat,
  parseLDT,
  parsePhotometry,
  type IESProfile,
  type PhotometricDocument,
} from 'ies-core';
import { LightViewer, IntensityGraph } from 'ies-viewer/react';
import './style.css';

function App() {
  const [profile, setProfile] = useState<IESProfile>();
  const [photometry, setPhotometry] = useState<PhotometricDocument>();
  const [sourceText, setSourceText] = useState('');
  const [sourceFormat, setSourceFormat] = useState<'ies' | 'ldt'>('ies');
  const [lampSets, setLampSets] = useState<string[]>([]);
  const [selectedLampSet, setSelectedLampSet] = useState<number>();
  const loadRevision = useRef(0);
  const [name, setName] = useState('No file selected');
  const [error, setError] = useState('');
  const [axis, setAxis] = useState<'vertical' | 'horizontal'>('vertical');
  const [angle, setAngle] = useState(0);
  const [exposure, setExposure] = useState(1);
  const [projection, setProjection] = useState<'polar' | 'cartesian' | 'topology'>('polar');
  const [upAxis, setUpAxis] = useState<'x' | 'y' | 'z'>('y');
  const load = async (file?: File) => {
    if (!file) return;
    const revision = ++loadRevision.current;
    try {
      const text = await file.text();
      if (revision !== loadRevision.current) return;
      const format = detectPhotometricFormat(text);
      const sets = format === 'ldt' ? parseLDT(text).lampSets : [];
      setSourceText(text);
      setSourceFormat(format);
      setLampSets(
        sets.map(
          (set, index) =>
            `${index + 1}: ${set.description || 'Lamp configuration'} · ${set.totalLumens} lm · ${set.watts} W`,
        ),
      );
      setSelectedLampSet(undefined);
      const next = sets.length > 1 ? undefined : parsePhotometry(text, format);
      if (next && next.profile.photometricType !== 1)
        throw new Error('The viewer and intensity graphs support Type C photometry only');
      setPhotometry(next);
      setProfile(next?.profile);
      setName(file.name);
      setError('');
    } catch (reason) {
      if (revision !== loadRevision.current) return;
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const selectLampSet = (value: string) => {
    const index = value === '' ? undefined : Number(value);
    setSelectedLampSet(index);
    try {
      const next = index === undefined ? undefined : parsePhotometry(sourceText, sourceFormat, { lampSetIndex: index });
      setPhotometry(next);
      setProfile(next?.profile);
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
          <p>Inspect an IES or EULUMDAT distribution on a floor and wall. Files stay in your browser.</p>
        </div>
        <a href="https://github.com/bhouston/ies">GitHub ↗</a>
      </header>
      <section className="toolbar">
        <label className="file">
          Open .ies or .ldt file
          <input type="file" accept=".ies,.ldt" onChange={(event) => void load(event.target.files?.[0])} />
        </label>
        <span>{name}</span>
        {lampSets.length > 1 && (
          <label>
            Alternative lamp configuration
            <select value={selectedLampSet ?? ''} onChange={(event) => selectLampSet(event.target.value)}>
              <option value="">Choose a configuration</option>
              {lampSets.map((label, index) => (
                <option key={index} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
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
            document={photometry}
            exposure={exposure}
            style={{ height: '100%', minHeight: 520 }}
            onError={(reason) => setError(reason.message)}
          />
          {!profile && (
            <div className="empty">
              {lampSets.length > 1
                ? 'Choose a lamp configuration to view this luminaire.'
                : 'Open an IES or LDT file to reveal its light distribution.'}
            </div>
          )}
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
