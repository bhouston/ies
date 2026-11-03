import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { parseIES, type IESProfile } from 'ies-core';
import { createCandelaTexture } from './texture.js';

export interface LightViewerOptions {
  height?: number;
  exposure?: number;
}
export interface LightViewerController {
  setProfile(profile: IESProfile): void;
  load(text: string): IESProfile;
  setExposure(exposure: number): void;
  dispose(): void;
  readonly renderer: THREE.WebGLRenderer;
}

/** Physical diffuse receiver: candela * cosine / distance², sampled from the IES distribution. */
export function createLightViewer(container: HTMLElement, options: LightViewerOptions = {}): LightViewerController {
  if (options.exposure !== undefined && (!Number.isFinite(options.exposure) || options.exposure < 0))
    throw new Error('Exposure must be a finite nonnegative number');
  if (options.height !== undefined && (!Number.isFinite(options.height) || options.height <= 0))
    throw new Error('Height must be a finite positive number');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
  camera.position.set(5, 4, 7);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.setAttribute('aria-label', 'IES light illuminating a ground plane and wall');
  renderer.domElement.setAttribute('role', 'img');
  container.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.update();
  const initial = new THREE.DataTexture(new Float32Array(2 * 2), 2, 2, THREE.RedFormat, THREE.FloatType);
  initial.needsUpdate = true;
  const uniforms = {
    distribution: { value: initial },
    lightHeight: { value: options.height ?? 2 },
    exposure: { value: options.exposure ?? 1 },
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
  let disposed = false;
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
    setProfile(profile) {
      if (disposed) throw new Error('Viewer has been disposed');
      if (profile.photometricType !== 1) throw new Error('The 3D viewer supports Type C photometry only');
      const texture = createCandelaTexture(profile);
      uniforms.distribution.value.dispose();
      uniforms.distribution.value = texture;
      render();
    },
    load(text) {
      const profile = parseIES(text);
      this.setProfile(profile);
      return profile;
    },
    setExposure(exposure) {
      if (!Number.isFinite(exposure) || exposure < 0) throw new Error('Exposure must be a finite nonnegative number');
      uniforms.exposure.value = exposure;
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      controls.dispose();
      floor.geometry.dispose();
      wall.geometry.dispose();
      fixture.geometry.dispose();
      fixture.material.dispose();
      uniforms.distribution.value.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
