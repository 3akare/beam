import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { HDRI } from './assets';
import { beamLight } from './lighting';
import { backgroundTexture } from './textures';

/** Screen space (CSS px) kept free for the title bar and the inventory tray. */
const TOP_PX = 64;
const BOTTOM_PX = 128;
const SIDE_PX = 16;

/** Adds a faint haze of the beam light over everything, in linear HDR before bloom. */
const HazeShader = {
  uniforms: { tDiffuse: { value: null }, uLightBuf: beamLight.uLightBuf, uHaze: { value: 0.06 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D uLightBuf;
    uniform float uHaze;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb += texture2D(uLightBuf, vUv).rgb * uHaze;
      gl_FragColor = c;
    }`,
};

/** One direction of a 9-tap gaussian blur (run horizontally, then vertically). */
const blurMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null as THREE.Texture | null }, uStep: { value: new THREE.Vector2() } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSrc;
      uniform vec2 uStep;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
        c += (texture2D(tSrc, vUv + uStep * 1.3846153846).rgb + texture2D(tSrc, vUv - uStep * 1.3846153846).rgb) * 0.3162162162;
        c += (texture2D(tSrc, vUv + uStep * 3.2307692308).rgb + texture2D(tSrc, vUv - uStep * 3.2307692308).rgb) * 0.0702702703;
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });

/** Final grade, after tone mapping: vignette, film grain, and dithering to stop banding. */
const FinishShader = {
  uniforms: { tDiffuse: { value: null }, uTime: beamLight.uTime },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // A touch more saturation and contrast: AgX is honest but a little flat.
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.12);
      c = (c - 0.5) * 1.04 + 0.5;
      vec2 q = vUv - 0.5;
      c *= 1.0 - dot(q, q) * 0.9;
      float grain = ign(gl_FragCoord.xy + fract(uTime * 7.0) * 113.0) - 0.5;
      c += grain * 0.022;
      c += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/** Renderer, a straight-down orthographic camera, lights, the beam light buffer and post-processing. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  /** Things drawn only into the light buffer (wide soft beam light). */
  readonly lightScene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);

  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private lightTarget: THREE.WebGLRenderTarget;
  private blurTarget: THREE.WebGLRenderTarget;
  private blurQuad = new FullScreenQuad(blurMaterial());
  private board = { w: 12, h: 8 };
  private raycaster = new THREE.Raycaster();
  private floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private clock = new THREE.Clock();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // AgX takes bright saturated light gracefully to white instead of skewing its hue.
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // Reflections: a quick studio environment now, the neon-studio HDRI once it loads.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    new HDRLoader().load(HDRI.neon, (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = pmrem.fromEquirectangular(hdr).texture;
      this.scene.environmentIntensity = 0.85;
      hdr.dispose();
    });

    // Looking straight down, with north (board y = 0) at the top of the screen.
    this.camera.position.set(0, 30, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.HemisphereLight(0xc8d0ff, 0x1a0f12, 0.12));
    // A dim key light from the upper left for form and soft shadows; the beams do the rest.
    const key = new THREE.DirectionalLight(0xfff0e0, 0.55);
    key.position.set(-5, 12, -4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -9;
    key.shadow.camera.right = key.shadow.camera.top = 9;
    key.shadow.radius = 5;
    key.shadow.bias = -0.0004;
    this.scene.add(key);

    this.lightTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.blurTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    beamLight.uLightBuf.value = this.lightTarget.texture;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new ShaderPass(HazeShader));
    // Only HDR values above 1 bloom: beam cores, flares, lit targets.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.5, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new ShaderPass(FinishShader));

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setTint(tint: string) {
    const old = this.scene.background as THREE.Texture | null;
    this.scene.background = backgroundTexture(new THREE.Color(tint));
    old?.dispose();
  }

  /** Frame a board of this size (board units). */
  fit(w: number, h: number) {
    this.board = { w, h };
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = this.renderer.getPixelRatio();
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.lightTarget.setSize(Math.ceil((w * dpr) / 2), Math.ceil((h * dpr) / 2));
    this.blurTarget.setSize(Math.ceil((w * dpr) / 2), Math.ceil((h * dpr) / 2));
    beamLight.uLightRes.value.set(w * dpr, h * dpr);

    // World units per CSS pixel, so the board (plus its wall rim) fits the free area.
    const margin = 1.3;
    const s = Math.max((this.board.w + margin) / (w - SIDE_PX * 2), (this.board.h + margin) / (h - TOP_PX - BOTTOM_PX));
    const halfW = (w * s) / 2;
    const halfH = (h * s) / 2;
    // Centre the board in the space between title bar and tray.
    const shift = ((BOTTOM_PX - TOP_PX) / 2) * s;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH - shift;
    this.camera.bottom = -halfH - shift;
    this.camera.updateProjectionMatrix();
  }

  /** CSS pixel position → point on the floor plane (world coordinates). */
  toFloor(clientX: number, clientY: number): THREE.Vector3 {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.floor, new THREE.Vector3()) ?? new THREE.Vector3();
  }

  /** World point → CSS pixel position. */
  toScreen(p: THREE.Vector3) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = p.clone().project(this.camera);
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  render() {
    beamLight.uTime.value = this.clock.getElapsedTime();
    // 1. Beam light into the half-res HDR buffer (black background, additive).
    this.renderer.setRenderTarget(this.lightTarget);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear();
    this.renderer.render(this.lightScene, this.camera);
    // Soften it: two blur rounds, each horizontal then vertical.
    const mat = this.blurQuad.material as THREE.ShaderMaterial;
    const { width, height } = this.lightTarget;
    for (const spread of [1.5, 3]) {
      mat.uniforms.tSrc.value = this.lightTarget.texture;
      mat.uniforms.uStep.value.set(spread / width, 0);
      this.renderer.setRenderTarget(this.blurTarget);
      this.blurQuad.render(this.renderer);
      mat.uniforms.tSrc.value = this.blurTarget.texture;
      mat.uniforms.uStep.value.set(0, spread / height);
      this.renderer.setRenderTarget(this.lightTarget);
      this.blurQuad.render(this.renderer);
    }
    this.renderer.setRenderTarget(null);
    // 2. The stage, which samples that buffer, then post.
    this.composer.render();
  }
}
