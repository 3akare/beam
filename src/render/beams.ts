import * as THREE from 'three';
import type { LightSegment } from '../game/light';
import type { Vec } from '../game/types';
import { beamLight } from './lighting';

const BEAM_Y = 0.24;
const MAX_IMPACTS = 256;

// Shared GLSL: value noise + fbm for drifting haze inside the beams.
const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
`;

// Kinds: 0 white beam, 1 spectral ribbon, 2 inside glass, 3 ghost reflection.
const BEAM_VERT = /* glsl */ `
  uniform float uWidthScale;
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute vec2 aCorner;
  attribute vec3 aColor;
  attribute vec2 aParams;
  varying float vSide;
  varying float vS;
  varying vec3 vColor;
  varying float vKind;
  varying float vEnergy;
  void main() {
    vec3 d = aEnd - aStart;
    float len = max(length(d), 1e-4);
    vec3 dir = d / len;
    vec3 perp = vec3(-dir.z, 0.0, dir.x);
    float kind = aParams.y;
    float base = kind < 0.5 ? 0.2 : kind < 1.5 ? 0.15 : kind < 2.5 ? 0.06 : 0.12;
    float s = aParams.x + aCorner.y * len;
    // Beams spread a little as they travel; brightness spreads with them.
    float w = (base + s * 0.012) * uWidthScale;
    vEnergy = base / (base + s * 0.012);
    float ext = (aCorner.y * 2.0 - 1.0) * w * 0.15;
    vec3 p = aStart + dir * (aCorner.y * len + ext) + perp * aCorner.x * w;
    vSide = aCorner.x;
    vS = s;
    vColor = aColor;
    vKind = kind;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const BEAM_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uLightPass;
  varying float vSide;
  varying float vS;
  varying vec3 vColor;
  varying float vKind;
  varying float vEnergy;
  ${NOISE}
  void main() {
    float v2 = vSide * vSide;
    float atten = exp(-vS * 0.02);
    if (uLightPass > 0.5) {
      // Wide, soft spill for lighting the floor and walls.
      float spill = exp(-v2 * 3.0) * smoothstep(1.0, 0.45, abs(vSide));
      gl_FragColor = vec4(vColor * spill * atten * vEnergy * (vKind < 0.5 ? 0.2 : 0.32), 1.0);
      return;
    }
    float halo = exp(-v2 * 4.5);
    float core = exp(-v2 * 60.0);
    float haze = fbm(vec2(vS * 0.9 - uTime * 0.25, vSide * 1.2));
    float flick = 1.0;
    float coreAmt = vKind < 0.5 ? 1.0 : vKind < 1.5 ? 0.55 : vKind < 2.5 ? 0.8 : 0.4;
    float haloAmt = vKind < 0.5 ? 1.0 : vKind < 1.5 ? 2.2 : vKind < 2.5 ? 0.6 : 0.8;
    // Saturated halo carries the colour; an HDR core burns toward white under tone mapping.
    vec3 c = vColor * halo * haloAmt * (0.6 + 0.5 * haze) * 1.6;
    c += vColor * core * coreAmt * 5.0;
    gl_FragColor = vec4(c * atten * flick * vEnergy, 1.0);
  }`;

const IMPACT_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute vec2 aKind;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vStreak;
  void main() {
    vUv = uv * 2.0 - 1.0;
    vColor = aColor;
    vStreak = aKind.x;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }`;

const IMPACT_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uLightPass;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vStreak;
  void main() {
    float r = length(vUv);
    if (uLightPass > 0.5) {
      gl_FragColor = vec4(vColor * exp(-r * r * 3.0) * smoothstep(1.0, 0.6, r) * 0.9, 1.0);
      return;
    }
    float pulse = 1.0;
    float hot = exp(-r * r * 60.0) * 3.0;
    float glow = exp(-r * r * 7.0) * 0.9 * smoothstep(1.0, 0.7, r);
    // Anamorphic streak along the surface that was hit.
    float streak = exp(-abs(vUv.y) * 40.0) * exp(-abs(vUv.x) * 2.2) * 1.4 * vStreak;
    gl_FragColor = vec4(vColor * (hot + glow + streak) * pulse, 1.0);
  }`;

/** Renders traced light: soft volumetric beams, spectral ribbons and impact flares, for both the screen and the light buffer. */
export class BeamRenderer {
  /** Goes in the main scene. */
  readonly group = new THREE.Group();
  /** Goes in the light-buffer scene. */
  readonly lightGroup = new THREE.Group();

  private geo = new THREE.BufferGeometry();
  private mainMat: THREE.ShaderMaterial;
  private lightMat: THREE.ShaderMaterial;
  private impactGeo = new THREE.PlaneGeometry(1, 1);
  private impactMain: THREE.InstancedMesh;
  private impactLight: THREE.InstancedMesh;
  private impactColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_IMPACTS * 3), 3);
  private impactKind = new THREE.InstancedBufferAttribute(new Float32Array(MAX_IMPACTS * 2), 2);

  constructor(private toWorld: (p: Vec, y?: number) => THREE.Vector3) {
    const common = {
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      side: THREE.DoubleSide,
    };
    this.mainMat = new THREE.ShaderMaterial({
      uniforms: { uTime: beamLight.uTime, uWidthScale: { value: 1 }, uLightPass: { value: 0 } },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      ...common,
    });
    this.lightMat = new THREE.ShaderMaterial({
      uniforms: { uTime: beamLight.uTime, uWidthScale: { value: 4.5 }, uLightPass: { value: 1 } },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      ...common,
    });
    const main = new THREE.Mesh(this.geo, this.mainMat);
    const light = new THREE.Mesh(this.geo, this.lightMat);
    main.frustumCulled = light.frustumCulled = false;
    main.renderOrder = 10;
    this.group.add(main);
    this.lightGroup.add(light);

    this.impactGeo.rotateX(-Math.PI / 2);
    this.impactGeo.setAttribute('aColor', this.impactColor);
    this.impactGeo.setAttribute('aKind', this.impactKind);
    const impactMat = (lightPass: number) =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: beamLight.uTime, uLightPass: { value: lightPass } },
        vertexShader: IMPACT_VERT,
        fragmentShader: IMPACT_FRAG,
        ...common,
      });
    this.impactMain = new THREE.InstancedMesh(this.impactGeo, impactMat(0), MAX_IMPACTS);
    this.impactLight = new THREE.InstancedMesh(this.impactGeo, impactMat(1), MAX_IMPACTS);
    this.impactMain.frustumCulled = this.impactLight.frustumCulled = false;
    this.impactMain.renderOrder = 11;
    this.impactMain.count = this.impactLight.count = 0;
    this.group.add(this.impactMain);
    this.lightGroup.add(this.impactLight);
  }

  set(segments: LightSegment[], emitter: { p: Vec; angle: number } | null) {
    const n = segments.length;
    const start = new Float32Array(n * 12);
    const end = new Float32Array(n * 12);
    const corner = new Float32Array(n * 8);
    const color = new Float32Array(n * 12);
    const params = new Float32Array(n * 8);
    const index: number[] = [];
    const corners = [
      [-1, 0],
      [1, 0],
      [-1, 1],
      [1, 1],
    ];
    segments.forEach((s, i) => {
      const a = this.toWorld(s.a, BEAM_Y);
      const b = this.toWorld(s.b, BEAM_Y);
      const kind = s.ghost ? 3 : s.inside ? 2 : s.spectral ? 1 : 0;
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        start.set([a.x, a.y, a.z], v * 3);
        end.set([b.x, b.y, b.z], v * 3);
        corner.set(corners[k], v * 2);
        color.set(s.rgb, v * 3);
        params.set([s.s0, kind], v * 2);
      }
      const o = i * 4;
      index.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
    });
    this.geo.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    this.geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 3));
    this.geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    this.geo.setAttribute('aParams', new THREE.BufferAttribute(params, 2));
    // `position` is unused by the shader but sizes the draw.
    this.geo.setAttribute('position', new THREE.BufferAttribute(start, 3));
    this.geo.setIndex(index);

    // Flares where light meets something, plus a muzzle glow at the emitter.
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    let count = 0;
    const flare = (p: Vec, tangentAngle: number, size: number, rgb: [number, number, number], streak: number) => {
      if (count >= MAX_IMPACTS) return;
      q.setFromAxisAngle(up, -tangentAngle);
      m.compose(this.toWorld(p, BEAM_Y + 0.02), q, new THREE.Vector3(size, 1, size));
      this.impactMain.setMatrixAt(count, m);
      m.compose(this.toWorld(p, BEAM_Y), q, new THREE.Vector3(size * 4, 1, size * 4));
      this.impactLight.setMatrixAt(count, m);
      this.impactColor.setXYZ(count, ...rgb);
      this.impactKind.setXY(count, streak, 0);
      count++;
    };
    if (emitter) flare(emitter.p, emitter.angle + Math.PI / 2, 0.8, [0.8, 0.76, 0.68], 0.3);
    for (const s of segments) {
      if (s.end === 'none' || s.end === 'target' || s.inside) continue;
      const lum = s.rgb[0] * 0.3 + s.rgb[1] * 0.55 + s.rgb[2] * 0.15;
      if (lum < 0.01) continue;
      const tangent = s.normal ? Math.atan2(s.normal.y, s.normal.x) + Math.PI / 2 : 0;
      const k = s.ghost ? 0.5 : s.spectral ? 2.4 : 1;
      const size = (s.end === 'wall' ? 1.0 : 0.75) * (s.spectral ? 0.8 : 1);
      flare(s.b, tangent, size, [s.rgb[0] * k, s.rgb[1] * k, s.rgb[2] * k], s.end === 'wall' ? 1 : 0.35);
    }
    this.impactMain.count = this.impactLight.count = count;
    this.impactMain.instanceMatrix.needsUpdate = this.impactLight.instanceMatrix.needsUpdate = true;
    this.impactColor.needsUpdate = this.impactKind.needsUpdate = true;
  }

  dispose() {
    this.group.removeFromParent();
    this.lightGroup.removeFromParent();
    this.geo.dispose();
    this.impactGeo.dispose();
    this.mainMat.dispose();
    this.lightMat.dispose();
    (this.impactMain.material as THREE.Material).dispose();
    (this.impactLight.material as THREE.Material).dispose();
  }
}
