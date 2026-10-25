import type { PieceKind, Vec } from './game/types';

/** What the input layer needs from the game. Positions are in board units. */
export interface PlayModel {
  enabled(): boolean;
  toBoard(clientX: number, clientY: number): Vec;
  overTray(clientX: number, clientY: number): boolean;
  /** Piece under a board point, if any. */
  pieceAt(p: Vec): string | null;
  /** Centre and angle of a piece. */
  piece(id: string): (Vec & { angle: number }) | null;
  selected(): string | null;
  select(id: string | null): void;
  /** Start dragging a new piece out of the tray; returns its id, or null if none left. */
  takeFromTray(kind: PieceKind, p: Vec): string | null;
  move(id: string, p: Vec): void;
  rotate(id: string, angle: number): void;
  /** End of a drag: keep the piece, return it to the tray, or put it back where it was. */
  drop(id: string, overTray: boolean): void;
  returnToTray(id: string): void;
  /** How the dial should look: pointer over it, or turning with it. */
  dialState(state: 'idle' | 'hover' | 'active'): void;
}

const DIAL_INNER = 0.6;
const DIAL_OUTER = 1.2;
const deg = Math.PI / 180;
/** Pieces click into 5° steps; hold Shift for fine control. */
export const DETENT = 5 * deg;
const snap = (a: number, fine: boolean) => (fine ? a : Math.round(a / DETENT) * DETENT);

type Gesture =
  | { mode: 'move'; id: string; pointer: number; offset: Vec }
  | { mode: 'rotate'; id: string; pointer: number; grab: number };

/** Pointer, wheel and keyboard handling for placing, moving and turning pieces. */
export class PlayInput {
  private gesture: Gesture | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private m: PlayModel,
  ) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    window.addEventListener('keydown', this.key);
  }

  /** Called by the tray when a piece is pressed: the new piece follows the pointer. */
  startFromTray(kind: PieceKind, e: PointerEvent) {
    if (!this.m.enabled() || this.gesture) return;
    const id = this.m.takeFromTray(kind, this.m.toBoard(e.clientX, e.clientY));
    if (!id) return;
    this.m.select(id);
    this.gesture = { mode: 'move', id, pointer: e.pointerId, offset: { x: 0, y: 0 } };
    document.body.classList.add('dragging');
  }

  private down = (e: PointerEvent) => {
    if (!this.m.enabled() || this.gesture) return;
    const p = this.m.toBoard(e.clientX, e.clientY);
    const sel = this.m.selected();
    const selPiece = sel ? this.m.piece(sel) : null;
    const hit = this.m.pieceAt(p);

    // On the selected piece's dial ring (and not on another piece): turn it.
    if (sel && selPiece && (!hit || hit === sel)) {
      const d = Math.hypot(p.x - selPiece.x, p.y - selPiece.y);
      if (d > DIAL_INNER && d < DIAL_OUTER) {
        const grab = Math.atan2(p.y - selPiece.y, p.x - selPiece.x) - selPiece.angle;
        this.gesture = { mode: 'rotate', id: sel, pointer: e.pointerId, grab };
        this.canvas.setPointerCapture(e.pointerId);
        document.body.classList.add('turning');
        this.m.dialState('active');
        return;
      }
    }
    if (hit) {
      const piece = this.m.piece(hit)!;
      this.m.select(hit);
      this.gesture = { mode: 'move', id: hit, pointer: e.pointerId, offset: { x: piece.x - p.x, y: piece.y - p.y } };
      this.canvas.setPointerCapture(e.pointerId);
      document.body.classList.add('dragging');
      return;
    }
    this.m.select(null);
  };

  private move = (e: PointerEvent) => {
    const g = this.gesture;
    const p = this.m.toBoard(e.clientX, e.clientY);
    if (!g) {
      this.hover(p);
      return;
    }
    if (e.pointerId !== g.pointer) return;
    if (g.mode === 'move') {
      this.m.move(g.id, { x: p.x + g.offset.x, y: p.y + g.offset.y });
      document.body.classList.toggle('over-tray', this.m.overTray(e.clientX, e.clientY));
    } else {
      const c = this.m.piece(g.id)!;
      this.m.rotate(g.id, snap(Math.atan2(p.y - c.y, p.x - c.x) - g.grab, e.shiftKey));
    }
  };

  private up = (e: PointerEvent) => {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointer) return;
    this.gesture = null;
    document.body.classList.remove('dragging', 'turning', 'over-tray');
    this.m.dialState('idle');
    if (g.mode === 'move') this.m.drop(g.id, this.m.overTray(e.clientX, e.clientY));
  };

  private hover(p: Vec) {
    if (!this.m.enabled()) {
      this.canvas.style.cursor = '';
      return;
    }
    const sel = this.m.selected();
    const c = sel ? this.m.piece(sel) : null;
    const onDial = c && Math.hypot(p.x - c.x, p.y - c.y) > DIAL_INNER && Math.hypot(p.x - c.x, p.y - c.y) < DIAL_OUTER;
    const overPiece = this.m.pieceAt(p);
    this.canvas.style.cursor = overPiece ? 'grab' : onDial ? 'grab' : '';
    this.m.dialState(onDial && !overPiece ? 'hover' : 'idle');
  }

  private wheel = (e: WheelEvent) => {
    const sel = this.m.selected();
    if (!sel || !this.m.enabled()) return;
    e.preventDefault();
    const dir = Math.sign(e.deltaY || e.deltaX);
    const angle = this.m.piece(sel)!.angle;
    this.m.rotate(sel, e.shiftKey ? angle + dir * deg : snap(angle, false) + dir * DETENT);
  };

  private key = (e: KeyboardEvent) => {
    const sel = this.m.selected();
    if (!sel || !this.m.enabled() || this.gesture) return;
    const piece = this.m.piece(sel)!;
    const turn = (dir: number) => (e.shiftKey ? piece.angle + dir * 0.5 * deg : snap(piece.angle, false) + dir * DETENT);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.m.rotate(sel, turn(1));
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.m.rotate(sel, turn(-1));
    else if (e.key === 'Delete' || e.key === 'Backspace') this.m.returnToTray(sel);
    else if (e.key === 'Escape') this.m.select(null);
    else return;
    e.preventDefault();
  };
}
