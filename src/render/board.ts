import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EMITTER_RADIUS, MIRROR_LENGTH, PRISM_SIDE, type BeamSegment } from '../game/optics';
import type { Level, LightColor, PieceKind, Placed, Rect, Vec } from '../game/types';
import { beamTexture, brickTextures, floorTexture, glowTexture } from './textures';
import { easeInOutCubic, easeOutBack, Tweens } from './tween';

const WALL_H = 0.45;
const BEAM_Y = 0.24;
const RIM = 0.4;

/** Display colours (sRGB) and HDR beam colours (bright enough to bloom). */
export const SWATCH: Record<LightColor, string> = { white: '#fff1dc', red: '#ff4040', green: '#3dff86', blue: '#4a86ff' };
const BEAM_HDR: Record<LightColor, [number, number, number]> = {
  white: [1.5, 1.42, 1.28],
  red: [2.2, 0.22, 0.18],
  green: [0.3, 1.8, 0.45],
  blue: [0.32, 0.6, 2.4],
};

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
  lit: boolean;
}

/** A level drawn from above: neon brick walls, emitter, targets, placed pieces, beams and the dial. */
export class Board {
  readonly group = new THREE.Group();

  private tweens = new Tweens();
  private time = 0;
  private disposables: { dispose(): void }[] = [];
  private walls: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial }[] = [];
  private emitter = new THREE.Group();
  private targets: TargetView[] = [];
  private pieces = new Map<string, PieceView>();
  private beamLayer = new THREE.Group();
  private beamPool: THREE.Mesh[] = [];
  private beamGeo: THREE.PlaneGeometry;
  private beamMats = new Map<string, THREE.MeshBasicMaterial>();
  private dial = new THREE.Group();
  private dialKnob: THREE.Mesh;
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

    // Floor with a faint grid.
    const floorTex = this.own(floorTexture());
    // Dark, slightly glossy floor so beams and neon reflect softly.
    floorTex.repeat.set(W, H);
    const floor = new THREE.Mesh(
      this.own(new THREE.PlaneGeometry(W, H)),
      this.own(new THREE.MeshStandardMaterial({ map: floorTex, color: 0x9a9aa6, roughness: 0.6, metalness: 0.2 })),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Neon brick walls: the board rim plus the level's own walls.
    const bricks = brickTextures();
    this.own(bricks.map);
    this.own(bricks.emissiveMap);
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
      const tex = (t: THREE.Texture) => {
        const c = this.own(t.clone());
        c.repeat.set(along / 1.2, Math.max(across, 0.3) / 0.6);
        c.rotation = vertical ? Math.PI / 2 : 0;
        c.needsUpdate = true;
        return c;
      };
      const mat = this.own(
        new THREE.MeshStandardMaterial({
          map: tex(bricks.map),
          emissiveMap: tex(bricks.emissiveMap),
          emissive: tint,
          emissiveIntensity: this.wallGlow,
          roughness: 0.8,
        }),
      );
      const mesh = new THREE.Mesh(this.own(new RoundedBoxGeometry(r.w, WALL_H, r.h, 2, 0.04)), mat);
      mesh.position.copy(this.toWorld({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, WALL_H / 2));
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      this.walls.push({ mesh, mat });
    }

    // Emitter: graphite housing, brass collar, glowing lens.
    const graphite = this.own(new THREE.MeshPhysicalMaterial({ color: 0x2b2d35, metalness: 0.75, roughness: 0.32, clearcoat: 0.6 }));
    const brass = this.own(new THREE.MeshPhysicalMaterial({ color: 0xd8b073, metalness: 1, roughness: 0.25 }));
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
    this.emitter.add(housing, collar, lens, this.halo(glow, new THREE.Color(1, 0.95, 0.85), 1.1, EMITTER_RADIUS, 0.6));
    this.emitter.position.copy(this.toWorld(level.emitter));
    this.emitter.rotation.y = -level.emitter.angle;
    this.group.add(this.emitter);

    // Targets: a dark plinth, a glossy ring and a crystal orb in the target's colour.
    const plinthGeo = this.own(new THREE.CylinderGeometry(0.38, 0.41, 0.06, 48));
    const ringGeo = this.own(new THREE.TorusGeometry(0.29, 0.05, 20, 72));
    const orbGeo = this.own(new THREE.IcosahedronGeometry(0.14, 2));
    for (const t of level.targets) {
      const color = new THREE.Color(SWATCH[t.color]);
      const body = color.clone().multiplyScalar(0.55);
      const g = new THREE.Group();
      const plinth = new THREE.Mesh(plinthGeo, graphite);
      plinth.position.y = 0.03;
      const ringMat = this.own(
        new THREE.MeshPhysicalMaterial({ color: body, emissive: color, emissiveIntensity: 0.06, metalness: 0.5, roughness: 0.25, clearcoat: 1 }),
      );
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.12;
      const orbMat = this.own(
        new THREE.MeshPhysicalMaterial({ color: body, emissive: color, emissiveIntensity: 0.05, roughness: 0.1, clearcoat: 1, flatShading: true }),
      );
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.y = 0.2;
      for (const m of [plinth, ring, orb]) m.castShadow = true;
      plinth.receiveShadow = true;
      const halo = this.halo(glow, color, 1.9, 0, 0);
      g.add(plinth, ring, orb, halo);
      g.position.copy(this.toWorld(t));
      this.group.add(g);
      this.targets.push({ group: g, ring: ringMat, orb: orbMat, orbMesh: orb, halo, level: 0, lit: false });
    }

    // Piece parts, shared by every placed mirror and prism.
    const chrome = this.own(new THREE.MeshPhysicalMaterial({ color: 0xaab3c0, metalness: 1, roughness: 0.14, envMapIntensity: 0.55 }));
    this.mirrorParts = [
      { geo: this.own(new RoundedBoxGeometry(MIRROR_LENGTH - 0.1, 0.24, 0.12, 3, 0.04)), mat: chrome, y: BEAM_Y },
      { geo: this.own(new RoundedBoxGeometry(0.12, 0.3, 0.2, 3, 0.04)), mat: graphite, y: 0.15, x: -MIRROR_LENGTH / 2 + 0.04 },
      { geo: this.own(new RoundedBoxGeometry(0.12, 0.3, 0.2, 3, 0.04)), mat: graphite, y: 0.15, x: MIRROR_LENGTH / 2 - 0.04 },
      { geo: this.own(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 24)), mat: brass, y: 0.2 },
    ];
    const prismGeo = this.own(prismGeometry());
    const glass = this.own(
      new THREE.MeshPhysicalMaterial({
        color: 0xe8f4ff,
        metalness: 0,
        roughness: 0.03,
        transmission: 1,
        thickness: 0.5,
        ior: 1.5,
        clearcoat: 1,
        iridescence: 0.6,
        iridescenceIOR: 1.3,
        transparent: true,
        opacity: 0.9,
      }),
    );
    const edgeMat = this.own(new THREE.LineBasicMaterial({ color: new THREE.Color(0.8, 0.9, 1.05) }));
    this.prismParts = [
      { geo: prismGeo, mat: glass, y: 0 },
      { geo: this.own(new THREE.EdgesGeometry(prismGeo, 25)), mat: edgeMat, y: 0, edges: true },
    ];
    this.invalidGeo = this.own(new THREE.CircleGeometry(0.62, 48));
    this.invalidMat = this.own(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.15, 0.15), transparent: true, opacity: 0.35, depthWrite: false }),
    );

    // Beams: soft additive ribbons, pooled and re-laid on every trace.
    this.beamGeo = this.own(new THREE.PlaneGeometry(1, 1));
    this.beamGeo.rotateX(-Math.PI / 2);
    const beamTex = this.own(beamTexture());
    for (const color of Object.keys(BEAM_HDR) as LightColor[]) {
      for (const layer of ['core', 'halo', 'glass']) {
        const [r, g, b] = BEAM_HDR[color];
        const k = layer === 'halo' ? 0.22 : 1;
        this.beamMats.set(
          `${color}:${layer}`,
          this.own(
            new THREE.MeshBasicMaterial({
              color: new THREE.Color(r * k, g * k, b * k),
              alphaMap: beamTex,
              transparent: true,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              depthTest: layer !== 'glass', // light inside glass shows through the prism
            }),
          ),
        );
      }
    }
    this.group.add(this.beamLayer);

    // Rotation dial: a thin ring with 15° ticks and a knob at the piece's angle.
    const dialMat = this.own(
      new THREE.MeshBasicMaterial({ color: 0xd9cbb8, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    const ring = new THREE.Mesh(this.own(new THREE.RingGeometry(0.86, 0.885, 128)), dialMat);
    ring.rotation.x = -Math.PI / 2;
    this.dial.add(ring);
    const tickGeo = this.own(new THREE.PlaneGeometry(0.1, 0.018));
    tickGeo.rotateX(-Math.PI / 2);
    for (let a = 0; a < 360; a += 15) {
      const tick = new THREE.Mesh(tickGeo, dialMat);
      const r = a % 90 === 0 ? 0.8 : 0.83;
      tick.scale.x = a % 90 === 0 ? 1.6 : 1;
      tick.position.set(Math.cos((a * Math.PI) / 180) * r, 0, Math.sin((a * Math.PI) / 180) * r);
      tick.rotation.y = (-a * Math.PI) / 180;
      this.dial.add(tick);
    }
    this.dialKnob = new THREE.Mesh(this.own(new THREE.SphereGeometry(0.075, 20, 14)), this.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.1, 0.9) })));
    this.dial.add(this.dialKnob);
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

  setBeams(segments: BeamSegment[]) {
    let n = 0;
    const take = () => {
      let m = this.beamPool[n++];
      if (!m) {
        m = new THREE.Mesh(this.beamGeo);
        m.frustumCulled = false;
        this.beamPool.push(m);
        this.beamLayer.add(m);
      }
      m.visible = true;
      return m;
    };
    for (const s of segments) {
      const a = this.toWorld(s.a, BEAM_Y);
      const b = this.toWorld(s.b, BEAM_Y);
      const len = a.distanceTo(b);
      if (len < 1e-3) continue;
      const angle = -Math.atan2(b.z - a.z, b.x - a.x);
      const wide = s.color === 'white';
      const layers: [string, number, number][] = s.inside
        ? [['glass', wide ? 0.1 : 0.07, 0.02]]
        : [
            ['halo', wide ? 0.62 : 0.42, 0],
            ['core', wide ? 0.16 : 0.1, 0.01],
          ];
      for (const [layer, width, lift] of layers) {
        const m = take();
        m.material = this.beamMats.get(`${s.color}:${layer}`)!;
        m.position.copy(a).lerp(b, 0.5).setY(BEAM_Y + lift);
        m.rotation.y = angle;
        m.scale.set(len + (layer === 'halo' ? 0 : width * 0.5), 1, width);
      }
    }
    for (let i = n; i < this.beamPool.length; i++) this.beamPool[i].visible = false;
  }

  setLit(lit: boolean[]) {
    lit.forEach((on, i) => (this.targets[i].lit = on));
  }

  /** Show the dial around a piece, or hide it. */
  setSelected(p: Placed | null) {
    this.dial.visible = !!p;
    if (!p) return;
    this.dial.position.copy(this.toWorld(p, 0.02));
    this.dialKnob.position.set(Math.cos(p.angle) * 0.87, 0.02, Math.sin(p.angle) * 0.87);
  }

  playAssemble(): Promise<void> {
    const items = [...this.walls.map((w) => w.mesh), this.emitter, ...this.targets.map((t) => t.group)];
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

  update(dt: number) {
    this.time += dt;
    this.tweens.update(dt);
    for (const w of this.walls) w.mat.emissiveIntensity = this.wallGlow * (0.94 + Math.sin(this.time * 1.3 + w.mesh.position.x) * 0.06);
    for (const t of this.targets) {
      t.level += ((t.lit ? 1 : 0) - t.level) * Math.min(1, dt * 8);
      const k = t.level;
      t.ring.emissiveIntensity = 0.06 + k * 1.6;
      t.orb.emissiveIntensity = 0.05 + k * 2.4;
      t.orbMesh.rotation.y += dt * (0.3 + k * 1.5);
      (t.halo.material as THREE.MeshBasicMaterial).opacity = k * (0.45 + Math.sin(this.time * 4) * 0.05);
    }
  }

  dispose() {
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
