// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { attachLightDrag, dragPlane, lightSettingsAt } from './lightDrag.js';
import { applyLightSceneSettings, createLightScene, lightPosition } from './scene.js';
import { DEFAULT_VIEWER_SETTINGS, resolveViewerSettings, type ViewerSettings } from './settings.js';

// jsdom has no PointerEvent.
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  isPrimary: boolean;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}
const WIDTH = 800;
const HEIGHT = 600;

function setup() {
  let settings: ViewerSettings = { ...DEFAULT_VIEWER_SETTINGS };
  const objects = createLightScene(settings);
  const camera = new THREE.PerspectiveCamera(45, WIDTH / HEIGHT, 0.05, 100);
  camera.position.set(5, 4, 7);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: WIDTH, height: HEIGHT }) as DOMRect;
  const overlay = document.createElement('div');
  const orbit = vi.fn();
  const move = vi.fn((patch: Partial<ViewerSettings>) => {
    settings = resolveViewerSettings(patch, settings);
    applyLightSceneSettings(objects, settings);
  });
  const drag = attachLightDrag({
    canvas,
    overlay,
    camera,
    objects,
    getSettings: () => settings,
    move,
    orbit,
    render: () => drag.place(WIDTH, HEIGHT),
  });
  const screen = (point: THREE.Vector3) => {
    const p = point.clone().project(camera);
    return { clientX: ((p.x + 1) / 2) * WIDTH, clientY: ((1 - p.y) / 2) * HEIGHT };
  };
  const pointer = (type: string, at: { clientX: number; clientY: number }, init: PointerEventInit = {}) =>
    canvas.dispatchEvent(
      new TestPointerEvent(type, { ...at, isPrimary: true, button: 0, pointerId: 1, pointerType: 'mouse', ...init }),
    );
  const ring = overlay.querySelector<HTMLElement>('.light-selection')!;
  return { canvas, objects, camera, move, orbit, screen, pointer, ring, settings: () => settings };
}

it('selects, drags the light on its horizontal plane without orbiting, and deselects', () => {
  const { canvas, objects, move, orbit, screen, pointer, ring, settings } = setup();
  const light = lightPosition(objects, settings());
  pointer('pointermove', screen(light), { buttons: 0 });
  expect(canvas.style.cursor).toBe('grab');
  pointer('pointerdown', screen(light));
  expect(orbit).toHaveBeenLastCalledWith(false);
  expect(ring.hidden).toBe(false);
  // Drag to the screen position of a point 1 m along X and 0.5 m toward the wall at the light's height.
  pointer('pointermove', screen(light.clone().add(new THREE.Vector3(1, 0, -0.5))), { buttons: 1 });
  expect(settings().lightOffset).toBeCloseTo(1, 2);
  expect(settings().wallDistance).toBeCloseTo(1.5, 2);
  expect(settings().floorDistance).toBe(2);
  pointer('pointerup', screen(light));
  expect(orbit).toHaveBeenLastCalledWith(true);
  // Shift+drag changes only the height.
  const moved = lightPosition(objects, settings());
  pointer('pointerdown', screen(moved), { shiftKey: true });
  pointer('pointermove', screen(moved.clone().setY(3)), { shiftKey: true, buttons: 1 });
  pointer('pointerup', screen(moved));
  expect(settings().floorDistance).toBeCloseTo(3, 2);
  expect(settings().lightOffset).toBeCloseTo(1, 2);
  // A click on empty space deselects; an orbit (press, move, release) does not.
  const empty = { clientX: 20, clientY: 580 };
  pointer('pointerdown', empty);
  pointer('pointerup', { clientX: 120, clientY: 580 });
  expect(ring.hidden).toBe(false);
  pointer('pointerdown', empty);
  pointer('pointerup', empty);
  canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(move).toHaveBeenCalled();
  expect(ring.hidden).toBe(true);
});

it('nudges the selected light with arrow keys and deselects with Escape', () => {
  const { canvas, objects, screen, pointer, ring, settings } = setup();
  const key = (name: string, shiftKey = false) =>
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, cancelable: true }));
  key('ArrowRight');
  expect(settings().lightOffset).toBe(0);
  pointer('pointerdown', screen(lightPosition(objects, settings())));
  pointer('pointerup', screen(lightPosition(objects, settings())));
  key('ArrowRight');
  key('ArrowUp');
  key('ArrowUp', true);
  expect(settings()).toMatchObject({ lightOffset: 0.1, wallDistance: 1.9, floorDistance: 2.1 });
  key('Escape');
  expect(ring.hidden).toBe(true);
  key('ArrowRight');
  expect(settings().lightOffset).toBe(0.1);
});

it('clamps dragged positions to the valid ranges and keeps the light in front of the wall', () => {
  expect(lightSettingsAt(new THREE.Vector3(150, -1, -3), -2)).toEqual({
    lightOffset: 100,
    floorDistance: 0.1,
    wallDistance: 0.1,
  });
  expect(lightSettingsAt(new THREE.Vector3(0.12345, 2, 1), -2)).toEqual({
    lightOffset: 0.123,
    floorDistance: 2,
    wallDistance: 3,
  });
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 5, 0);
  // Looking straight down, a height drag falls back to a plane facing +Z.
  expect(dragPlane(new THREE.Vector3(0, 2, 0), camera, true).normal.toArray()).toEqual([0, 0, 1]);
});
