import { useState } from 'react';
import { type IESProfile } from '@ies-tools/core';
import { IntensityGraph, IsoluxGraph } from '@ies-tools/viewer/react';

export function GraphPanel({ profile }: { profile?: IESProfile }) {
  const [projection, setProjection] = useState<'polar' | 'cartesian' | 'topology' | 'isolux'>('polar');
  const [axis, setAxis] = useState<'vertical' | 'horizontal'>('vertical');
  const [angle, setAngle] = useState(0);
  const [curves, setCurves] = useState<'single' | 'principal' | 'overlay'>('principal');
  const [upAxis, setUpAxis] = useState<'x' | 'y' | 'z'>('y');
  const [surface, setSurface] = useState<'filled' | 'wireframe' | 'both'>('both');
  const [camera, setCamera] = useState<'orthographic' | 'perspective'>('orthographic');
  const [viewAzimuth, setViewAzimuth] = useState(45);
  const [viewElevation, setViewElevation] = useState(30);
  const [mountingHeight, setMountingHeight] = useState(2);
  const [extent, setExtent] = useState(10);
  const [aimAngle, setAimAngle] = useState(0);
  const [azimuth, setAzimuth] = useState(0);
  const [contours, setContours] = useState(true);
  return (
    <>
      <h2>{projection === 'isolux' ? 'Ground illuminance' : 'Intensity distribution'}</h2>
      <p className="muted">
        {projection === 'isolux' ? 'Lux · metres · physical direct light' : 'Candela · complete Type C photometry'}
      </p>
      <div className="controls">
        <label>
          View
          <select value={projection} onChange={(event) => setProjection(event.target.value as typeof projection)}>
            <option value="polar">Polar cuts</option>
            <option value="cartesian">Cartesian</option>
            <option value="topology">Intensity topology</option>
            <option value="isolux">Isolux footprint</option>
          </select>
        </label>
        {(projection === 'polar' || projection === 'cartesian') && (
          <>
            <label>
              Sweep
              <select
                value={axis}
                onChange={(event) => {
                  setAxis(event.target.value as typeof axis);
                  setAngle(0);
                  setCurves('single');
                }}
              >
                <option value="vertical">Vertical γ</option>
                <option value="horizontal">Horizontal C</option>
              </select>
            </label>
            <label>
              Curves
              <select value={curves} onChange={(event) => setCurves(event.target.value as typeof curves)}>
                <option value="single">Selected plane</option>
                {axis === 'vertical' && <option value="principal">Principal planes</option>}
                <option value="overlay">0° / 45° / 90° overlay</option>
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
                disabled={curves !== 'single'}
                onChange={(event) => setAngle(Number(event.target.value))}
              />
            </label>
          </>
        )}
        {projection === 'topology' && (
          <>
            <label>
              Up axis
              <select value={upAxis} onChange={(event) => setUpAxis(event.target.value as typeof upAxis)}>
                <option value="x">X</option>
                <option value="y">Y</option>
                <option value="z">Z</option>
              </select>
            </label>
            <label>
              Surface
              <select value={surface} onChange={(event) => setSurface(event.target.value as typeof surface)}>
                <option value="both">Filled + wireframe</option>
                <option value="filled">Filled</option>
                <option value="wireframe">Wireframe</option>
              </select>
            </label>
            <label>
              Projection
              <select value={camera} onChange={(event) => setCamera(event.target.value as typeof camera)}>
                <option value="orthographic">Orthographic</option>
                <option value="perspective">Perspective</option>
              </select>
            </label>
            <label>
              View azimuth: {viewAzimuth}°
              <input
                type="range"
                min="-180"
                max="180"
                value={viewAzimuth}
                onChange={(event) => setViewAzimuth(Number(event.target.value))}
              />
            </label>
            <label>
              View elevation: {viewElevation}°
              <input
                type="range"
                min="-80"
                max="80"
                value={viewElevation}
                onChange={(event) => setViewElevation(Number(event.target.value))}
              />
            </label>
          </>
        )}
        {projection === 'isolux' && (
          <>
            <label>
              Mounting height: {mountingHeight} m
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={mountingHeight}
                onChange={(event) => setMountingHeight(Number(event.target.value))}
              />
            </label>
            <label>
              Ground span: {extent} m
              <input
                type="range"
                min="2"
                max="20"
                step="1"
                value={extent}
                onChange={(event) => setExtent(Number(event.target.value))}
              />
            </label>
            <label>
              Fixture aim: {aimAngle}°
              <input
                type="range"
                min="0"
                max="85"
                value={aimAngle}
                onChange={(event) => setAimAngle(Number(event.target.value))}
              />
            </label>
            <label>
              Fixture azimuth: {azimuth}°
              <input
                type="range"
                min="0"
                max="360"
                step="5"
                value={azimuth}
                onChange={(event) => setAzimuth(Number(event.target.value))}
              />
            </label>
            <label className="check">
              <input type="checkbox" checked={contours} onChange={(event) => setContours(event.target.checked)} /> Show
              contours
            </label>
          </>
        )}
      </div>
      {!profile ? (
        <p className="muted">Open a photometric file to inspect its graphs.</p>
      ) : profile.photometricType !== 1 ? (
        <p role="alert">Graphs support Type C photometry. Type A/B coordinate conversion is not available.</p>
      ) : projection === 'isolux' ? (
        <IsoluxGraph
          profile={profile}
          mountingHeight={mountingHeight}
          extent={extent}
          aimAngle={aimAngle}
          azimuth={azimuth}
          contours={contours ? undefined : []}
        />
      ) : (
        <IntensityGraph
          profile={profile}
          axis={axis}
          angle={angle}
          projection={projection}
          principalPlanes={curves === 'principal'}
          planes={curves === 'overlay' ? [0, 45, 90] : undefined}
          upAxis={upAxis}
          topologyProjection={camera}
          viewAzimuth={viewAzimuth}
          viewElevation={viewElevation}
          surface={surface}
        />
      )}
      {projection === 'isolux' && (
        <p className="muted">
          These controls aim the ground-footprint calculation. The 3D preview above keeps its downward-facing fixture.
          Lamp TILT correction is separate.
        </p>
      )}
    </>
  );
}
