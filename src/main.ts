import './style.css';
import { Sound } from './audio';
import { initialOrientations, trace, turnSet } from './game/beam';
import { LEVELS } from './game/levels';
import type { Level, Orientations } from './game/types';
import { TwistInput } from './input';
import { Board } from './render/board';
import { Stage } from './render/scene';
import { UI } from './ui';

type Phase = 'assembling' | 'playing' | 'solving' | 'done';

/** A piece's visual rotation, sprung toward its snapped target (both in quarter turns). */
interface Spin {
  value: number;
  target: number;
  vel: number;
}

const STORAGE_KEY = 'beam.level';
const SPRING = 220;
const DAMPING = 2 * Math.sqrt(SPRING) * 0.72; // a touch under-damped: a soft settle, not a bounce

const stage = new Stage(document.querySelector<HTMLCanvasElement>('#stage')!);
const ui = new UI(document.querySelector<HTMLElement>('#ui')!, LEVELS.length);
const sound = new Sound();
ui.setMuted(sound.muted);
const toggleSound = () => {
  sound.start();
  ui.setMuted(sound.toggleMuted());
};
ui.onSoundToggle(toggleSound);
window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') toggleSound();
});
window.addEventListener('pointerdown', () => sound.start());

let levelIndex = 0;
let level: Level;
let board: Board | null = null;
let phase: Phase = 'assembling';
let orientations: Orientations = {};
let spins: Record<string, Spin> = {};
let grabbed: { ids: string[]; base: Record<string, number> } | null = null;
let moving = new Set<string>();
let touched = false;

function loadProgress(): number {
  const fromUrl = Number(new URLSearchParams(location.search).get('level'));
  if (fromUrl >= 1 && fromUrl <= LEVELS.length) return fromUrl - 1;
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    return saved >= 0 && saved < LEVELS.length ? saved : 0;
  } catch {
    return 0;
  }
}

function saveProgress(index: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(index));
  } catch {
    // Private mode or blocked storage: play on without resume.
  }
}

function loadLevel(index: number, instant = false) {
  board?.dispose();
  levelIndex = index;
  level = LEVELS[index];
  orientations = initialOrientations(level);
  spins = Object.fromEntries(level.pieces.map((p) => [p.id, { value: p.o, target: p.o, vel: 0 }]));
  grabbed = null;
  moving = new Set();
  phase = 'assembling';
  sound.setLevel(index);

  board = new Board(level, index === 0 && !touched);
  stage.scene.add(board.group);
  stage.setPalette(level.palette, instant);
  ui.setAccent(level.palette.accent);
  ui.setLevel(index);
  board.playAssemble().then(() => {
    phase = 'playing';
    refreshBeam();
  });
}

/** Pieces that are being held or are still springing into place. */
function movingPieces(): Set<string> {
  const moving = new Set(grabbed?.ids ?? []);
  for (const [id, s] of Object.entries(spins)) {
    if (Math.abs(s.value - s.target) > 0.004 || Math.abs(s.vel) > 0.02) moving.add(id);
  }
  return moving;
}

function refreshBeam() {
  if (!board || phase !== 'playing') return;
  const moving = movingPieces();
  const tr = trace(level, orientations, moving);
  board.setBeam(tr);
  if (tr.escaped && moving.size === 0) solve();
}

async function solve() {
  phase = 'solving';
  const solvedBoard = board!;
  const next = levelIndex + 1;
  saveProgress(next < LEVELS.length ? next : 0);
  sound.solve();
  await solvedBoard.playSolve();
  if (solvedBoard !== board) return;
  if (next < LEVELS.length) {
    loadLevel(next);
  } else {
    phase = 'done';
    ui.showEnd(() => loadLevel(0));
  }
}

function turn(ids: string[], quarterTurns: number) {
  for (const id of ids) {
    spins[id].target = Math.round(spins[id].target) + quarterTurns;
    orientations[id] = ((spins[id].target % 4) + 4) % 4;
  }
}

new TwistInput(stage.renderer.domElement, stage.camera, {
  pickables: () => (phase === 'playing' ? board?.pickables ?? [] : []),
  center: (id) => board!.pieceCenter(id),
  enabled: () => phase === 'playing',
  onGrab(id) {
    touched = true;
    board?.hideHint();
    const ids = turnSet(level, id);
    grabbed = { ids, base: Object.fromEntries(ids.map((i) => [i, spins[i].value])) };
    refreshBeam();
  },
  onTwist(_id, q) {
    if (!grabbed) return;
    for (const i of grabbed.ids) {
      spins[i].value = spins[i].target = grabbed.base[i] + q;
      spins[i].vel = 0;
    }
  },
  onRelease(id, tapped) {
    if (!grabbed) return;
    const { ids, base } = grabbed;
    grabbed = null;
    const steps = tapped ? 1 : Math.round(spins[id].value - base[id]);
    for (const i of ids) spins[i].target = Math.round(base[i]);
    turn(ids, steps);
  },
});

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  for (const [id, s] of Object.entries(spins)) {
    if (!grabbed?.ids.includes(id)) {
      s.vel += (SPRING * (s.target - s.value) - DAMPING * s.vel) * dt;
      s.value += s.vel * dt;
      if (Math.abs(s.value - s.target) < 0.004 && Math.abs(s.vel) < 0.02) {
        s.value = s.target;
        s.vel = 0;
      }
    }
    board?.setPieceAngle(id, s.value);
  }

  // Re-trace only when the set of moving pieces changes (grab, snap, settle).
  const nowMoving = movingPieces();
  const settled = [...moving].filter((id) => !nowMoving.has(id));
  if (settled.length || nowMoving.size !== moving.size) {
    if (settled.length && phase === 'playing') {
      const id = settled[0];
      sound.note(level.pieces.findIndex((p) => p.id === id) * 2 + orientations[id]);
    }
    moving = nowMoving;
    refreshBeam();
  }

  stage.update(dt);
  board?.update(dt);
  stage.render();
  requestAnimationFrame(frame);
}

loadLevel(loadProgress(), true);
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  // Hooks for scripted checks in the browser.
  Object.assign(window, {
    __beam: {
      tap: (id: string) => {
        if (phase !== 'playing') return false;
        turn(turnSet(level, id), 1);
        return true;
      },
      state: () => ({ levelIndex, phase, orientations: { ...orientations }, audio: sound.running, muted: sound.muted }),
      load: (i: number) => loadLevel(i),
    },
  });
}
