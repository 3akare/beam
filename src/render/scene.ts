import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { backgroundTexture } from './textures';

/** Screen space (CSS px) kept free for the title bar and the inventory tray. */
const TOP_PX = 64;
const BOTTOM_PX = 128;
const SIDE_PX = 16;

/** Renderer, a straight-down orthographic camera, lights, bloom and the night background. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);

  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private board = { w: 12, h: 8 };
  private raycaster = new THREE.Raycaster();
  private floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // A studio environment for chrome, brass and glass to reflect.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();

    // Looking straight down, with north (board y = 0) at the top of the screen.
    this.camera.position.set(0, 30, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.HemisphereLight(0xc8d0ff, 0x1a0f12, 0.3));
    // Key light from the upper left: every piece drops a soft shadow down-right.
    const key = new THREE.DirectionalLight(0xfff0e0, 1.25);
    key.position.set(-5, 12, -4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -9;
    key.shadow.camera.right = key.shadow.camera.top = 9;
    key.shadow.radius = 5;
    key.shadow.bias = -0.0004;
    this.scene.add(key);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // On a dark stage the beams, lit targets and neon walls are the only bright things.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.65, 0.35, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

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
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);

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
    this.composer.render();
  }
}
