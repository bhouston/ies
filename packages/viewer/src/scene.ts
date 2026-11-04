import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import {
  buildIntensityTopology,
  formatLength,
  luminousShape,
  rulerTicks,
  saturationLuminance,
  type IESProfile,
  type IlluminanceLegend,
  type LuminousShape,
} from '@ies-tools/core';
import { type ViewerSettings } from './settings.js';
import { DEFAULT_COLOR_TEMPERATURE, temperatureColor } from './lightColor.js';
import { createCandelaTexture, createLuminanceTexture } from './texture.js';

export const TONE_MAPPING = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
} as const;

/** Diffuse reflectances of the realistic floor and wall. */
export const FLOOR_REFLECTANCE = 0.3;
export const WALL_REFLECTANCE = 0.6;
/** Isolux contour lines drawn by the measurement shader. */
export const MAX_CONTOUR_LEVELS = 10;

/** Scene construction is independent of WebGL and can be inspected without a GPU context. */
export function createLightScene(settings: ViewerSettings) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0);
  const uniforms = {
    distribution: { value: blankTexture() },
    lightColor: { value: temperatureColor(DEFAULT_COLOR_TEMPERATURE) },
    lightPosition: { value: new THREE.Vector3(0, settings.floorDistance, 0) },
    /** 1 / saturation luminance of the EV100 exposure: displayed value per cd/m². */
    exposure: { value: 1 / saturationLuminance(settings.exposure) },
    // Measurement mode: log ramp from rampPeak / 10^rampDecades to rampPeak lux, with isolux lines.
    rampPeak: { value: 1 },
    rampDecades: { value: 3 },
    logLevels: { value: Array.from({ length: MAX_CONTOUR_LEVELS }, () => 0) },
    levelCount: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec3 worldPosition; varying vec3 worldNormal;
      void main() { vec4 world=modelMatrix*vec4(position,1.); worldPosition=world.xyz; worldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `uniform sampler2D distribution; uniform vec3 lightColor; uniform vec3 lightPosition; uniform float exposure;
      uniform float rampPeak; uniform float rampDecades; uniform float logLevels[${MAX_CONTOUR_LEVELS}]; uniform int levelCount;
      varying vec3 worldPosition; varying vec3 worldNormal;
      // The isolux chart ramp hsl(235 - 195t, 80%, 15 + 50t%), in sRGB.
      vec3 ramp(float t) { float h=235.-195.*t, l=.15+.5*t, a=.8*min(l,1.-l); vec3 k=mod(vec3(0.,8.,4.)+h/30.,12.);
        return l-a*clamp(min(k-3.,9.-k),-1.,1.); }
      void main() { vec3 delta=worldPosition-lightPosition; float r=max(length(delta),0.001);
        vec3 d=delta/r; float theta=acos(clamp(-d.y,-1.,1.)); float phi=0.; if(length(d.xz)>0.000001) phi=atan(d.z,d.x); if(phi<0.) phi+=6.28318530718;
        // Pixel centers preserve the exact 0/180 and 0/360 endpoints.
        vec2 uv=(vec2(phi/6.28318530718,theta/3.14159265359)*vec2(360.,180.)+0.5)/vec2(361.,181.);
        float cd=texture2D(distribution,uv).r;
        vec3 n=normalize(worldNormal);
        float lux=cd*max(dot(n,-d),0.)/(r*r);
        #ifdef MEASUREMENT
          float logLux=log(max(lux,1e-30)), width=max(fwidth(logLux),1e-6), line=0.;
          for(int i=0;i<${MAX_CONTOUR_LEVELS};i++) if(i<levelCount) line=max(line,1.-smoothstep(.25,1.25,abs(logLux-logLevels[i])/width));
          // Fade lines out where neighbouring 1-2-5 levels (ln 2 apart) come within about two pixels: they cannot be
          // resolved there, and near a cutoff log illuminance jumps decades within a pixel, which is an edge, not a contour.
          line*=1.-smoothstep(.15,.35,width);
          vec3 color=ramp(clamp((logLux-log(rampPeak))/(rampDecades*2.30258509)+1.,0.,1.));
          // False colours are already sRGB: no tone mapping or colour-space conversion.
          gl_FragColor=vec4(mix(color,vec3(1.),line*.8),1.);
        #else
          // Diffuse luminance L = reflectance * E / pi, displayed as L / L_max of the EV100 exposure.
          float reflectance=n.y>.5?${FLOOR_REFLECTANCE.toFixed(2)}:${WALL_REFLECTANCE.toFixed(2)};
          gl_FragColor=vec4(lightColor*(reflectance*lux/3.14159265359*exposure),1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        #endif
      }`,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), material);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), material);
  wall.position.set(0, 2.5, -2);
  scene.add(wall);
  const fixtureUniforms = {
    luminanceMap: { value: blankTexture() },
    lightColor: uniforms.lightColor,
    exposure: uniforms.exposure,
  };
  // The opening's average luminance toward the camera, at the same camera exposure as the receivers.
  const fixture = new THREE.Mesh(
    fixtureGeometry(displayedShape(luminousShape({ width: 0, length: 0, height: 0 }))),
    new THREE.ShaderMaterial({
      uniforms: fixtureUniforms,
      vertexShader: `varying vec3 worldPosition; varying vec3 worldNormal;
      void main() { vec4 world=modelMatrix*vec4(position,1.); worldPosition=world.xyz; worldNormal=mat3(modelMatrix)*normal; gl_Position=projectionMatrix*viewMatrix*world; }`,
      fragmentShader: `uniform sampler2D luminanceMap; uniform vec3 lightColor; uniform float exposure; varying vec3 worldPosition; varying vec3 worldNormal;
      void main() { vec3 d=normalize(cameraPosition-worldPosition); float theta=acos(clamp(-d.y,-1.,1.));
        float phi=0.; if(length(d.xz)>0.000001) phi=atan(d.z,d.x); if(phi<0.) phi+=6.28318530718;
        vec2 uv=(vec2(phi/6.28318530718,theta/3.14159265359)*vec2(360.,180.)+0.5)/vec2(361.,181.);
        gl_FragColor=vec4(lightColor*(texture2D(luminanceMap,uv).r*exposure),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        // A dark housing with lighter grazing edges keeps the body visible where it emits nothing toward the camera.
        float facing=abs(dot(normalize(worldNormal),d));
        gl_FragColor.rgb=max(gl_FragColor.rgb,vec3(mix(${HOUSING_EDGE},${HOUSING_FACE},facing)));
      }`,
    }),
  );
  fixture.position.copy(uniforms.lightPosition.value);
  scene.add(fixture);
  const helper = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x3b82f6, toneMapped: false }),
  );
  scene.add(helper);
  const solidColor = 0xf59e0b;
  const solid = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({
      color: solidColor,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  const solidLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: solidColor, transparent: true, opacity: 0.6, toneMapped: false }),
  );
  solid.add(solidLines);
  scene.add(solid);
  // Pixel-width lines over a dark halo stay legible on the dark realistic and bright false-colour floors.
  const rulerGeometry = new LineSegmentsGeometry();
  const rulerLine = (color: number, linewidth: number, opacity: number, renderOrder: number) => {
    const line = new LineSegments2(
      rulerGeometry,
      new LineMaterial({ color, linewidth, opacity, transparent: true, depthWrite: false, toneMapped: false }),
    );
    line.renderOrder = renderOrder;
    return line;
  };
  const rulers = new THREE.Group();
  rulers.add(rulerLine(0x0f172a, 4, 0.7, 1), rulerLine(RULER_COLOR, 1.5, 1, 2));
  scene.add(rulers);
  const glare = createGlare({
    distribution: uniforms.distribution,
    lightColor: uniforms.lightColor,
    exposure: uniforms.exposure,
  });
  scene.add(glare);
  // Set from the loaded profile; undefined until then, which hides the helper.
  const objects = {
    scene,
    uniforms,
    material,
    floor,
    wall,
    fixture,
    fixtureUniforms,
    glare,
    helper,
    solid,
    solidLines,
    rulers,
    /** Ruler labels in world space, positioned by the viewer's HTML overlay. */
    rulerLabels: [] as RulerLabel[],
    cutoff: undefined as number | undefined,
    /** World Z of the wall plane. The light sits `wallDistance` in front of it, so dragging the light keeps the wall still. */
    wallZ: -settings.wallDistance,
  };
  applyLightSceneSettings(objects, settings);
  return objects;
}
export type LightScene = ReturnType<typeof createLightScene>;
export function applyLightSceneSettings(objects: LightScene, settings: ViewerSettings): void {
  const extent = Math.max(10, settings.wallDistance * 2.5, settings.floorDistance * 4);
  const wallHeight = Math.max(5, settings.floorDistance * 2.5);
  const light = lightPosition(objects, settings);
  // Floor and wall stay centred on X = 0 and widen to keep an offset light covered.
  const width = extent + 2 * Math.abs(light.x);
  objects.floor.scale.set(width / 10, extent / 10, 1);
  objects.floor.position.z = light.z;
  objects.wall.scale.set(width / 10, wallHeight / 5, 1);
  objects.wall.position.set(0, wallHeight / 2, objects.wallZ);
  objects.wall.visible = settings.showWall;
  objects.fixture.position.copy(light);
  objects.glare.position.copy(light);
  objects.solid.position.copy(light);
  for (const nadirObject of [objects.helper, objects.rulers]) nadirObject.position.set(light.x, 0, light.z);
  objects.solid.scale.setScalar(settings.floorDistance / 2);
  objects.solid.visible = settings.photometricSolid && objects.cutoff !== undefined;
  objects.uniforms.lightPosition.value.copy(light);
  objects.uniforms.exposure.value = 1 / saturationLuminance(settings.exposure);
  const measurement = settings.viewMode === 'measurement';
  objects.glare.visible = !measurement;
  if (measurement !== 'MEASUREMENT' in objects.material.defines) {
    if (measurement) objects.material.defines.MEASUREMENT = '';
    else delete objects.material.defines.MEASUREMENT;
    objects.material.needsUpdate = true;
  }
  objects.rulers.visible = settings.rulers;
  const ruler = settings.rulers ? rulerLines(settings, extent) : undefined;
  if (ruler) {
    // A fresh geometry: the renderer caches an instanced geometry's segment count on first draw.
    const lines = rulerSegments(objects);
    lines[0]!.geometry.dispose();
    const geometry = new LineSegmentsGeometry().setPositions(ruler.positions);
    for (const line of lines) line.geometry = geometry;
  }
  objects.rulerLabels = ruler?.labels ?? [];
  objects.helper.visible = settings.helper && objects.cutoff !== undefined;
  if (objects.helper.visible)
    objects.helper.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(helperLines(objects.cutoff!, settings.floorDistance), 3),
    );
}

