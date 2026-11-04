import * as THREE from 'three';
import { type IESProfile } from '@ies-tools/core';
import { type ViewerSettings } from './settings.js';

export const TONE_MAPPING = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
} as const;

/** Scene construction is independent of WebGL and can be inspected without a GPU context. */
export function createLightScene(settings: ViewerSettings) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0);
  const initial = new THREE.DataTexture(new Float32Array(2 * 2), 2, 2, THREE.RedFormat, THREE.FloatType);
  initial.needsUpdate = true;
  const uniforms = {
    distribution: { value: initial },
    lightHeight: { value: settings.floorDistance },
    exposure: { value: settings.exposure },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec3 worldPosition; varying vec3 worldNormal;
      void main() { vec4 world=modelMatrix*vec4(position,1.); worldPosition=world.xyz; worldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `uniform sampler2D distribution; uniform float lightHeight; uniform float exposure;
      varying vec3 worldPosition; varying vec3 worldNormal;
      void main() { vec3 delta=worldPosition-vec3(0.,lightHeight,0.); float r=max(length(delta),0.001);
        vec3 d=delta/r; float theta=acos(clamp(-d.y,-1.,1.)); float phi=0.; if(length(d.xz)>0.000001) phi=atan(d.z,d.x); if(phi<0.) phi+=6.28318530718;
        // Pixel centers preserve the exact 0/180 and 0/360 endpoints.
        vec2 uv=(vec2(phi/6.28318530718,theta/3.14159265359)*vec2(360.,180.)+0.5)/vec2(361.,181.);
        float cd=texture2D(distribution,uv).r;
        float lux=cd*max(dot(normalize(worldNormal),-d),0.)/(r*r);
        gl_FragColor=vec4(vec3(lux*exposure/100.),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), material);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), material);
  wall.position.set(0, 2.5, -2);
  scene.add(wall);
  const fixture = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 0.14, 24),
    new THREE.MeshBasicMaterial({ color: 0x666666 }),
  );
  fixture.position.set(0, uniforms.lightHeight.value, 0);
  scene.add(fixture);
  const helper = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x3b82f6, toneMapped: false }),
  );
  scene.add(helper);
  // Set from the loaded profile; undefined until then, which hides the helper.
  const objects = { scene, uniforms, material, floor, wall, fixture, helper, cutoff: undefined as number | undefined };
  applyLightSceneSettings(objects, settings);
  return objects;
}
export type LightScene = ReturnType<typeof createLightScene>;
export function applyLightSceneSettings(objects: LightScene, settings: ViewerSettings): void {
  const extent = Math.max(10, settings.wallDistance * 2.5, settings.floorDistance * 4);
  const wallHeight = Math.max(5, settings.floorDistance * 2.5);
  objects.floor.scale.set(extent / 10, extent / 10, 1);
  objects.wall.scale.set(extent / 10, wallHeight / 5, 1);
  objects.wall.position.set(0, wallHeight / 2, -settings.wallDistance);
  objects.wall.visible = settings.showWall;
  objects.fixture.position.y = settings.floorDistance;
  objects.uniforms.lightHeight.value = settings.floorDistance;
  objects.uniforms.exposure.value = settings.exposure;
  objects.helper.visible = settings.helper && objects.cutoff !== undefined;
  if (objects.helper.visible)
    objects.helper.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(helperLines(objects.cutoff!, settings.floorDistance), 3),
    );
}

/** Largest vertical angle (0° = nadir) whose intensity exceeds 1% of the peak, in degrees. */
export function cutoffAngle(profile: IESProfile): number {
  let peak = 0;
  for (const row of profile.candelaValues) for (const candela of row) peak = Math.max(peak, candela);
  let cutoff = 0;
  for (const row of profile.candelaValues)
    row.forEach((candela, i) => {
      if (candela > peak * 0.01) cutoff = Math.max(cutoff, profile.verticalAngles[i]!);
    });
  return cutoff;
}

const SEGMENTS = 200;
/** Line-segment vertex pairs for the helper of a light at `height` above the ground. A cutoff below 80°
 * draws the downward beam cone; anything wider draws three axis circles at half the mounting height. */
export function helperLines(cutoff: number, height: number): number[] {
  const out: number[] = [];
  const circle = (point: (angle: number) => [number, number, number]) => {
    for (let i = 0; i < SEGMENTS; i++)
      out.push(...point((i / SEGMENTS) * Math.PI * 2), ...point(((i + 1) / SEGMENTS) * Math.PI * 2));
  };
  // ponytail: 80° stands in for "downward cone"; past it the ground circle runs far beyond the floor.
  if (cutoff < 80) {
    const y = height * 0.01;
    const r = height * Math.tan((cutoff * Math.PI) / 180);
    circle((a) => [r * Math.cos(a), y, r * Math.sin(a)]);
    for (const [x, z] of [
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ])
      out.push(x!, y, z!, 0, height, 0);
    return out;
  }
  const r = height / 2;
  circle((a) => [r * Math.cos(a), height, r * Math.sin(a)]);
  circle((a) => [r * Math.cos(a), height + r * Math.sin(a), 0]);
  circle((a) => [0, height + r * Math.cos(a), r * Math.sin(a)]);
  out.push(-r, height, 0, r, height, 0, 0, height - r, 0, 0, height + r, 0, 0, height, -r, 0, height, r);
  return out;
}
const distanceScale = (settings: ViewerSettings) => Math.max(1, settings.floorDistance / 2, settings.wallDistance / 2);
const sceneCenter = (settings: ViewerSettings) =>
  new THREE.Vector3(0, settings.floorDistance / 2, -(settings.wallDistance - 2) / 4);

/** Preserve the orbit direction and relative zoom while keeping larger receiver distances in view. */
export function fitDistanceChange(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  previous: ViewerSettings,
  next: ViewerSettings,
): void {
  const offset = camera.position
    .clone()
    .sub(target)
    .multiplyScalar(distanceScale(next) / distanceScale(previous));
  target.add(sceneCenter(next).sub(sceneCenter(previous)));
  camera.position.copy(target).add(offset);
  camera.far = Math.max(100, distanceScale(next) * 100);
  camera.updateProjectionMatrix();
}
export function disposeLightScene(objects: LightScene): void {
  objects.floor.geometry.dispose();
  objects.wall.geometry.dispose();
  objects.fixture.geometry.dispose();
  objects.fixture.material.dispose();
  objects.helper.geometry.dispose();
  objects.helper.material.dispose();
  objects.uniforms.distribution.value.dispose();
  objects.material.dispose();
}
