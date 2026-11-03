import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { parsePhotometry, toPhotometricDocument, type IESProfile, type PhotometricDocument } from 'ies-core';
import type { PhotometryFormat } from './source.js';
import { createCandelaTexture } from './texture.js';
import {
  createLightScene,
  applyLightSceneSettings,
  disposeLightScene,
  fitDistanceChange,
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
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = TONE_MAPPING[settings.toneMapping];
  renderer.domElement.setAttribute('aria-label', 'Photometric light illuminating a ground plane and wall');
  renderer.domElement.setAttribute('role', 'img');
  container.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  if (settings.floorDistance !== 2 || settings.wallDistance !== 2)
    fitDistanceChange(camera, controls.target, { ...DEFAULT_VIEWER_SETTINGS }, settings);
  controls.update();
  const objects = createLightScene(settings);
  const { scene, uniforms, material } = objects;
  let disposed = false;
  let document: PhotometricDocument | undefined;
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
  return {
    renderer,
    get document() {
      return document;
    },
    setProfile(profile) {
      if (disposed) throw new Error('Viewer has been disposed');
      if (profile.photometricType !== 1) throw new Error('The 3D viewer supports Type C photometry only');
      const texture = createCandelaTexture(profile);
      uniforms.distribution.value.dispose();
      uniforms.distribution.value = texture;
      document = toPhotometricDocument(profile);
      render();
    },
    setDocument(next) {
      this.setProfile(next.profile);
      document = next;
    },
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
      }
      if (next.floorDistance !== settings.floorDistance || next.wallDistance !== settings.wallDistance) {
        fitDistanceChange(camera, controls.target, settings, next);
        controls.update();
      }
      settings = next;
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
    },
  };
}
