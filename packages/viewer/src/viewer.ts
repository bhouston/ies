import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  illuminanceLegend,
  parsePhotometry,
  autoExposureValue,
  peakReceiverIlluminance,
  peakReceiverLuminance,
  toPhotometricDocument,
  type IESProfile,
  type PhotometricDocument,
} from '@ies-tools/core';
import { renderIlluminanceLegend } from './legend.js';
import { attachLightDrag } from './lightDrag.js';
import type { PhotometryFormat } from './source.js';
import { DEFAULT_COLOR_TEMPERATURE, documentColorTemperature, temperatureColor } from './lightColor.js';
import {
  createLightScene,
  applyLightSceneSettings,
  disposeLightScene,
  fitDistanceChange,
  applyIlluminanceLegend,
  FLOOR_REFLECTANCE,
  WALL_REFLECTANCE,
  rulerSegments,
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
export interface LightViewerCaptureOptions {
  /** Image MIME type: `image/png` (default), `image/jpeg` or `image/webp`. */
  type?: string;
  /** JPEG/WebP quality from 0 to 1; the browser's default when omitted. */
  quality?: number;
  /** Output width in pixels; defaults to the canvas's current drawing-buffer width. */
  width?: number;
  /** Output height in pixels; defaults to the canvas's current drawing-buffer height. */
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
  /** Set a manual EV100 exposure, turning auto exposure off. */
  setExposure(exposure: number): void;
  getSettings(): ViewerSettings;
  setSettings(patch: Partial<ViewerSettings>): void;
  addEventListener(type: 'settingschange', listener: ViewerSettingsListener): void;
  removeEventListener(type: 'settingschange', listener: ViewerSettingsListener): void;
  /**
   * Render the current scene and settings and encode it. The image holds only the opaque 3D scene: no legend,
   * ruler labels, controls or charts. Rejects if the viewer is disposed, the WebGL context is lost, the options
   * are invalid or encoding fails. `blob.type` is the format the browser actually produced (PNG if unsupported).
   */
  capture(options?: LightViewerCaptureOptions): Promise<Blob>;
  dispose(): void;
  readonly renderer: THREE.WebGLRenderer;
}

/** OrbitControls turns 2π · rotateSpeed per canvas height dragged: about 200° across a 16:10 canvas's width. */
const ORBIT_ROTATE_SPEED = 0.35;

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
  const rulerLayer = container.ownerDocument.createElement('div');
  rulerLayer.className = 'ruler-labels';
  overlay.append(rulerLayer, legend);
  container.append(overlay);
  // Created before the controls so selecting the light can stop an orbit from starting.
  const objects = createLightScene(settings);
  const lightDrag = attachLightDrag({
    canvas: renderer.domElement,
    overlay,
    camera,
    objects,
    getSettings: () => ({ ...settings }),
    move: (patch) => update(patch, false),
    orbit: (enabled) => (controls.enabled = enabled),
    render: () => render(),
  });
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.rotateSpeed = ORBIT_ROTATE_SPEED;
  controls.target.set(0, 1, 0);
  if (settings.floorDistance !== 2 || settings.wallDistance !== 2)
    fitDistanceChange(camera, controls.target, { ...DEFAULT_VIEWER_SETTINGS }, settings);
  controls.update();
  const { scene, uniforms, material } = objects;
  let disposed = false;
  let document: PhotometricDocument | undefined;
  let peak: number | undefined;
  let peakLuminance: number | undefined;
  const updatePeak = (next: ViewerSettings) => {
    const wall = next.showWall ? next.wallDistance : undefined;
    peak = document && peakReceiverIlluminance(document.profile, next.floorDistance, wall);
    peakLuminance =
      document &&
      peakReceiverLuminance(document.profile, next.floorDistance, wall, FLOOR_REFLECTANCE, WALL_REFLECTANCE);
  };
  // Auto exposure is a camera meter: it sets EV100 from the brightest receiver, never relative values.
  const metered = (next: ViewerSettings): ViewerSettings =>
    next.autoExposure && peakLuminance ? { ...next, exposure: autoExposureValue(peakLuminance) } : next;
  const updateLegend = () => {
    const scale = peak === undefined ? undefined : illuminanceLegend(peak, settings.units);
    applyIlluminanceLegend(objects, scale);
    renderIlluminanceLegend(legend, settings.viewMode === 'measurement' ? scale : undefined);
  };
  updateLegend();
  let rulerLabels: typeof objects.rulerLabels = [];
  const projected = new THREE.Vector3();
  // ponytail: label widths are estimated from text length rather than measured, avoiding a layout per render.
  const placeRulerLabels = () => {
    if (rulerLabels !== objects.rulerLabels) {
      rulerLabels = objects.rulerLabels;
      rulerLayer.replaceChildren(
        ...rulerLabels.map((label) => {
          const node = container.ownerDocument.createElement('div');
          node.textContent = label.text;
          node.style.cssText = `position:absolute;left:0;top:0;padding:1px 5px;border-radius:4px;background:rgb(15 23 42 / 72%);color:#f8fafc;white-space:nowrap;font:${label.height ? 600 : 400} 11px/16px var(--viewer-font-family, var(--vscode-font-family, system-ui, sans-serif))`;
          return node;
        }),
      );
    }
    const width = container.clientWidth;
    const height = container.clientHeight;
    const placed: [number, number, number, number][] = [];
    rulerLabels.forEach((label, i) => {
      const node = rulerLayer.children[i] as HTMLElement;
      projected
        .set(...label.position)
        .add(objects.rulers.position)
        .project(camera);
      const x = ((projected.x + 1) / 2) * width;
      const y = ((1 - projected.y) / 2) * height;
      const box: [number, number, number, number] = [
        x - label.text.length * 3.3 - 8,
        y - 10,
        x + label.text.length * 3.3 + 8,
        y + 10,
      ];
      node.hidden =
        Math.abs(projected.z) > 1 ||
        box[2] < 0 ||
        box[0] > width ||
        box[3] < 0 ||
        box[1] > height ||
        placed.some((other) => box[0] < other[2] && other[0] < box[2] && box[1] < other[3] && other[1] < box[3]);
      if (node.hidden) return;
      placed.push(box);
      node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    });
  };
  const render = () => {
    if (disposed) return;
    renderer.render(scene, camera);
    placeRulerLabels();
    lightDrag.place(container.clientWidth, container.clientHeight);
  };
  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight || 480);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    for (const line of rulerSegments(objects)) line.material.resolution.set(width, height);
    objects.glare.material.uniforms.resolution!.value.set(width, height);
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
    updatePeak(settings);
    updateLegend();
    update({}, false);
    render();
  };
  /** Apply settings; `fit` reframes the camera for new distances, which drags skip. */
  const update = (patch: Partial<ViewerSettings>, fit: boolean) => {
    let next = resolveViewerSettings(patch, settings);
    if (
      next.floorDistance !== settings.floorDistance ||
      next.wallDistance !== settings.wallDistance ||
      next.showWall !== settings.showWall
    )
      updatePeak(next);
    next = metered(next);
    if (settingsEqual(settings, next)) return;
    const previousSettings = { ...settings };
    // Typed wall distances keep the light in place and move the wall; drags keep the wall in place.
    if (fit) objects.wallZ += settings.wallDistance - next.wallDistance;
    applyLightSceneSettings(objects, next);
    if (next.toneMapping !== settings.toneMapping) {
      renderer.toneMapping = TONE_MAPPING[next.toneMapping];
      material.needsUpdate = true;
      objects.fixture.material.needsUpdate = true;
    }
    if (fit && (next.floorDistance !== settings.floorDistance || next.wallDistance !== settings.wallDistance)) {
      fitDistanceChange(camera, controls.target, settings, next);
      controls.update();
    }
    settings = next;
    updateLegend();
    render();
    events.dispatchEvent(
      new CustomEvent('settingschange', { detail: { settings: { ...settings }, previousSettings } }),
    );
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
      updatePeak(settings);
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
      update(patch, true);
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
      this.setSettings({ autoExposure: false, exposure });
    },
    capture({ type = 'image/png', quality, width, height } = {}) {
      if (disposed) return Promise.reject(new Error('Viewer has been disposed'));
      if (renderer.getContext().isContextLost()) return Promise.reject(new Error('The WebGL context was lost'));
      const max = renderer.capabilities.maxTextureSize;
      const sized = width !== undefined || height !== undefined;
      const canvas = renderer.domElement;
      const w = width ?? canvas.width;
      const h = height ?? canvas.height;
      if (![w, h].every((value) => Number.isInteger(value) && value >= 1 && value <= max))
        return Promise.reject(new RangeError(`Capture width and height must be integers from 1 to ${max}`));
      if (quality !== undefined && !(quality >= 0 && quality <= 1))
        return Promise.reject(new RangeError('Capture quality must be from 0 to 1'));
      const pixelRatio = renderer.getPixelRatio();
      if (sized) {
        renderer.setPixelRatio(1);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        for (const line of rulerSegments(objects)) line.material.resolution.set(w, h);
        objects.glare.material.uniforms.resolution!.value.set(w, h);
      }
      // The browser may silently allocate a smaller drawing buffer than requested when memory is short.
      const gl = renderer.getContext();
      if (sized && (gl.drawingBufferWidth !== w || gl.drawingBufferHeight !== h)) {
        renderer.setPixelRatio(pixelRatio);
        resize();
        return Promise.reject(new RangeError(`The GPU could not allocate a ${w}×${h} capture`));
      }
      // toBlob snapshots the drawing buffer synchronously, so it must run in the same task as the render.
      renderer.render(scene, camera);
      const blob = new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('The browser could not encode the capture'))),
          type,
          quality,
        ),
      );
      if (sized) {
        renderer.setPixelRatio(pixelRatio);
        resize();
      }
      return blob;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      controls.dispose();
      lightDrag.dispose();
      disposeLightScene(objects);
      for (const listener of listeners) events.removeEventListener('settingschange', listener as EventListener);
      listeners.clear();
      renderer.dispose();
      renderer.domElement.remove();
      overlay.remove();
    },
  };
}
