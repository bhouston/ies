import * as THREE from 'three';
import { lengthFromUnits, lengthInUnits, type MeasurementUnits } from '@ies-tools/core';
import { lightPosition, type LightScene } from './scene.js';
import type { ViewerSettings } from './settings.js';

const ACCENT = '#22d3ee';
/** Screen radius in pixels within which a pointer grabs a light too small to hit directly. */
const PICK_RADIUS = 16;
/** Pointer travel in pixels that turns a press into an orbit rather than a click. */
const CLICK_SLOP = 4;
type LightKey = 'lightOffset' | 'floorDistance' | 'wallDistance';
const RANGES: Record<LightKey, [number, number]> = {
  lightOffset: [-100, 100],
  floorDistance: [0.1, 100],
  wallDistance: [0.1, 100],
};
/**
 * `meters` snapped to the nearest 1/`perUnit` of the display unit (metres or feet), moved `steps` of those, and
 * clamped to `key`'s range. Snapping in the display unit keeps feet exact: millimetre rounding would drift.
 */
function snapLength(key: LightKey, meters: number, units: MeasurementUnits, perUnit: number, steps = 0) {
  const snapped = lengthFromUnits((Math.round(lengthInUnits(meters, units) * perUnit) + steps) / perUnit, units);
  return Math.min(RANGES[key][1], Math.max(RANGES[key][0], snapped));
}

/**
 * Settings that put the light at `position` with the wall at `wallZ`, clamped to the valid ranges and rounded
 * to millimetres or, in imperial units, hundredths of a foot (the precision the panel inputs show).
 */
export function lightSettingsAt(
  position: THREE.Vector3,
  wallZ: number,
  units: MeasurementUnits = 'metric',
): Pick<ViewerSettings, LightKey> {
  const perUnit = units === 'imperial' ? 100 : 1000;
  return {
    lightOffset: snapLength('lightOffset', position.x, units, perUnit),
    floorDistance: snapLength('floorDistance', position.y, units, perUnit),
    wallDistance: snapLength('wallDistance', position.z - wallZ, units, perUnit),
  };
}

/** Plane the light moves in: horizontal at its height, or vertical through it facing the camera for height changes. */
export function dragPlane(light: THREE.Vector3, camera: THREE.Camera, vertical: boolean): THREE.Plane {
  const normal = vertical ? camera.position.clone().sub(light).setY(0) : new THREE.Vector3(0, 1, 0);
  if (normal.lengthSq() < 1e-12) normal.set(0, 0, 1);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(), light);
}

export interface LightDragOptions {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  camera: THREE.PerspectiveCamera;
  objects: LightScene;
  getSettings: () => ViewerSettings;
  /** Apply a drag-originated change without reframing the camera. */
  move: (patch: Partial<ViewerSettings>) => void;
  /** Enable or disable orbiting while the light is dragged. */
  orbit: (enabled: boolean) => void;
  render: () => void;
}

/**
 * Click the light to select it, drag to move it on its horizontal plane, Shift+drag to change its height,
 * arrow keys to nudge it, and Escape or a click elsewhere to deselect. Returns the per-render marker update.
 * Attach it before OrbitControls so its pointerdown listener runs first.
 */
