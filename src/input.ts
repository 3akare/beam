import * as THREE from 'three';

export interface TwistHandlers {
  /** Which meshes can be grabbed (tagged with `userData.pieceId`). */
  pickables(): THREE.Object3D[];
  /** Screen-space centre of a piece, used to measure the twist angle. */
  center(id: string): THREE.Vector3;
  enabled(): boolean;
  onGrab(id: string): void;
  /** Total twist since grab, in quarter turns (counter-clockwise from above is positive). */
  onTwist(id: string, quarterTurns: number): void;
  onRelease(id: string, tapped: boolean): void;
}

const TAP_PIXELS = 6;
const TAP_MS = 300;

/**
 * Turns pointer gestures into twists. Dragging circles the pointer around
 * the piece like turning a knob; a quick tap turns it a quarter.
 */
export class TwistInput {
  private raycaster = new THREE.Raycaster();
  private grab: {
    id: string;
    pointer: number;
    startX: number;
    startY: number;
    startTime: number;
    lastAngle: number | null;
    total: number;
    moved: boolean;
  } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: THREE.Camera,
    private h: TwistHandlers,
  ) {
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    canvas.style.touchAction = 'none';
  }

  private pick(e: PointerEvent): string | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.h.pickables(), false)[0];
    return hit ? (hit.object.userData.pieceId as string) : null;
  }

  /** Pointer angle around the piece's centre on screen, or null when too close to measure. */
  private angle(id: string, e: PointerEvent): number | null {
    const r = this.canvas.getBoundingClientRect();
    const c = this.h.center(id).project(this.camera);
    const cx = r.left + ((c.x + 1) / 2) * r.width;
    const cy = r.top + ((1 - c.y) / 2) * r.height;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    return Math.hypot(dx, dy) < 14 ? null : Math.atan2(dy, dx);
  }

  private down = (e: PointerEvent) => {
    if (this.grab || !this.h.enabled()) return;
    const id = this.pick(e);
    if (!id) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.grab = {
      id,
      pointer: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      lastAngle: this.angle(id, e),
      total: 0,
      moved: false,
    };
    this.h.onGrab(id);
  };

  private move = (e: PointerEvent) => {
    const g = this.grab;
    if (!g) {
      this.canvas.style.cursor = this.h.enabled() && this.pick(e) ? 'grab' : '';
      return;
    }
    if (e.pointerId !== g.pointer) return;
    if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > TAP_PIXELS) g.moved = true;
    const a = this.angle(g.id, e);
    if (a !== null && g.lastAngle !== null) {
      let d = a - g.lastAngle;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      // Screen angles grow clockwise; seen from above-front that is a clockwise twist.
      g.total -= d / (Math.PI / 2);
    }
    g.lastAngle = a ?? g.lastAngle;
    if (g.moved) {
      this.canvas.style.cursor = 'grabbing';
      this.h.onTwist(g.id, g.total);
    }
  };

  private up = (e: PointerEvent) => {
    const g = this.grab;
    if (!g || e.pointerId !== g.pointer) return;
    this.grab = null;
    this.canvas.style.cursor = '';
    const tapped = !g.moved && performance.now() - g.startTime < TAP_MS;
    this.h.onRelease(g.id, tapped);
  };
}
