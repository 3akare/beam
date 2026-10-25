import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { LightSegment } from '../game/light';
import { emitterOrigin, EMITTER_RADIUS, MIRROR_LENGTH, PRISM_SIDE } from '../game/optics';
import type { Level, LightColor, PieceKind, Placed, Rect, Vec } from '../game/types';
import { brick, brushedSteel, concrete, fingerprints, silver } from './assets';
import { BeamRenderer } from './beams';
import { dustMotes, receiveBeamLight } from './lighting';
import { glowTexture } from './textures';
import { easeInOutCubic, easeOutBack, Tweens } from './tween';

const WALL_H = 0.45;
const BEAM_Y = 0.24;
const RIM = 0.4;

/** Display colours (sRGB) for targets. */
export const SWATCH: Record<LightColor, string> = { white: '#fff1dc', red: '#ff4040', green: '#3dff86', blue: '#4a86ff' };

interface PieceView {
  group: THREE.Group;
  kind: PieceKind;
  invalid: THREE.Mesh;
}

interface TargetView {
  group: THREE.Group;
  ring: THREE.MeshPhysicalMaterial;
  orb: THREE.MeshPhysicalMaterial;
  orbMesh: THREE.Mesh;
  halo: THREE.Mesh;
  level: number;
  warmth: number;
}

/** A level drawn from above: neon brick walls, emitter, targets, placed pieces, beams and the dial. */
export class Board {
  readonly group = new THREE.Group();
  /** Add to the stage's light scene: beam light that falls on the floor and walls. */
  readonly lightGroup: THREE.Group;

