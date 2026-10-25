import type { PieceKind } from './game/types';

const ICONS: Record<PieceKind, string> = {
  mirror: '<svg viewBox="0 0 40 40"><rect x="6" y="17" width="28" height="6" rx="2"/><rect x="4" y="15" width="3" height="10" rx="1"/><rect x="33" y="15" width="3" height="10" rx="1"/></svg>',
  prism: '<svg viewBox="0 0 40 40"><path d="M20 6 L34 31 L6 31 Z"/></svg>',
};

/** The DOM layer over the board: title, restart, sound, inventory tray, dial readout, end card. */
export class UI {
  private title: HTMLElement;
  private tray: HTMLElement;
  private slots = new Map<PieceKind, { el: HTMLButtonElement; count: HTMLElement }>();
  private readout: HTMLElement;
  private fade: HTMLElement;
  private end: HTMLElement;
  private sound: HTMLButtonElement;
  private restart: HTMLButtonElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <header>
        <div class="title"></div>
        <div class="actions">
          <button class="restart" title="Restart level (R)">restart ↺</button>
          <button class="sound" aria-label="Toggle sound" title="Sound (M)"></button>
        </div>
      </header>
      <div class="tray"></div>
      <div class="readout" hidden></div>
      <div class="fade"></div>
      <div class="end" hidden>
        <p>every light found</p>
        <button class="again">play again</button>
      </div>`;
    this.title = root.querySelector('.title')!;
    this.tray = root.querySelector('.tray')!;
    this.readout = root.querySelector('.readout')!;
    this.fade = root.querySelector('.fade')!;
    this.end = root.querySelector('.end')!;
    this.sound = root.querySelector('.sound')!;
    this.restart = root.querySelector('.restart')!;
    for (const kind of ['mirror', 'prism'] as PieceKind[]) {
      const el = document.createElement('button');
      el.className = 'slot';
      el.dataset.kind = kind;
      el.innerHTML = `${ICONS[kind]}<span class="name">${kind}</span><span class="count"></span>`;
      this.tray.append(el);
      this.slots.set(kind, { el, count: el.querySelector('.count')! });
    }
  }

  setTitle(index: number, name: string) {
    this.title.innerHTML = `<span class="num">level ${index + 1}</span> ${name}`;
  }

  setAccent(color: string) {
    document.documentElement.style.setProperty('--accent', color);
  }

  /** Show remaining pieces; kinds the level doesn't use are hidden. */
  setInventory(left: Record<PieceKind, number>, total: Record<PieceKind, number>) {
    for (const [kind, slot] of this.slots) {
      slot.el.hidden = total[kind] === 0;
      slot.count.textContent = `×${left[kind]}`;
      slot.el.classList.toggle('empty', left[kind] === 0);
    }
  }

  onTrayPress(cb: (kind: PieceKind, e: PointerEvent) => void) {
    for (const [kind, slot] of this.slots) {
      slot.el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        cb(kind, e);
      });
    }
  }

  /** Is a screen point over the tray (where pieces are dropped to return them)? */
  overTray(x: number, y: number) {
    const r = this.tray.getBoundingClientRect();
    return x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12;
  }

  /** Degree readout beside the dial; pass null to hide. */
  setReadout(at: { x: number; y: number; degrees: number } | null) {
    this.readout.hidden = !at;
    if (!at) return;
    this.readout.textContent = `${at.degrees.toFixed(1)}°`;
    this.readout.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -100%)`;
  }

  /** Fade the stage to black (1) or back in (0). */
  setFade(on: boolean) {
    this.fade.classList.toggle('on', on);
  }

  onRestart(cb: () => void) {
    this.restart.onclick = cb;
  }

  onSoundToggle(cb: () => void) {
    this.sound.onclick = cb;
  }

  setMuted(muted: boolean) {
    this.sound.setAttribute('aria-pressed', String(!muted));
    this.sound.innerHTML = muted
      ? '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  }

  showEnd(onAgain: () => void) {
    this.end.hidden = false;
    requestAnimationFrame(() => this.end.classList.add('shown'));
    this.end.querySelector<HTMLButtonElement>('.again')!.onclick = () => {
      this.end.classList.remove('shown');
      this.end.hidden = true;
      onAgain();
    };
  }
}