export function attachLightDrag({
  canvas,
  overlay,
  camera,
  objects,
  getSettings,
  move,
  orbit,
  render,
}: LightDragOptions) {
  const document = canvas.ownerDocument;
  const marker = document.createElement('div');
  marker.className = 'light-selection';
  marker.hidden = true;
  marker.style.cssText = `position:absolute;left:0;top:0;border:2px solid ${ACCENT};border-radius:50%;box-shadow:0 0 0 1px rgb(0 0 0 / 60%), inset 0 0 0 1px rgb(0 0 0 / 60%)`;
  const hint = document.createElement('div');
  hint.className = 'light-selection-hint';
  hint.hidden = true;
  hint.textContent = 'Drag to move · Shift+drag for height · Arrows nudge · Esc to deselect';
  hint.style.cssText =
    'position:absolute;left:12px;top:12px;padding:3px 8px;border-radius:6px;background:rgb(15 23 42 / 80%);color:#f8fafc;font:11px/16px var(--viewer-font-family, var(--vscode-font-family, system-ui, sans-serif))';
  overlay.append(marker, hint);
  canvas.tabIndex = 0;
  canvas.style.outline = 'none';
  let selected = false;
  let drag:
    | { pointerId: number; vertical: boolean; plane: THREE.Plane; start: THREE.Vector3; light: THREE.Vector3 }
    | undefined;
  let press: { x: number; y: number } | undefined;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const point = new THREE.Vector3();

  const ray = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return { rect, ray: raycaster.ray };
  };
  /** Screen centre and radius of the light, in CSS pixels relative to the canvas. */
  const screenCircle = (width: number, height: number) => {
    const center = objects.fixture.position.clone().project(camera);
    objects.fixture.geometry.computeBoundingSphere();
    const distance = camera.position.distanceTo(objects.fixture.position);
    const radius =
      ((objects.fixture.geometry.boundingSphere?.radius ?? 0) / (distance * Math.tan((camera.fov * Math.PI) / 360))) *
      (height / 2);
    return {
      x: ((center.x + 1) / 2) * width,
      y: ((1 - center.y) / 2) * height,
      radius,
      visible: Math.abs(center.z) <= 1,
    };
  };
  const hits = (event: PointerEvent) => {
    const { rect } = ray(event);
    if (raycaster.intersectObject(objects.fixture, false).length) return true;
    const circle = screenCircle(rect.width, rect.height);
    return (
      circle.visible &&
      Math.hypot(event.clientX - rect.left - circle.x, event.clientY - rect.top - circle.y) <=
        Math.max(PICK_RADIUS, circle.radius)
    );
  };
  const select = (value: boolean) => {
    if (selected === value) return;
    selected = value;
    render();
  };
  const begin = (event: PointerEvent) => {
    const light = lightPosition(objects, getSettings());
    const plane = dragPlane(light, camera, event.shiftKey);
    const start = ray(event).ray.intersectPlane(plane, new THREE.Vector3());
    if (start) drag = { pointerId: event.pointerId, vertical: event.shiftKey, plane, start, light };
    return !!start;
  };

  const pointerdown = (event: PointerEvent) => {
    if (drag || !event.isPrimary || event.button !== 0) return;
    if (!hits(event) || !begin(event)) {
      press = { x: event.clientX, y: event.clientY };
      return;
    }
    // Registered before OrbitControls: disabling orbit here makes it ignore this press.
    orbit(false);
    canvas.setPointerCapture?.(event.pointerId);
    canvas.focus({ preventScroll: true });
    canvas.style.cursor = 'grabbing';
    select(true);
  };
  const pointermove = (event: PointerEvent) => {
    if (!drag) {
      if (event.pointerType === 'mouse' && !event.buttons) canvas.style.cursor = hits(event) ? 'grab' : '';
      return;
    }
    if (event.pointerId !== drag.pointerId) return;
    if (event.shiftKey !== drag.vertical) begin(event);
    if (!ray(event).ray.intersectPlane(drag.plane, point)) return;
    const target = drag.light.clone().add(point.sub(drag.start));
    const settings = lightSettingsAt(target, objects.wallZ, getSettings().units);
    move(
      drag.vertical
        ? { floorDistance: settings.floorDistance }
        : { lightOffset: settings.lightOffset, wallDistance: settings.wallDistance },
    );
  };
  const pointerup = (event: PointerEvent) => {
    if (drag && event.pointerId === drag.pointerId) {
      drag = undefined;
      orbit(true);
      canvas.style.cursor = 'grab';
      return;
    }
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) < CLICK_SLOP) select(false);
    press = undefined;
  };
  const keydown = (event: KeyboardEvent) => {
    if (!selected) return;
    if (event.key === 'Escape') {
      select(false);
      return;
    }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction) return;
    event.preventDefault();
    const settings = getSettings();
    // Whole steps of 0.5 ft or 0.1 m on that unit's grid, so repeated nudges never accumulate rounding.
    const nudge = (key: LightKey, steps: number) =>
      snapLength(key, settings[key], settings.units, settings.units === 'imperial' ? 2 : 10, steps);
    const [x, z] = direction;
    // Arrows move across the floor (up is toward the wall); with Shift, up and down change the height.
    move(
      event.shiftKey
        ? { floorDistance: nudge('floorDistance', -z!) }
        : x
          ? { lightOffset: nudge('lightOffset', x) }
          : { wallDistance: nudge('wallDistance', z!) },
    );
  };
  canvas.addEventListener('pointerdown', pointerdown);
  canvas.addEventListener('pointermove', pointermove);
  canvas.addEventListener('pointerup', pointerup);
  canvas.addEventListener('pointercancel', pointerup);
  canvas.addEventListener('keydown', keydown);
  return {
    /** Position the selection ring over the light; call after each render. */
    place(width: number, height: number) {
      const circle = screenCircle(width, height);
      marker.hidden = hint.hidden = !selected || !circle.visible;
      if (marker.hidden) return;
      const size = 2 * Math.max(12, circle.radius + 6);
      marker.style.width = marker.style.height = `${size}px`;
      marker.style.transform = `translate(${circle.x - size / 2}px, ${circle.y - size / 2}px)`;
    },
    dispose() {
      canvas.removeEventListener('pointerdown', pointerdown);
      canvas.removeEventListener('pointermove', pointermove);
      canvas.removeEventListener('pointerup', pointerup);
      canvas.removeEventListener('pointercancel', pointerup);
      canvas.removeEventListener('keydown', keydown);
    },
  };
}
