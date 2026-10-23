import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Palette } from '../game/types';

/** Renderer, camera, lights and the pastel background. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);

  private bgCanvas = document.createElement('canvas');
  private bgTexture: THREE.CanvasTexture;
  private colors = { top: new THREE.Color(), bottom: new THREE.Color() };
  private from = { top: new THREE.Color(), bottom: new THREE.Color() };
  private to = { top: new THREE.Color(), bottom: new THREE.Color() };
  private blend = 1;
  private hemi: THREE.HemisphereLight;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.bgCanvas.width = 2;
    this.bgCanvas.height = 256;
    this.bgTexture = new THREE.CanvasTexture(this.bgCanvas);
    this.bgTexture.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.bgTexture;
    this.scene.fog = new THREE.Fog(0xffffff, 16, 34);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xd9cfc4, 1.6);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff1e0, 2.2);
    sun.position.set(-4, 10, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -6;
    sun.shadow.camera.right = sun.shadow.camera.top = 6;
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    // Only HDR-bright things (the beam, the core) pass the threshold and glow.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.45, 1.05);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Fade the background to a new palette. */
  setPalette(p: Palette, instant = false) {
    this.from.top.copy(this.colors.top);
    this.from.bottom.copy(this.colors.bottom);
    this.to.top.set(p.top);
    this.to.bottom.set(p.bottom);
    this.blend = instant ? 1 : 0;
    if (instant) this.paintBackground(1);
  }

  private paintBackground(k: number) {
    this.colors.top.lerpColors(this.from.top, this.to.top, k);
    this.colors.bottom.lerpColors(this.from.bottom, this.to.bottom, k);
    const ctx = this.bgCanvas.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, `#${this.colors.top.getHexString()}`);
    g.addColorStop(1, `#${this.colors.bottom.getHexString()}`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 256);
    this.bgTexture.needsUpdate = true;
    (this.scene.fog as THREE.Fog).color.copy(this.colors.bottom);
    this.hemi.groundColor.copy(this.colors.top).lerp(new THREE.Color(0xd9cfc4), 0.6);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    // Keep the whole seed in view on narrow (portrait) screens.
    const dist = 16.5 * Math.max(1, 0.95 / this.camera.aspect);
    const tilt = THREE.MathUtils.degToRad(52);
    this.camera.position.set(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist);
    this.camera.lookAt(0, -0.2, 0);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = dist + 2;
    fog.far = dist + 20;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number) {
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 1.4);
      this.paintBackground(this.blend * this.blend * (3 - 2 * this.blend));
    }
  }

  render() {
    this.composer.render();
  }
}
