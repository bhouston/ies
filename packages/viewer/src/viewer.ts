import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  illuminanceLegend,
  parsePhotometry,
  peakReceiverIlluminance,
  toPhotometricDocument,
  type IESProfile,
  type PhotometricDocument,
} from '@ies-tools/core';
import { renderIlluminanceLegend } from './legend.js';
import type { PhotometryFormat } from './source.js';
import { DEFAULT_COLOR_TEMPERATURE, documentColorTemperature, temperatureColor } from './lightColor.js';
import {
  createLightScene,
  applyLightSceneSettings,
  disposeLightScene,
  fitDistanceChange,
  applyIlluminanceLegend,
  setLightSceneProfile,
  TONE_MAPPING,
} from './scene.js';
import {
  DEFAULT_VIEWER_SETTINGS,
  resolveViewerSettings,
  settingsEqual,
  type ViewerSettings,
  type ViewerSettingsListener,
} from './settings.js';

export interface LightViewerOptions extends Partial<ViewerSettings> {
  /** Legacy alias for floorDistance. The explicit floorDistance setting takes precedence. */
  height?: number;
}
export interface LightViewerController {
  /** Remove loaded photometry while preserving the camera and viewer settings. */
  clear(): void;
  setProfile(profile: IESProfile): void;
  setDocument(document: PhotometricDocument): void;
  load(text: string, format?: PhotometryFormat, options?: { lampSetIndex?: number }): IESProfile;
  loadDocument(text: string, format?: PhotometryFormat, options?: { lampSetIndex?: number }): PhotometricDocument;
  readonly document: PhotometricDocument | undefined;
  setExposure(exposure: number): void;
  getSettings(): ViewerSettings;
  setSettings(patch: Partial<ViewerSettings>): void;
  addEventListener(type: 'settingschange', listener: ViewerSettingsListener): void;
  removeEventListener(type: 'settingschange', listener: ViewerSettingsListener): void;
  dispose(): void;
  readonly renderer: THREE.WebGLRenderer;
}

