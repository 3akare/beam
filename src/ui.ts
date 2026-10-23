/** The thin DOM layer over the scene: wordmark, level dots, sound toggle, end card. */
export class UI {
  private dots: HTMLElement[] = [];
  private end: HTMLElement;
  private sound: HTMLButtonElement;

  constructor(root: HTMLElement, levelCount: number) {
    root.innerHTML = `
      <div class="wordmark">beam</div>
      <div class="dots"></div>
      <button class="sound" aria-label="Toggle sound" title="Sound (M)"></button>
      <div class="end" hidden>
        <p>the light is free</p>
        <button class="again">play again</button>
      </div>`;
    const dots = root.querySelector('.dots')!;
    for (let i = 0; i < levelCount; i++) {
      const d = document.createElement('span');
      dots.append(d);
      this.dots.push(d);
    }
    this.end = root.querySelector('.end')!;
    this.sound = root.querySelector('.sound')!;
    this.setMuted(false);
  }

  setLevel(index: number) {
    this.dots.forEach((d, i) => {
      d.classList.toggle('done', i < index);
      d.classList.toggle('current', i === index);
    });
  }

  setAccent(color: string) {
    document.documentElement.style.setProperty('--accent', color);
  }

  showEnd(onAgain: () => void) {
    this.setLevel(this.dots.length);
    this.end.hidden = false;
    requestAnimationFrame(() => this.end.classList.add('shown'));
    this.end.querySelector<HTMLButtonElement>('.again')!.onclick = () => {
      this.end.classList.remove('shown');
      this.end.hidden = true;
      onAgain();
    };
  }

  onSoundToggle(cb: () => void) {
    this.sound.onclick = cb;
  }

  setMuted(muted: boolean) {
    this.sound.classList.toggle('muted', muted);
    this.sound.setAttribute('aria-pressed', String(!muted));
    this.sound.innerHTML = muted
      ? '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  }
}
