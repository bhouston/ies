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

it('selects, drags the light in the plane perpendicular to the wall without orbiting, and deselects', () => {
  const { canvas, objects, move, orbit, screen, pointer, ring, settings } = setup();
  const light = lightPosition(objects, settings());
  pointer('pointermove', screen(light), { buttons: 0 });
  expect(canvas.style.cursor).toBe('grab');
  pointer('pointerdown', screen(light));
  expect(orbit).toHaveBeenLastCalledWith(false);
  expect(ring.hidden).toBe(false);
  // One plain drag changes height and wall distance together: 1 m up and 0.5 m toward the wall.
  pointer('pointermove', screen(light.clone().add(new THREE.Vector3(0, 1, -0.5))), { buttons: 1 });
  expect(settings()).toMatchObject({ lightOffset: 0, floorDistance: 3, wallDistance: 1.5 });
  // A pointer off to the side, even with Shift held, never moves the light along the wall.
  pointer('pointermove', screen(light.clone().add(new THREE.Vector3(2, 0, 0))), { buttons: 1, shiftKey: true });
  expect(settings().lightOffset).toBe(0);
  pointer('pointerup', screen(light));
  expect(orbit).toHaveBeenLastCalledWith(true);
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

it('keeps a deprecated light offset set elsewhere and drags from a near edge-on camera', () => {
  const { objects, camera, move, screen, pointer, settings } = setup();
  move({ lightOffset: 1.5 });
  // Looking straight at the wall, the perpendicular plane is edge-on; the camera-facing fallback still lifts it.
  camera.position.set(1.6, 2, 8);
  camera.lookAt(1.5, 2, 0);
  camera.updateMatrixWorld();
  const light = lightPosition(objects, settings());
  pointer('pointerdown', screen(light));
  pointer('pointermove', screen(light.clone().add(new THREE.Vector3(0.5, 0.75, 0))), { buttons: 1 });
  pointer('pointerup', screen(light));
  expect(settings()).toMatchObject({ lightOffset: 1.5, floorDistance: 2.75, wallDistance: 2 });
});

it('nudges height with Up/Down and wall distance with Left/Right, and deselects with Escape', () => {
  const { canvas, objects, screen, pointer, ring, settings } = setup();
  const key = (name: string, shiftKey = false) =>
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, cancelable: true }));
  key('ArrowUp');
  expect(settings().floorDistance).toBe(2);
  pointer('pointerdown', screen(lightPosition(objects, settings())));
  pointer('pointerup', screen(lightPosition(objects, settings())));
  key('ArrowUp');
  key('ArrowUp', true);
  key('ArrowRight');
  expect(settings()).toMatchObject({ lightOffset: 0, floorDistance: 2.2, wallDistance: 1.9 });
  key('ArrowDown');
  key('ArrowLeft');
  key('ArrowLeft');
  expect(settings()).toMatchObject({ lightOffset: 0, floorDistance: 2.1, wallDistance: 2.1 });
  key('Escape');
  expect(ring.hidden).toBe(true);
  key('ArrowUp');
  expect(settings().floorDistance).toBe(2.1);
});

it('nudges imperial positions in whole half-feet without millimetre drift', () => {
  const { canvas, objects, screen, pointer, settings, move } = setup();
  move({ units: 'imperial', floorDistance: 0.3048 * 6 });
  pointer('pointerdown', screen(lightPosition(objects, settings())));
  pointer('pointerup', screen(lightPosition(objects, settings())));
  const key = (name: string, count: number) => {
    for (let i = 0; i < count; i++) canvas.dispatchEvent(new KeyboardEvent('keydown', { key: name, cancelable: true }));
  };
  for (const n of [1, 4, 25]) {
    key('ArrowUp', n);
    expect(settings().floorDistance).toBeCloseTo((6 + n * 0.5) * 0.3048, 12);
    key('ArrowDown', n);
    expect(settings().floorDistance).toBeCloseTo(6 * 0.3048, 12);
  }
  // Off-grid starts snap onto the half-foot grid; untouched axes keep their values.
  const height = settings().floorDistance;
  key('ArrowLeft', 1);
  expect(settings().wallDistance / 0.3048).toBeCloseTo(7, 12); // 2 m ≈ 6.56 ft → 6.5 ft + 0.5 ft
  expect(settings().floorDistance).toBe(height);
});

it('clamps dragged positions to the valid ranges and keeps the light in front of the wall', () => {
  expect(lightSettingsAt(new THREE.Vector3(150, -1, -3), -2)).toEqual({ floorDistance: 0.1, wallDistance: 0.1 });
  expect(lightSettingsAt(new THREE.Vector3(0, 2.12345, 1), -2)).toEqual({ floorDistance: 2.123, wallDistance: 3 });
  expect(lightSettingsAt(new THREE.Vector3(0, 200, 200), -2)).toEqual({ floorDistance: 100, wallDistance: 100 });
  // Imperial drags round to the hundredth of a foot the panel shows.
  expect(lightSettingsAt(new THREE.Vector3(0, 0.6, 1), -2, 'imperial').floorDistance).toBeCloseTo(1.97 * 0.3048, 12);
});

it('drags in the plane perpendicular to the wall unless the camera sees it nearly edge-on', () => {
  const light = new THREE.Vector3(0, 2, 0);
  const plane = (x: number, y: number, z: number) => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(x, y, z);
    return dragPlane(light, camera);
  };
  expect(plane(5, 4, 7).normal.toArray()).toEqual([1, 0, 0]);
  // Looking along the wall, the plane faces the camera head-on.
  expect(plane(-6, 2, 0).normal.toArray()).toEqual([1, 0, 0]);
  // Facing the wall or looking down, the edge-on plane gives way to one along the wall facing the camera.
  expect(plane(0.5, 2, 8).normal.toArray()).toEqual([0, 0, 1]);
  expect(plane(1, 10, 1).normal.toArray()).toEqual([0, expect.closeTo(0.99, 2), expect.closeTo(0.12, 2)]);
  expect(plane(0, 6, 0).normal.toArray()).toEqual([0, 1, 0]);
  // A camera at the light keeps the perpendicular plane.
  expect(plane(0, 2, 0).normal.toArray()).toEqual([1, 0, 0]);
});
