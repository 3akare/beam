import './style.css';
import { Sound } from './audio';
import { traceLight } from './game/light';
import { CAMPAIGN, customLevel } from './game/levelSource';
import { canPlace, MIRROR_LENGTH, targetWarmth, trace } from './game/optics';
import type { Level, PieceKind, Placed, Vec } from './game/types';
import { PlayInput, type PlayModel } from './input';
import { Board } from './render/board';
import { Stage } from './render/scene';
import { UI } from './ui';

type Phase = 'loading' | 'assembling' | 'playing' | 'complete' | 'done';

const STORAGE_KEY = 'beam.level';
const HOLD_SECONDS = 0.6;

const stage = new Stage(document.querySelector<HTMLCanvasElement>('#stage')!);
const ui = new UI(document.querySelector<HTMLElement>('#ui')!);
const sound = new Sound();

const params = new URLSearchParams(location.search);


let levelIndex = 0;
let level: Level;
let loadToken = 0;
let board: Board | null = null;
let phase: Phase = 'assembling';
let placed: Placed[] = [];
let selected: string | null = null;
let invalid: string | null = null;
/** Where a piece being dragged came from (null = the tray), so a bad drop can undo. */
const origins = new Map<string, Vec | null>();
let nextId = 1;
let dirty = true;
let lit: boolean[] = [];
let solvedFor = 0;

function loadProgress(): number {
  const fromUrl = Number(params.get('level'));
  if (fromUrl >= 1 && fromUrl <= CAMPAIGN.length) return fromUrl - 1;
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(saved) && saved >= 0 && saved < CAMPAIGN.length ? saved : 0;
  } catch {
    return 0;
  }
}

function saveProgress(index: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(index));
  } catch {
    // Storage blocked: play on without resume.
  }
}

function remaining(kind: PieceKind) {
  return level.inventory[kind] - placed.filter((p) => p.kind === kind).length;
}

function refreshTray() {
  ui.setInventory({ mirror: remaining('mirror'), prism: remaining('prism') }, level.inventory);
}

/** Load a campaign level by index, or show a given (custom) level in its place. */
function loadLevel(index: number, given?: Level) {
  ++loadToken;
  levelIndex = index;
  select(null);
  showLevel(given ?? CAMPAIGN[index]);
}

function showLevel(next: Level) {
  board?.dispose();
  level = next;
  placed = [];
  origins.clear();
  selected = invalid = null;
  lit = level.targets.map(() => false);
  solvedFor = 0;
  phase = 'assembling';

  board = new Board(level);
  stage.scene.add(board.group);
  stage.lightScene.add(board.lightGroup);
  stage.fit(level.width, level.height);
  stage.setTint(level.tint);
  sound.setLevel(levelIndex);
  ui.setTitle(levelIndex, CAMPAIGN.length, level.name, level.seed ? `${level.seed} · c${level.complexity}` : undefined);
  ui.setAccent(level.tint);
  refreshTray();
  ui.setFade(false);
  board.setLight([]);
  const shown = board;
  board.playAssemble().then(() => {
    if (shown !== board) return;
    phase = 'playing';
    dirty = true;
  });
}

function select(id: string | null) {
  selected = id;
  board?.setSelected(id ? placed.find((p) => p.id === id)! : null);
}

function retrace() {
  if (!board) return;
  const r = trace(level, placed);
  board.setLight(traceLight(level, placed));
  board.setLit(targetWarmth(level, r));
  r.lit.forEach((on, i) => on && !lit[i] && phase === 'playing' && sound.chime(level.targets[i].color));
  lit = r.lit;
}

async function complete() {
  phase = 'complete';
  select(null);
  sound.solve();
  const next = levelIndex + 1;
  const finishedAll = next >= CAMPAIGN.length;
  saveProgress(finishedAll ? 0 : next);
  const finished = board!;
  await finished.playComplete();
  if (finished !== board) return;
  ui.setFade(true);
  await new Promise((r) => setTimeout(r, 750));
  if (finished !== board) return; // another level was loaded meanwhile
  if (finishedAll) {
    phase = 'done';
    ui.setFade(false);
    ui.showEnd(() => loadLevel(0));
  } else {
    loadLevel(next);
  }
}

function restart() {
  if (phase !== 'playing') return;
  placed = [];
  origins.clear();
  invalid = null;
  select(null);
  refreshTray();
  dirty = true;
}