/** World position of the luminaire: `lightOffset` along X, `floorDistance` up, `wallDistance` in front of the wall. */
export const lightPosition = (objects: Pick<LightScene, 'wallZ'>, settings: ViewerSettings) =>
  new THREE.Vector3(settings.lightOffset, settings.floorDistance, objects.wallZ + settings.wallDistance);

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
export const RULER_COLOR = 0xf1f5f9;
export const rulerSegments = (objects: LightScene) => objects.rulers.children as LineSegments2[];
export interface RulerLabel {
  position: [number, number, number];
  text: string;
  /** The mounting-height label, which takes priority over floor distances. */
  height?: boolean;
}
/** Floor rulers along X and Z through the nadir and a mounting-height ruler on the wall (or at the nadir
 * when the wall is hidden), as line-segment vertex pairs plus their labels. */
export function rulerLines(settings: ViewerSettings, extent: number): { positions: number[]; labels: RulerLabel[] } {
  const scale = distanceScale(settings);
  const lift = scale * 0.004;
  const tick = scale * 0.05;
  const positions: number[] = [];
  const labels: RulerLabel[] = [];
  const half = extent / 2;
  const back = settings.showWall ? -settings.wallDistance : -half;
  for (const axis of ['x', 'z'] as const) {
    const at = (along: number, across: number): [number, number, number] =>
      axis === 'x' ? [along, lift, across] : [across, lift, along];
    const min = axis === 'x' ? -half : back;
    positions.push(...at(min, 0), ...at(half, 0));
    for (const { meters, label } of rulerTicks(min, half, settings.units)) {
      const size = label ? tick * 2 : tick;
      positions.push(...at(meters, -size), ...at(meters, size));
      // One "0" at the nadir, shared by both axes.
      if (label && !(axis === 'z' && meters === 0)) labels.push({ position: at(meters, tick * 5), text: label });
    }
  }
  const z = settings.showWall ? -settings.wallDistance + lift : 0;
  const h = settings.floorDistance;
  positions.push(0, 0, z, 0, h, z, -tick * 2, 0, z, tick * 2, 0, z, -tick * 2, h, z, tick * 2, h, z);
  labels.push({ position: [0, h / 2, z], text: formatLength(h, settings.units), height: true });
  // The overlay drops labels that would overlap earlier ones: keep the height, then the nearest distances.
  const rank = (label: RulerLabel) => (label.height ? -1 : Math.hypot(label.position[0], label.position[2]));
  return { positions, labels: labels.toSorted((a, b) => rank(a) - rank(b)) };
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
/** Point the measurement ramp and contour lines at a legend; undefined shows an empty scale. */
export function applyIlluminanceLegend(objects: LightScene, legend: IlluminanceLegend | undefined): void {
  const levels = legend?.levels.slice(-MAX_CONTOUR_LEVELS) ?? [];
  objects.uniforms.rampPeak.value = legend?.peak || 1;
  objects.uniforms.rampDecades.value = legend?.decades ?? 3;
  objects.uniforms.levelCount.value = levels.length;
  levels.forEach((level, i) => (objects.uniforms.logLevels.value[i] = Math.log(level.lux)));
}
export function disposeLightScene(objects: LightScene): void {
  objects.floor.geometry.dispose();
  objects.wall.geometry.dispose();
  objects.fixture.geometry.dispose();
  objects.fixture.material.dispose();
  objects.glare.geometry.dispose();
  objects.glare.material.dispose();
  objects.fixtureUniforms.luminanceMap.value.dispose();
  objects.helper.geometry.dispose();
  objects.helper.material.dispose();
  objects.solid.geometry.dispose();
  objects.solid.material.dispose();
  objects.solidLines.geometry.dispose();
  objects.solidLines.material.dispose();
  const rulers = rulerSegments(objects);
  rulers[0]!.geometry.dispose();
  for (const line of rulers) line.material.dispose();
  objects.uniforms.distribution.value.dispose();
  objects.material.dispose();
}

/** sRGB greys of the fixture housing where it emits nothing toward the camera: grazing edges and faces seen head-on. */
const HOUSING_EDGE = '0.35';
const HOUSING_FACE = '0.06';
/** Camera glare: radii in CSS pixels of the halo's scatter lobe and of its quad. */
export const GLARE_SPREAD = 24;
export const GLARE_RADIUS = 160;
/** Share of the fixture's exposed image energy that the lens scatters into the halo. */
export const GLARE_FRACTION = 0.1;

/**
 * Camera-facing additive halo at the light, like lens glare from a bright source. Its energy is GLARE_FRACTION of
 * the fixture's exposed image: luminance toward the camera times its image area, which is I · (pixels per metre)².
 * The fixture draws its own unscattered image, so the halo is only the wide scatter lobe and the body occludes its
 * centre: a small source reads as a bright fixture in a soft glow rather than a large white disc. A downlight seen
 * from above has no glare. Shares the scene exposure and tone mapping; not pickable (dragging hit-tests the fixture).
 */
function createGlare(uniforms: {
  distribution: { value: THREE.Texture };
  lightColor: { value: THREE.Color };
  exposure: { value: number };
}) {
  const glare = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { ...uniforms, resolution: { value: new THREE.Vector2(1, 1) } },
      vertexShader: `uniform sampler2D distribution; uniform float exposure; uniform vec2 resolution;
      varying vec2 offset; varying float energy;
      void main() { vec3 center=(modelMatrix*vec4(0.,0.,0.,1.)).xyz; vec3 toCamera=cameraPosition-center;
        float d=max(length(toCamera),1e-3); vec3 dir=toCamera/d; float theta=acos(clamp(-dir.y,-1.,1.));
        float phi=0.; if(length(dir.xz)>0.000001) phi=atan(dir.z,dir.x); if(phi<0.) phi+=6.28318530718;
        vec2 uv=(vec2(phi/6.28318530718,theta/3.14159265359)*vec2(360.,180.)+0.5)/vec2(361.,181.);
        float pixelsPerMetre=.5*resolution.y*projectionMatrix[1][1]/d;
        energy=${GLARE_FRACTION.toFixed(3)}*texture2D(distribution,uv).r*pixelsPerMetre*pixelsPerMetre*exposure;
        // Drawn at the fixture's centre: the body's near side occludes the halo, so the housing silhouette and the
        // emitting face (at its own luminance) stay visible over it, and nearer surfaces still occlude it.
        vec4 clip=projectionMatrix*viewMatrix*vec4(center,1.);
        offset=position.xy*${GLARE_RADIUS.toFixed(1)};
        clip.xy+=offset*2./resolution*clip.w;
        gl_Position=clip; }`,
      fragmentShader: `uniform vec3 lightColor; varying vec2 offset; varying float energy;
      // Unit-energy profile (1 + r²/a²)⁻² / πa².
      float lobe(float r2, float a) { float f=1./(1.+r2/(a*a)); return f*f/(3.14159265359*a*a); }
      void main() { float r2=dot(offset,offset); float window=max(1.-r2/${(GLARE_RADIUS * GLARE_RADIUS).toFixed(1)},0.);
        gl_FragColor=vec4(lightColor*energy*lobe(r2,${GLARE_SPREAD.toFixed(1)})*window*window,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  glare.frustumCulled = false;
  glare.renderOrder = 3;
  glare.raycast = () => {};
  return glare;
}

function blankTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Float32Array(2 * 2), 2, 2, THREE.RedFormat, THREE.FloatType);
  texture.needsUpdate = true;
  return texture;
}

/** Real-sized shape with a 1 cm floor per axis and a 5 cm floor on its largest extent; points become 5 cm spheres. */
export function displayedShape(shape: LuminousShape): LuminousShape {
  const largest = Math.max(shape.width, shape.length, shape.height);
  const grow = largest > 0 ? Math.max(1, 0.05 / largest) : 0;
  const size = (value: number) => (largest > 0 ? Math.max(value * grow, 0.01) : 0.05);
  return { ...shape, width: size(shape.width), length: size(shape.length), height: size(shape.height) };
}

/** Unit primitive scaled to the shape: length along X, height along Y, width along Z. */
export function fixtureGeometry({ solid, axis, width, length, height }: LuminousShape): THREE.BufferGeometry {
  const geometry =
    solid === 'box'
      ? new THREE.BoxGeometry(1, 1, 1)
      : solid === 'ellipsoid'
        ? new THREE.SphereGeometry(0.5, 32, 16)
        : new THREE.CylinderGeometry(0.5, 0.5, 1, 48);
  if (solid === 'cylinder' && axis === 'x') geometry.rotateZ(Math.PI / 2);
  if (solid === 'cylinder' && axis === 'z') geometry.rotateX(Math.PI / 2);
  return geometry.scale(length, height, width);
}

/** Replace the distribution, fixture shape, luminance and photometric solid; `undefined` clears them. */
export function setLightSceneProfile(objects: LightScene, profile: IESProfile | undefined, settings: ViewerSettings) {
  const distribution = profile ? createCandelaTexture(profile) : blankTexture();
  const shape = displayedShape(
    luminousShape(profile?.dimensions ?? { width: 0, length: 0, height: 0 }, profile?.units, profile?.version),
  );
  objects.uniforms.distribution.value.dispose();
  objects.uniforms.distribution.value = distribution;
  objects.fixtureUniforms.luminanceMap.value.dispose();
  objects.fixtureUniforms.luminanceMap.value = profile ? createLuminanceTexture(distribution, shape) : blankTexture();
  objects.fixture.geometry.dispose();
  objects.fixture.geometry = fixtureGeometry(shape);
  objects.solid.geometry.dispose();
  objects.solidLines.geometry.dispose();
  [objects.solid.geometry, objects.solidLines.geometry] = profile
    ? solidGeometry(profile)
    : [new THREE.BufferGeometry(), new THREE.BufferGeometry()];
  objects.cutoff = profile && cutoffAngle(profile);
  applyLightSceneSettings(objects, settings);
}

const SOLID_SEGMENTS = 48;
/** Candela surface normalized to a unit peak radius, plus its latitude/longitude grid lines. */
export function solidGeometry(profile: IESProfile): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const topology = buildIntensityTopology(profile, {
    horizontalSegments: SOLID_SEGMENTS,
    verticalSegments: SOLID_SEGMENTS,
  });
  const positions = topology.vertices.flatMap(({ position }) => position.map((v) => v / (topology.maximum || 1)));
  const surface = new THREE.BufferGeometry();
  surface.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  surface.setIndex(topology.faces.flat());
  const lines: number[] = [];
  const row = SOLID_SEGMENTS + 1;
  for (let v = 0; v <= SOLID_SEGMENTS; v++)
    for (let h = 0; h <= SOLID_SEGMENTS; h++) {
      const i = v * row + h;
      if (h < SOLID_SEGMENTS && v > 0 && v < SOLID_SEGMENTS && v % 4 === 0) lines.push(i, i + 1);
      if (v < SOLID_SEGMENTS && h % 4 === 0) lines.push(i, i + row);
    }
  const grid = new THREE.BufferGeometry();
  grid.setAttribute('position', surface.getAttribute('position'));
  grid.setIndex(lines);
  return [surface, grid];
}
