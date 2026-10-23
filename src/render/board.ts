import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DX, DY, type Trace } from '../game/beam';
import type { Cell, Level } from '../game/types';
import { easeInCubic, easeInOutCubic, easeOutBack, easeOutCubic, Tweens } from './tween';

const BEAM_Y = 0.5;
const TILE_TOP = 0.14;

/** A level turned into meshes: stone seed, walls, core, mirrors and the beam. */
export class Board {
  readonly group = new THREE.Group();
  /** Meshes the pointer can grab, tagged with `userData.pieceId`. */
  readonly pickables: THREE.Object3D[] = [];

  private tweens = new Tweens();
  private time = 0;
  private disposables: { dispose(): void }[] = [];
  private pieces = new Map<string, THREE.Group>();
  private tiles: THREE.Object3D[] = [];
  private rim: { pivot: THREE.Object3D; axis: THREE.Vector3 }[] = [];
  private blocks: THREE.Object3D[] = [];
  private core: THREE.Mesh;
  private coreGroup = new THREE.Group();
  private gate: THREE.Mesh;
  private hint?: THREE.Mesh;
  private beam = new THREE.Group();
  private beamMat: THREE.MeshBasicMaterial;
  private glowMat: THREE.MeshBasicMaterial;
  private spark: THREE.Mesh;
  private beamGeo = this.own(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true));
  private beamFade = 1;

  constructor(
    private level: Level,
    showHint = false,
  ) {
    const s = level.size;
    const accent = new THREE.Color(level.palette.accent);
    const mat = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) =>
      this.own(new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra }));
    const stoneA = mat(0xf1ebe3);
    const stoneB = mat(0xebe3d9);
    const rimMat = mat(0xe4dbd0);
    const wallMat = mat(0xddd2c5);
    const puckMat = mat(0xf8f4ef, { roughness: 0.7 });
    const mirrorMat = mat(0xdde5ee, { metalness: 0.55, roughness: 0.22 });
    const accentMat = mat(accent, { emissive: accent, emissiveIntensity: 0.35 });

    // Platform the seed sits on.
    const base = new THREE.Mesh(this.own(new RoundedBoxGeometry(s + 2.1, 0.7, s + 2.1, 4, 0.18)), rimMat);
    base.position.y = -0.35;
    base.receiveShadow = true;
    this.group.add(base);
    this.tiles.push(base);

    const tileGeo = this.own(new RoundedBoxGeometry(0.93, TILE_TOP, 0.93, 2, 0.04));
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const tile = new THREE.Mesh(tileGeo, (x + y) % 2 ? stoneA : stoneB);
        tile.position.copy(this.toWorld({ x, y }, TILE_TOP / 2));
        tile.receiveShadow = true;
        this.group.add(tile);
        this.tiles.push(tile);
      }
    }

    // Rim: a ring of low blocks with a gap at the gate. Each sits on a hinge
    // at its outer edge so it can fold outward when the level is solved.
    const rimGeo = this.own(new RoundedBoxGeometry(0.96, 0.6, 0.96, 2, 0.08));
    for (let y = -1; y <= s; y++) {
      for (let x = -1; x <= s; x++) {
        const onRim = x === -1 || y === -1 || x === s || y === s;
        if (!onRim || (x === level.gate.x && y === level.gate.y)) continue;
        const outward = new THREE.Vector3(x === -1 ? -1 : x === s ? 1 : 0, 0, y === -1 ? -1 : y === s ? 1 : 0).normalize();
        const pivot = new THREE.Object3D();
        pivot.position.copy(this.toWorld({ x, y }, 0)).addScaledVector(outward, 0.48);
        const block = new THREE.Mesh(rimGeo, rimMat);
        block.position.copy(outward).multiplyScalar(-0.48).setY(0.3);
        block.castShadow = block.receiveShadow = true;
        pivot.add(block);
        this.group.add(pivot);
        this.rim.push({ pivot, axis: new THREE.Vector3(outward.z, 0, -outward.x) });
      }
    }

    const wallGeo = this.own(new RoundedBoxGeometry(0.86, 0.8, 0.86, 2, 0.1));
    for (const [x, y] of level.walls) {
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.copy(this.toWorld({ x, y }, TILE_TOP + 0.4));
      wall.castShadow = wall.receiveShadow = true;
      this.group.add(wall);
      this.blocks.push(wall);
    }

    // Gate: a glowing threshold in the gap.
    this.gate = new THREE.Mesh(this.own(new RoundedBoxGeometry(0.72, 0.05, 0.72, 2, 0.02)), accentMat);
    this.gate.position.copy(this.toWorld(level.gate, 0.02));
    this.group.add(this.gate);

    // Core: a crystal on a pedestal.
    const pedestal = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.26, 0.32, 0.2, 24)), puckMat);
    pedestal.position.y = TILE_TOP + 0.1;
    pedestal.castShadow = true;
    const coreMat = this.own(
      new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xffc98a, emissiveIntensity: 1.6, roughness: 0.3 }),
    );
    this.core = new THREE.Mesh(this.own(new THREE.OctahedronGeometry(0.24)), coreMat);
    this.core.position.y = BEAM_Y;
    this.coreGroup.add(pedestal, this.core);
    this.coreGroup.position.copy(this.toWorld(level.core, 0));
    this.group.add(this.coreGroup);

    // Mirror pieces.
    const puckGeo = this.own(new THREE.CylinderGeometry(0.4, 0.43, 0.16, 40));
    const slabGeo = this.own(new RoundedBoxGeometry(0.8, 0.56, 0.07, 2, 0.03));
    const ringGeo = this.own(new THREE.TorusGeometry(0.45, 0.025, 8, 48));
    // A generous invisible grab area, so pieces are easy to catch with a finger.
    const hitGeo = this.own(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 16));
    const hitMat = this.own(new THREE.MeshBasicMaterial({ visible: false }));
    for (const p of level.pieces) {
      const g = new THREE.Group();
      g.position.copy(this.toWorld(p, TILE_TOP));
      const puck = new THREE.Mesh(puckGeo, puckMat);
      puck.position.y = 0.08;
      const slab = new THREE.Mesh(slabGeo, mirrorMat);
      slab.position.y = BEAM_Y - TILE_TOP;
      puck.castShadow = slab.castShadow = true;
      puck.receiveShadow = true;
      g.add(puck, slab);
      if (p.follower) {
        const ring = new THREE.Mesh(ringGeo, accentMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.17;
        g.add(ring);
      } else {
        const hit = new THREE.Mesh(hitGeo, hitMat);
        hit.position.y = 0.45;
        hit.userData.pieceId = p.id;
        g.add(hit);
        this.pickables.push(hit);
      }
      this.group.add(g);
      this.pieces.set(p.id, g);
      this.setPieceAngle(p.id, p.o);
    }

    // Grooves showing which pieces turn together.
    for (const p of level.pieces) {
      for (const t of p.turns ?? []) {
        const other = level.pieces.find((q) => q.id === t)!;
        const a = this.toWorld(p, TILE_TOP + 0.005);
        const b = this.toWorld(other, TILE_TOP + 0.005);
        const groove = new THREE.Mesh(this.own(new THREE.BoxGeometry(0.07, 0.012, a.distanceTo(b))), accentMat);
        groove.position.copy(a).lerp(b, 0.5);
        groove.lookAt(b.x, groove.position.y, b.z);
        this.group.add(groove);
        this.blocks.push(groove);
      }
    }

    if (showHint) {
      const first = level.pieces.find((p) => !p.follower)!;
      const hintMat = this.own(new THREE.MeshBasicMaterial({ color: accent, transparent: true, depthWrite: false }));
      this.hint = new THREE.Mesh(this.own(new THREE.RingGeometry(0.5, 0.56, 48)), hintMat);
      this.hint.rotation.x = -Math.PI / 2;
      this.hint.position.copy(this.toWorld(first, TILE_TOP + 0.01));
      this.group.add(this.hint);
    }

    // Beam: a bright core line plus a soft halo, and a spark where it stops.
    this.beamMat = this.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.9, 1.25), transparent: true }));
    this.glowMat = this.own(
      new THREE.MeshBasicMaterial({ color: 0xffd7a1, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.spark = new THREE.Mesh(this.own(new THREE.SphereGeometry(0.09, 16, 12)), this.beamMat);
    this.group.add(this.beam, this.spark);
  }

  private own<T extends { dispose(): void }>(thing: T): T {
    this.disposables.push(thing);
    return thing;
  }

  toWorld(c: Cell, y = 0) {
    const half = (this.level.size - 1) / 2;
    return new THREE.Vector3(c.x - half, y, c.y - half);
  }

  /** Rotation in quarter turns (fractional while twisting). */
  setPieceAngle(id: string, quarterTurns: number) {
    const g = this.pieces.get(id);
    if (g) g.rotation.y = Math.PI / 4 + (quarterTurns * Math.PI) / 2;
  }

  pieceCenter(id: string) {
    return this.pieces.get(id)!.getWorldPosition(new THREE.Vector3()).setY(BEAM_Y);
  }

  hideHint() {
    if (!this.hint) return;
    const hint = this.hint;
    this.hint = undefined;
    this.tweens.add(0.4, (k) => ((hint.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k))).then(() =>
      hint.removeFromParent(),
    );
  }

  setBeam(tr: Trace | null) {
    this.beam.clear();
    this.spark.visible = false;
    if (!tr) return;
    const pts = tr.points.map((p) => this.toWorld(p, BEAM_Y));
    if (tr.escaped) pts[pts.length - 1].add(new THREE.Vector3(DX[tr.dir], 0, DY[tr.dir]).multiplyScalar(40));
    for (let i = 0; i < pts.length - 1; i++) {
      this.addSegment(pts[i], pts[i + 1], 0.035, this.beamMat);
      this.addSegment(pts[i], pts[i + 1], 0.1, this.glowMat);
    }
    if (!tr.escaped) {
      this.spark.position.copy(pts[pts.length - 1]);
      this.spark.visible = true;
    }
  }

  private addSegment(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) {
    const len = a.distanceTo(b);
    if (len < 1e-4) return;
    const m = new THREE.Mesh(this.beamGeo, material);
    m.scale.set(radius, len + radius * 2, radius);
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    this.beam.add(m);
  }

  /** Pieces drop in, staggered from the core outward. */
  playAssemble(): Promise<void> {
    const center = this.coreGroup.position;
    const items = [...this.tiles, ...this.rim.map((r) => r.pivot), ...this.blocks, ...this.pieces.values(), this.gate];
    const jobs = items.map((obj) => {
      const home = obj.position.clone();
      const delay = 0.05 + home.distanceTo(center) * 0.07 + Math.random() * 0.05;
      return this.tweens.add(
        0.7,
        (k) => {
          const e = easeOutBack(k);
          obj.position.set(home.x, home.y + (1 - easeOutCubic(k)) * 2.5, home.z);
          obj.scale.setScalar(Math.max(0.001, e));
        },
        delay,
      );
    });
    jobs.push(
      this.tweens.add(0.9, (k) => this.coreGroup.scale.setScalar(Math.max(0.001, easeOutBack(k)))),
    );
    return Promise.all(jobs).then(() => undefined);
  }

  /** The rim folds open, pieces lift and drift apart, and the light rushes out. */
  playSolve(): Promise<void> {
    const jobs: Promise<void>[] = [];
    const q = new THREE.Quaternion();
    this.rim.forEach(({ pivot, axis }, i) => {
      jobs.push(
        this.tweens.add(0.9, (k) => pivot.quaternion.copy(q.setFromAxisAngle(axis, easeInOutCubic(k) * Math.PI * 0.5)), 0.15 + (i % 7) * 0.02),
      );
    });
    const drift = [...this.pieces.values(), ...this.blocks];
    drift.forEach((obj, i) => {
      const home = obj.position.clone();
      const out = home.clone().setY(0).normalize().multiplyScalar(1.2);
      jobs.push(
        this.tweens.add(
          1.3,
          (k) => {
            const e = easeInOutCubic(k);
            obj.position.set(home.x + out.x * e, home.y + e * 1.4, home.z + out.z * e);
            obj.scale.setScalar(Math.max(0.001, 1 - easeInCubic(k)));
          },
          0.5 + i * 0.04,
        ),
      );
    });
    jobs.push(
      this.tweens.add(
        1.6,
        (k) => {
          const e = easeInCubic(k);
          this.coreGroup.position.y = e * 2;
          this.coreGroup.scale.setScalar(Math.max(0.001, 1 - e));
          this.beamFade = 1 - e;
        },
        0.6,
      ),
    );
    jobs.push(
      this.tweens.add(
        1,
        (k) => {
          const e = easeInCubic(k);
          for (const t of this.tiles) t.scale.setScalar(Math.max(0.001, 1 - e));
          this.gate.scale.setScalar(Math.max(0.001, 1 - e));
          for (const r of this.rim) r.pivot.scale.setScalar(Math.max(0.001, 1 - e));
        },
        1.5,
      ),
    );
    return Promise.all(jobs).then(() => undefined);
  }

  update(dt: number) {
    this.time += dt;
    this.tweens.update(dt);
    this.core.rotation.y += dt * 0.8;
    this.core.position.y = BEAM_Y + Math.sin(this.time * 1.6) * 0.03;
    const gateMat = this.gate.material as THREE.MeshStandardMaterial;
    gateMat.emissiveIntensity = 0.35 + Math.sin(this.time * 2.2) * 0.15;
    const flicker = 0.92 + Math.sin(this.time * 9) * 0.04 + Math.sin(this.time * 23) * 0.02;
    this.beamMat.opacity = this.beamFade;
    this.glowMat.opacity = 0.28 * flicker * this.beamFade;
    this.spark.scale.setScalar(0.8 + Math.sin(this.time * 7) * 0.2);
    if (this.hint) {
      const k = (this.time * 0.8) % 1;
      this.hint.scale.setScalar(1 + k * 0.5);
      (this.hint.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k);
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