  private tweens = new Tweens();
  private time = 0;
  private disposables: { dispose(): void }[] = [];
  private walls: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial }[] = [];
  private emitter = new THREE.Group();
  private targets: TargetView[] = [];
  private pieces = new Map<string, PieceView>();
  private fixed: THREE.Group[] = [];
  private beams: BeamRenderer;
  private dial = new THREE.Group();
  private dialKnob: THREE.Group;
  private dialPointer: THREE.Mesh;
  private dialMat: THREE.MeshBasicMaterial;
  private knobMat: THREE.MeshBasicMaterial;
  private wallGlow = 0.75;

  // Shared piece parts.
  private mirrorParts: { geo: THREE.BufferGeometry; mat: THREE.Material; y: number; x?: number }[] = [];
  private prismParts: { geo: THREE.BufferGeometry; mat: THREE.Material; y: number; edges?: boolean }[] = [];
  private invalidGeo: THREE.CircleGeometry;
  private invalidMat: THREE.MeshBasicMaterial;

  constructor(private level: Level) {
    const { width: W, height: H } = level;
    const tint = new THREE.Color(level.tint);
    const glow = this.own(glowTexture());

    // Floor: scuffed painted concrete, nearly black until a beam passes over it.
    const floorMaps = concrete(W / 4, H / 4);
    Object.values(floorMaps).forEach((t) => this.own(t));
    const floorMat = receiveBeamLight(
      this.own(
        new THREE.MeshStandardMaterial({
          map: floorMaps.map,
          normalMap: floorMaps.normalMap,
          roughnessMap: floorMaps.arm,
          aoMap: floorMaps.arm,
          color: 0x8a8a94,
          roughness: 1,
          metalness: 0,
        }),
      ),
      { gain: 0.9 },
    );
    const floor = new THREE.Mesh(this.own(new THREE.PlaneGeometry(W, H)), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Neon brick walls: real fired brick whose faces glow in the level's colour.
    const rim: Rect[] = [
      { x: -RIM, y: -RIM, w: W + RIM * 2, h: RIM },
      { x: -RIM, y: H, w: W + RIM * 2, h: RIM },
      { x: -RIM, y: 0, w: RIM, h: H },
      { x: W, y: 0, w: RIM, h: H },
    ];
    for (const r of [...rim, ...level.walls]) {
      const vertical = r.h > r.w;
      const along = vertical ? r.h : r.w;
      const across = vertical ? r.w : r.h;
      const maps = brick(along / 2.2, Math.max(across, 0.4) / 2.2, vertical ? Math.PI / 2 : 0);
      Object.values(maps).forEach((t) => this.own(t));
      const mat = receiveBeamLight(
        this.own(
          new THREE.MeshStandardMaterial({
            map: maps.map,
            normalMap: maps.normalMap,
            normalScale: new THREE.Vector2(1.4, 1.4),
            roughnessMap: maps.arm,
            emissive: tint,
            emissiveIntensity: this.wallGlow,
            roughness: 1,
          }),
        ),
        { gain: 1.6, neonBricks: true },
      );
      const mesh = new THREE.Mesh(this.own(new RoundedBoxGeometry(r.w, WALL_H, r.h, 2, 0.04)), mat);
      mesh.position.copy(this.toWorld({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, WALL_H / 2));
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      this.walls.push({ mesh, mat });
    }

    // Emitter: graphite housing, brass collar, glowing lens.
    const steel = brushedSteel(1, 1);
    Object.values(steel).forEach((t) => this.own(t));
    const graphite = this.own(
      new THREE.MeshPhysicalMaterial({
        color: 0x30333b,
        metalness: 0.85,
        roughness: 0.55,
        roughnessMap: steel.roughnessMap,
        normalMap: steel.normalMap,
        normalScale: new THREE.Vector2(0.5, 0.5),
        clearcoat: 0.5,
        clearcoatRoughness: 0.2,
      }),
    );
    const brass = this.own(
      new THREE.MeshPhysicalMaterial({
        color: 0xd9ad68,
        metalness: 1,
        roughness: 0.5,
        roughnessMap: steel.roughnessMap,
        normalMap: steel.normalMap,
        normalScale: new THREE.Vector2(0.3, 0.3),
      }),
    );
    const housing = new THREE.Mesh(this.own(new RoundedBoxGeometry(0.78, 0.42, 0.6, 3, 0.1)), graphite);
    housing.position.set(-0.05, 0.21, 0);
    const collar = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 40)), brass);
    collar.rotation.z = Math.PI / 2;
    collar.position.set(EMITTER_RADIUS - 0.1, BEAM_Y, 0);
    const lens = new THREE.Mesh(
      this.own(new THREE.CylinderGeometry(0.16, 0.16, 0.13, 40)),
      this.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.55, 1.4) })),
    );
    lens.rotation.z = Math.PI / 2;
    lens.position.set(EMITTER_RADIUS - 0.08, BEAM_Y, 0);
    for (const m of [housing, collar]) m.castShadow = m.receiveShadow = true;
    this.emitter.add(housing, collar, lens);
    this.emitter.position.copy(this.toWorld(level.emitter));
    this.emitter.rotation.y = -level.emitter.angle;
    this.group.add(this.emitter);

    // Targets: a dark plinth, a glossy ring and a crystal orb in the target's colour.
    const plinthGeo = this.own(new THREE.CylinderGeometry(0.38, 0.41, 0.06, 48));
    const ringGeo = this.own(new THREE.TorusGeometry(0.29, 0.05, 20, 72));
    const orbGeo = this.own(new THREE.SphereGeometry(0.14, 32, 16));
    for (const t of level.targets) {
      const color = new THREE.Color(SWATCH[t.color]);
      const body = color.clone().multiplyScalar(0.55);
      const g = new THREE.Group();
      const plinth = new THREE.Mesh(plinthGeo, graphite);
      plinth.position.y = 0.03;
      const ringMat = this.own(
        new THREE.MeshPhysicalMaterial({ color: body, emissive: color, emissiveIntensity: 0.06, metalness: 0.3, roughness: 0.5, envMapIntensity: 0.4 }),
      );
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.12;
      const orbMat = this.own(
        new THREE.MeshPhysicalMaterial({ color: body, emissive: color, emissiveIntensity: 0.05, roughness: 0.55, envMapIntensity: 0.3 }),
      );
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.y = 0.2;
      for (const m of [plinth, ring, orb]) m.castShadow = true;
      plinth.receiveShadow = true;
      const halo = this.halo(glow, color, 1.9, 0, 0);
      g.add(plinth, ring, orb, halo);
      g.position.copy(this.toWorld(t));
      this.group.add(g);
      this.targets.push({ group: g, ring: ringMat, orb: orbMat, orbMesh: orb, halo, level: 0, warmth: 0 });
    }

    // Piece parts, shared by every placed mirror and prism.
    const mirrorMaps = silver(1, 0.25);
    const smudge = fingerprints(1, 1);
    [...Object.values(mirrorMaps), ...Object.values(smudge)].forEach((t) => this.own(t));
    const chrome = this.own(
      new THREE.MeshPhysicalMaterial({
        color: 0xc9d2de,
        metalness: 1,
        roughness: 0.35,
        roughnessMap: mirrorMaps.roughnessMap,
        normalMap: mirrorMaps.normalMap,
        normalScale: new THREE.Vector2(0.25, 0.25),
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        clearcoatRoughnessMap: smudge.roughnessMap,
      }),
    );
    this.mirrorParts = [
      { geo: this.own(new RoundedBoxGeometry(MIRROR_LENGTH - 0.1, 0.24, 0.12, 3, 0.04)), mat: chrome, y: BEAM_Y },
      { geo: this.own(new RoundedBoxGeometry(0.12, 0.3, 0.2, 3, 0.04)), mat: graphite, y: 0.15, x: -MIRROR_LENGTH / 2 + 0.04 },
      { geo: this.own(new RoundedBoxGeometry(0.12, 0.3, 0.2, 3, 0.04)), mat: graphite, y: 0.15, x: MIRROR_LENGTH / 2 - 0.04 },
      { geo: this.own(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 24)), mat: brass, y: 0.2 },
    ];
    const prismGeo = this.own(prismGeometry());
    const glass = this.own(
      new THREE.MeshPhysicalMaterial({
        color: 0xeef6ff,
        metalness: 0,
        roughness: 0.12,
        roughnessMap: smudge.roughnessMap,
        transmission: 1,
        thickness: 0.6,
        ior: 1.52,
        dispersion: 6,
        attenuationColor: new THREE.Color(0xdff0ff),
        attenuationDistance: 2.5,
        specularIntensity: 1,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        emissive: new THREE.Color(0x9fb8d8),
        emissiveIntensity: 0.05,
        iridescence: 0.35,
        iridescenceIOR: 1.3,
      }),
    );
    const edgeMat = this.own(new THREE.LineBasicMaterial({ color: new THREE.Color(1.05, 1.15, 1.3) }));
    this.prismParts = [
      { geo: prismGeo, mat: glass, y: 0 },
      { geo: this.own(new THREE.EdgesGeometry(prismGeo, 25)), mat: edgeMat, y: 0, edges: true },
    ];
    this.invalidGeo = this.own(new THREE.CircleGeometry(0.62, 48));
    this.invalidMat = this.own(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.15, 0.15), transparent: true, opacity: 0.35, depthWrite: false }),
    );

    // Bolted pieces: a graphite mounting plate with brass rivets says "this one doesn't move".
    const plateGeo = this.own(new THREE.CylinderGeometry(0.56, 0.6, 0.05, 48));
    const rivetGeo = this.own(new THREE.SphereGeometry(0.045, 12, 8));
    for (const p of level.fixed ?? []) {
      const view = this.makePiece(p.kind);
      const plate = new THREE.Mesh(plateGeo, graphite);
      plate.position.y = 0.025;
      plate.receiveShadow = true;
      view.group.add(plate);
      for (let k = 0; k < 4; k++) {
        const rivet = new THREE.Mesh(rivetGeo, brass);
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        rivet.position.set(Math.cos(a) * 0.48, 0.05, Math.sin(a) * 0.48);
        view.group.add(rivet);
      }
      view.group.position.copy(this.toWorld(p));
      view.group.rotation.y = -p.angle;
      this.group.add(view.group);
      this.fixed.push(view.group);
    }

    // Light: volumetric beams and flares, plus their glow for the floor; dust that catches it.
    this.beams = new BeamRenderer((p, y) => this.toWorld(p, y));
    this.group.add(this.beams.group);
    this.lightGroup = this.beams.lightGroup;
    const dust = dustMotes(W, H);
    this.own(dust.geometry);
    this.own(dust.material as THREE.Material);
    this.group.add(dust);

    // Rotation dial: an orange ring on a dark backing (readable over any light), 5° and
    // 15° ticks, a pointer from the centre, and a big knob at the piece's angle.
    const ORANGE = new THREE.Color(0xff8a1f);
    const flat = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      return m;
    };
    const backing = this.own(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    this.dialMat = this.own(new THREE.MeshBasicMaterial({ color: ORANGE.clone(), transparent: true, depthWrite: false }));
    this.dial.add(flat(this.own(new THREE.RingGeometry(0.78, 0.96, 128)), backing));
    this.dial.add(flat(this.own(new THREE.RingGeometry(0.855, 0.9, 128)), this.dialMat));
    const tickGeo = this.own(new THREE.PlaneGeometry(1, 1));
    tickGeo.rotateX(-Math.PI / 2);
    for (let a = 0; a < 360; a += 5) {
      const major = a % 15 === 0;
      const tick = new THREE.Mesh(tickGeo, this.dialMat);
      const len = a % 90 === 0 ? 0.11 : major ? 0.07 : 0.035;
      const r = 0.84 - len / 2;
      tick.scale.set(len, 1, major ? 0.022 : 0.012);
      tick.position.set(Math.cos((a * Math.PI) / 180) * r, 0, Math.sin((a * Math.PI) / 180) * r);
      tick.rotation.y = (-a * Math.PI) / 180;
      this.dial.add(tick);
    }
    this.dialPointer = new THREE.Mesh(tickGeo, this.dialMat);
    this.dialPointer.scale.set(0.3, 1, 0.022);
    this.dial.add(this.dialPointer);
    this.dialKnob = new THREE.Group();
    this.dialKnob.add(flat(this.own(new THREE.CircleGeometry(0.19, 40)), backing));
    this.knobMat = this.own(new THREE.MeshBasicMaterial({ color: ORANGE.clone() }));
    this.dialKnob.add(flat(this.own(new THREE.CircleGeometry(0.14, 40)), this.knobMat));
    this.dialKnob.add(flat(this.own(new THREE.RingGeometry(0.05, 0.075, 32)), backing));
    this.dial.add(this.dialKnob);
    this.setDialState('idle');
    this.dial.position.y = 0.02;
    this.dial.visible = false;
    this.group.add(this.dial);
  }

  private own<T extends { dispose(): void }>(thing: T): T {
    this.disposables.push(thing);
    return thing;
  }

  private halo(tex: THREE.Texture, color: THREE.Color, size: number, x: number, opacity: number) {
    const mat = this.own(
      new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    const m = new THREE.Mesh(this.own(new THREE.PlaneGeometry(size, size)), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.05, 0);
    return m;
  }

  toWorld(p: Vec, y = 0) {
    return new THREE.Vector3(p.x - this.level.width / 2, y, p.y - this.level.height / 2);
  }

  toBoard(v: THREE.Vector3): Vec {
    return { x: v.x + this.level.width / 2, y: v.z + this.level.height / 2 };
  }

  /** Create, move and remove piece meshes to match the placed list. */
  syncPieces(placed: Placed[], invalid: string | null) {
    const seen = new Set<string>();
    for (const p of placed) {
      seen.add(p.id);
      let view = this.pieces.get(p.id);
      if (!view) {
        view = this.makePiece(p.kind);
        this.pieces.set(p.id, view);
        this.group.add(view.group);
        const g = view.group;
        this.tweens.add(0.28, (k) => g.scale.setScalar(Math.max(0.001, easeOutBack(k))));
      }
      view.group.position.copy(this.toWorld(p));
      view.group.rotation.y = -p.angle;
      view.invalid.visible = p.id === invalid;
    }
    for (const [id, view] of this.pieces) {
      if (seen.has(id)) continue;
      view.group.removeFromParent();
      this.pieces.delete(id);
    }
  }

  private makePiece(kind: PieceKind): PieceView {
    const group = new THREE.Group();
    const parts = kind === 'mirror' ? this.mirrorParts : this.prismParts;
    for (const part of parts) {
      const obj =
        'edges' in part && part.edges
          ? new THREE.LineSegments(part.geo, part.mat)
          : new THREE.Mesh(part.geo, part.mat);
      obj.position.set('x' in part ? (part.x ?? 0) : 0, part.y, 0);
      obj.castShadow = kind === 'mirror';
      group.add(obj);
    }
    const invalid = new THREE.Mesh(this.invalidGeo, this.invalidMat);
    invalid.rotation.x = -Math.PI / 2;
    invalid.position.y = 0.01;
    group.add(invalid);
    return { group, kind, invalid };
  }

  /** Lay out the traced light (see game/light.ts). */
  setLight(segments: LightSegment[]) {
    this.beams.set(segments, { p: emitterOrigin(this.level), angle: this.level.emitter.angle });
  }

  /** Per target: 1 = lit, smaller = how close a matching beam is. */
  setLit(warmth: number[]) {
    warmth.forEach((w, i) => (this.targets[i].warmth = w));
  }

  /** Show the dial around a piece, or hide it. */
  setSelected(p: Placed | null) {
    this.dial.visible = !!p;
    if (!p) return;
    this.dial.position.copy(this.toWorld(p, 0.02));
    this.dialKnob.position.set(Math.cos(p.angle) * 0.88, 0.03, Math.sin(p.angle) * 0.88);
    this.dialPointer.position.set(Math.cos(p.angle) * 0.58, 0.01, Math.sin(p.angle) * 0.58);
    this.dialPointer.rotation.y = -p.angle;
  }

  /** Brighter while hovered, brightest (glowing) while turning. */
  setDialState(state: 'idle' | 'hover' | 'active') {
    const k = state === 'active' ? 2.4 : state === 'hover' ? 1.5 : 1;
    this.dialMat.color.set(0xff8a1f).multiplyScalar(k);
    this.dialMat.opacity = state === 'idle' ? 0.85 : 1;
    this.knobMat.color.set(0xffa040).multiplyScalar(k * 1.1);
    this.dialKnob.scale.setScalar(state === 'idle' ? 1 : 1.2);
  }

  playAssemble(): Promise<void> {
    const items = [...this.walls.map((w) => w.mesh), this.emitter, ...this.targets.map((t) => t.group), ...this.fixed];
    const origin = this.toWorld(this.level.emitter);
    return Promise.all(
      items.map((obj) => {
        const delay = obj.position.distanceTo(origin) * 0.035;
        return this.tweens.add(0.55, (k) => obj.scale.setScalar(Math.max(0.001, easeOutBack(k))), delay);
      }),
    ).then(() => undefined);
  }

  /** Targets flare and the walls surge, then everything dims out. */
  playComplete(): Promise<void> {
    const flare = this.tweens.add(0.9, (k) => {
      const s = 1 + Math.sin(k * Math.PI) * 0.45;
      for (const t of this.targets) t.group.scale.setScalar(s);
      this.wallGlow = 0.75 + Math.sin(k * Math.PI) * 1.6;
    });
    const fade = this.tweens.add(
      0.8,
      (k) => {
        const e = easeInOutCubic(k);
        this.group.scale.setScalar(1 - e * 0.04);
        this.wallGlow = 0.75 * (1 - e);
      },
      0.9,
    );
    return Promise.all([flare, fade]).then(() => undefined);
  }

  /** Pieces are moving (assembling, completing, dropping in): shadows need refreshing. */
  get animating() {
    return this.tweens.active;
  }

  update(dt: number) {
    this.time += dt;
    this.tweens.update(dt);
    for (const w of this.walls) w.mat.emissiveIntensity = this.wallGlow * (0.94 + Math.sin(this.time * 1.3 + w.mesh.position.x) * 0.06);
    for (const t of this.targets) {
      t.level += (t.warmth - t.level) * Math.min(1, dt * 8);
      const k = t.level;
      t.ring.emissiveIntensity = 0.06 + k * 1.0;
      t.orb.emissiveIntensity = 0.05 + k * 1.3;
      (t.halo.material as THREE.MeshBasicMaterial).opacity = k * 0.45;
    }
  }

  dispose() {
    this.beams.dispose();
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}

/** An equilateral prism with bevelled edges; at angle 0 one corner points up (board −y). */
function prismGeometry() {
  const r = PRISM_SIDE / Math.sqrt(3) - 0.04;
  const shape = new THREE.Shape();
  [-90, 30, 150].forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    // Shape space y is board −y, so after rotating up into the world it lands on board y.
    const x = Math.cos(a) * r;
    const y = -Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 3,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.03, 0);
  return geo;
}