const model: PlayModel = {
  enabled: () => phase === 'playing',
  toBoard: (x, y) => board!.toBoard(stage.toFloor(x, y)),
  overTray: (x, y) => ui.overTray(x, y),
  pieceAt(p) {
    for (let i = placed.length - 1; i >= 0; i--) {
      const q = placed[i];
      if (q.kind === 'prism') {
        if (Math.hypot(p.x - q.x, p.y - q.y) < 0.6) return q.id;
      } else {
        // Distance to the mirror's bar.
        const ux = Math.cos(q.angle);
        const uy = Math.sin(q.angle);
        const along = Math.max(-MIRROR_LENGTH / 2, Math.min(MIRROR_LENGTH / 2, (p.x - q.x) * ux + (p.y - q.y) * uy));
        if (Math.hypot(p.x - (q.x + ux * along), p.y - (q.y + uy * along)) < 0.32) return q.id;
      }
    }
    return null;
  },
  piece: (id) => placed.find((p) => p.id === id) ?? null,
  selected: () => selected,
  select,
  takeFromTray(kind, p) {
    if (remaining(kind) <= 0) return null;
    const id = `p${nextId++}`;
    placed.push({ id, kind, x: p.x, y: p.y, angle: kind === 'mirror' ? -Math.PI / 4 : 0 });
    origins.set(id, null);
    invalid = canPlace(level, placed.filter((q) => q.id !== id), p) ? null : id;
    refreshTray();
    dirty = true;
    return id;
  },
  move(id, p) {
    const piece = placed.find((q) => q.id === id)!;
    if (!origins.has(id)) origins.set(id, { x: piece.x, y: piece.y });
    piece.x = p.x;
    piece.y = p.y;
    invalid = canPlace(level, placed.filter((q) => q.id !== id), p) ? null : id;
    dirty = true;
  },
  rotate(id, angle) {
    const piece = placed.find((q) => q.id === id)!;
    const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const notch = (x: number) => Math.floor((x * 180) / Math.PI / 15);
    if (notch(a) !== notch(piece.angle)) sound.tick();
    piece.angle = a;
    dirty = true;
  },
  drop(id, overTray) {
    const origin = origins.get(id);
    origins.delete(id);
    const piece = placed.find((q) => q.id === id)!;
    if (overTray || (invalid === id && origin === null)) {
      model.returnToTray(id);
    } else if (invalid === id && origin) {
      piece.x = origin.x;
      piece.y = origin.y;
    } else {
      sound.place();
    }
    invalid = null;
    dirty = true;
  },
  dialState: (state) => board?.setDialState(state),
  returnToTray(id) {
    placed = placed.filter((q) => q.id !== id);
    if (selected === id) select(null);
    refreshTray();
    dirty = true;
  },
};

const input = new PlayInput(stage.renderer.domElement, model);
ui.onTrayPress((kind, e) => {
  sound.start();
  input.startFromTray(kind, e);
});
ui.onRestart(restart);
ui.setMuted(sound.muted);
const toggleSound = () => {
  sound.start();
  ui.setMuted(sound.toggleMuted());
};
ui.onSoundToggle(toggleSound);
// Unlock audio on any gesture browsers accept (touch only counts on release).
for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, () => sound.start(), { passive: true });
window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') toggleSound();
  if (e.key === 'r' || e.key === 'R') restart();
});

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (board && (dirty || board.animating)) stage.refreshShadows();
  if (dirty && board) {
    dirty = false;
    board.syncPieces(placed, invalid);
    if (selected) board.setSelected(placed.find((p) => p.id === selected) ?? null);
    if (phase === 'playing') retrace();
  }

  // Complete once every target has stayed lit for a moment with nothing in hand.
  const holding = origins.size > 0 || document.body.classList.contains('turning');
  if (phase === 'playing' && lit.length && lit.every(Boolean) && !holding) {
    solvedFor += dt;
    if (solvedFor >= HOLD_SECONDS) complete();
  } else {
    solvedFor = 0;
  }

  const sel = selected ? placed.find((p) => p.id === selected) : null;
  if (sel && board && phase === 'playing') {
    const at = stage.toScreen(board.toWorld({ x: sel.x, y: sel.y - 0.95 }));
    const raw = ((((-sel.angle * 180) / Math.PI) % 360) + 360) % 360;
    const degrees = raw >= 359.95 ? 0 : raw;
    ui.setReadout({ ...at, degrees });
  } else {
    ui.setReadout(null);
  }

  board?.update(dt);
  stage.render();
  requestAnimationFrame(frame);
}

// ?seed=…&complexity=… plays one specific generated puzzle; otherwise resume the run.
const customSeed = params.get('seed');
if (customSeed) {
  const c = Number(params.get('complexity') ?? 3);
  phase = 'loading';
  customLevel(customSeed, Math.max(1, Math.min(10, c))).then((l) => loadLevel(loadProgress(), l));
} else {
  loadLevel(loadProgress());
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  // Hooks for scripted checks in the browser.
  Object.assign(window, {
    __beam: {
      state: () => ({ levelIndex, phase, placed: placed.map((p) => ({ ...p })), lit: [...lit], selected, invalid, seed: level?.seed, complexity: level?.complexity }),
      /** Place the level's stored solution. */
      solve: () => {
        if (phase !== 'playing') return false;
        placed = level.solution.map((p) => ({ ...p, id: `p${nextId++}` }));
        refreshTray();
        dirty = true;
        return true;
      },
      load: (i: number) => loadLevel(i),
      board: () => board,
      /** Drive the game like a player (for the scripted demo recording). */
      model,
      place: (kind: PieceKind, x: number, y: number, angle: number) => {
        const id = model.takeFromTray(kind, { x, y });
        if (!id) return null;
        model.rotate(id, angle);
        model.drop(id, false);
        return id;
      },
      /** Render now and return the canvas as a PNG/WebM-ready element. */
      canvas: () => {
        stage.render();
        return stage.renderer.domElement;
      },
      stage,
      sound,
      screen: (p: Vec) => stage.toScreen(board!.toWorld(p)),
    },
  });
}
