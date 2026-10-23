export const easeOutCubic = (k: number) => 1 - (1 - k) ** 3;
export const easeInOutCubic = (k: number) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
export const easeOutBack = (k: number) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;
export const easeInCubic = (k: number) => k ** 3;

interface Tween {
  start: number;
  duration: number;
  update: (k: number) => void;
  done: () => void;
}

/** Tiny time-based tween runner, advanced from the render loop. */
export class Tweens {
  private time = 0;
  private list: Tween[] = [];

  /** Calls `update(0..1)` over `duration` seconds after `delay`; resolves when finished. */
  add(duration: number, update: (k: number) => void, delay = 0): Promise<void> {
    return new Promise((done) => {
      update(0);
      this.list.push({ start: this.time + delay, duration, update, done });
    });
  }

  update(dt: number) {
    this.time += dt;
    this.list = this.list.filter((t) => {
      const k = Math.min(1, Math.max(0, (this.time - t.start) / t.duration));
      if (this.time >= t.start) t.update(k);
      if (k >= 1) t.done();
      return k < 1;
    });
  }
}