/** Physical diffuse receiver: candela * cosine / distance², sampled from the IES distribution. */
export function createLightViewer(container: HTMLElement, options: LightViewerOptions = {}): LightViewerController {
  const { height: legacyHeight, ...initialSettings } = options;
  let settings = resolveViewerSettings({
    ...initialSettings,
    floorDistance: options.floorDistance ?? legacyHeight ?? DEFAULT_VIEWER_SETTINGS.floorDistance,
  });
  const events = new EventTarget();
  const listeners = new Set<ViewerSettingsListener>();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
  camera.position.set(5, 4, 7);
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (cause) {
    throw new Error(
      'Could not initialize the 3D viewer. Enable graphics acceleration and restart your browser or VS Code; a hardware GPU with WebGL2 is required. For inspection and validation, use ies inspect / ies validate. Type C charts can also be exported with ies chart without a GPU.',
      { cause },
    );
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = TONE_MAPPING[settings.toneMapping];
  renderer.domElement.setAttribute('aria-label', 'Photometric light illuminating a ground plane and wall');
  renderer.domElement.setAttribute('role', 'img');
  container.append(renderer.domElement);
  // HTML annotations over the canvas (the measurement legend); never intercepts orbit input.
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  const overlay = container.ownerDocument.createElement('div');
  overlay.className = 'viewer-overlay';
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden';
  const legend = container.ownerDocument.createElement('div');
  legend.className = 'illuminance-legend';
  legend.style.cssText =
    'position:absolute;top:12px;right:12px;padding:8px 10px;border-radius:8px;background:rgb(0 0 0 / 60%);color:#e5e7eb;font:11px/1.3 var(--viewer-font-family, var(--vscode-font-family, system-ui, sans-serif))';
  overlay.append(legend);
  container.append(overlay);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  if (settings.floorDistance !== 2 || settings.wallDistance !== 2)
    fitDistanceChange(camera, controls.target, { ...DEFAULT_VIEWER_SETTINGS }, settings);
  controls.update();
  const objects = createLightScene(settings);
  const { scene, uniforms, material } = objects;
  let disposed = false;
  let document: PhotometricDocument | undefined;
  let peak: number | undefined;
  const updatePeak = () => {
    peak =
      document &&
      peakReceiverIlluminance(
        document.profile,
        settings.floorDistance,
        settings.showWall ? settings.wallDistance : undefined,
      );
  };
  const updateLegend = () => {
    const scale = peak === undefined ? undefined : illuminanceLegend(peak, settings.units);
    applyIlluminanceLegend(objects, scale);
    renderIlluminanceLegend(legend, settings.viewMode === 'measurement' ? scale : undefined);
  };
  updateLegend();
  const render = () => {
    if (!disposed) renderer.render(scene, camera);
  };
  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight || 480);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  controls.addEventListener('change', render);
  resize();
  const setDocument = (next: PhotometricDocument) => {
    if (disposed) throw new Error('Viewer has been disposed');
    const profile = next.profile;
    if (profile.photometricType !== 1)
      throw new Error(
        'The 3D viewer supports Type C photometry only. This file uses Type A or B coordinates; inspect or validate it with ies inspect / ies validate or the VS Code information panel. Use a Type C file for 3D previews and charts.',
      );
    uniforms.lightColor.value.copy(temperatureColor(documentColorTemperature(next)));
    setLightSceneProfile(objects, profile, settings);
    document = next;
    updatePeak();
    updateLegend();
    render();
  };
  return {
    renderer,
    get document() {
      return document;
    },
    clear() {
      if (disposed) throw new Error('Viewer has been disposed');
      uniforms.lightColor.value.copy(temperatureColor(DEFAULT_COLOR_TEMPERATURE));
      setLightSceneProfile(objects, undefined, settings);
      document = undefined;
      updatePeak();
      updateLegend();
      render();
    },
    setProfile(profile) {
      setDocument(toPhotometricDocument(profile));
    },
    setDocument,
    loadDocument(text, format, parseOptions) {
      const next = parsePhotometry(text, format, parseOptions);
      this.setDocument(next);
      return next;
    },
    load(text, format, parseOptions) {
      return this.loadDocument(text, format, parseOptions).profile;
    },
    getSettings() {
      return { ...settings };
    },
    setSettings(patch) {
      if (disposed) throw new Error('Viewer has been disposed');
      const next = resolveViewerSettings(patch, settings);
      if (settingsEqual(settings, next)) return;
      const previousSettings = { ...settings };
      applyLightSceneSettings(objects, next);
      if (next.toneMapping !== settings.toneMapping) {
        renderer.toneMapping = TONE_MAPPING[next.toneMapping];
        material.needsUpdate = true;
        objects.fixture.material.needsUpdate = true;
      }
      if (next.floorDistance !== settings.floorDistance || next.wallDistance !== settings.wallDistance) {
        fitDistanceChange(camera, controls.target, settings, next);
        controls.update();
      }
      settings = next;
      if (
        next.floorDistance !== previousSettings.floorDistance ||
        next.wallDistance !== previousSettings.wallDistance ||
        next.showWall !== previousSettings.showWall
      )
        updatePeak();
      updateLegend();
      render();
      events.dispatchEvent(
        new CustomEvent('settingschange', { detail: { settings: { ...settings }, previousSettings } }),
      );
    },
    addEventListener(type, listener) {
      listeners.add(listener);
      events.addEventListener(type, listener as EventListener);
    },
    removeEventListener(type, listener) {
      listeners.delete(listener);
      events.removeEventListener(type, listener as EventListener);
    },
    setExposure(exposure) {
      this.setSettings({ exposure });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      controls.dispose();
      disposeLightScene(objects);
      for (const listener of listeners) events.removeEventListener('settingschange', listener as EventListener);
      listeners.clear();
      renderer.dispose();
      renderer.domElement.remove();
      overlay.remove();
    },
  };
}
