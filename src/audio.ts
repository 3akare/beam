const PENTATONIC = [0, 2, 4, 7, 9];
/** Root note (MIDI) per level, so each seed has its own key. */
const ROOTS = [62, 67, 57];
const MUTE_KEY = 'beam.muted';

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Everything is synthesized with Web Audio: a soft pad, plucked snaps and a solve arpeggio. */
export class Sound {
  private ctx?: AudioContext;
  private master?: GainNode;
  private fx?: AudioNode;
  private pad: { osc: OscillatorNode; interval: number }[] = [];
  private root = ROOTS[0];
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      // Storage blocked: default to sound on.
    }
  }

  /** Browsers only allow audio after a user gesture, so this runs on the first tap. */
  start() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') void this.ctx.resume();
      return;
    }
    // iOS: play through the silent switch like any media, rather than as a muted "ambient" sound.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
    const ctx = (this.ctx = new AudioContext());
    if (ctx.state !== 'running') void ctx.resume();
    // A gentle limiter keeps louder moments clean.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 8;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(limiter);

    // A warm echo: delay with filtered feedback.
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.34;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    delay.connect(tone).connect(feedback).connect(delay);
    tone.connect(wet).connect(this.master);
    const send = ctx.createGain();
    send.connect(delay);
    send.connect(this.master);
    this.fx = send;

    // Ambient pad: root, fifth and ninth on detuned triangles under a slowly breathing filter.
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 700;
    padFilter.Q.value = 0.6;
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoDepth.gain.value = 260;
    lfo.connect(lfoDepth).connect(padFilter.frequency);
    lfo.start();
    const padGain = ctx.createGain();
    padGain.gain.setValueAtTime(0, ctx.currentTime);
    padGain.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 3);
    padFilter.connect(padGain).connect(this.master);
    for (const [interval, detune] of [
      [-12, -6],
      [-5, 5],
      [2, -4],
      [-12, 7],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = hz(this.root + interval);
      osc.detune.value = detune;
      osc.connect(padFilter);
      osc.start();
      this.pad.push({ osc, interval });
    }
    // A soft hello, so it's obvious sound is on.
    this.note(2, 0.05, 0.18);
    this.note(4, 0.17, 0.12);
  }

  setLevel(index: number) {
    this.root = ROOTS[index % ROOTS.length];
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const { osc, interval } of this.pad) osc.frequency.setTargetAtTime(hz(this.root + interval), t, 1.2);
  }

  /** A soft pluck; `step` walks up the level's pentatonic scale. */
  note(step: number, when = 0, volume = 0.26) {
    if (!this.ctx || !this.fx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const midi = this.root + 12 + PENTATONIC[step % 5] + 12 * Math.floor(step / 5);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(volume, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    env.connect(this.fx);
    for (const [mult, level] of [
      [1, 1],
      [2, 0.25],
      [3, 0.06],
    ]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz(midi) * mult;
      g.gain.value = level;
      osc.connect(g).connect(env);
      osc.start(t);
      osc.stop(t + 1.7);
    }
  }

  solve() {
    [0, 1, 2, 3, 4, 5, 7, 9].forEach((step, i) => this.note(step, i * 0.11, 0.2));
  }

  /** A piece set down on the board. */
  place() {
    this.note(0, 0, 0.22);
  }

  /** A quiet click as a piece turns past each 15° mark. */
  tick() {
    if (!this.ctx || !this.fx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = hz(this.root + 36);
    env.gain.setValueAtTime(0.06, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(env).connect(this.fx);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  /** A target lighting up; each colour has its own step in the scale. */
  chime(color: 'white' | 'red' | 'green' | 'blue') {
    const step = { white: 7, red: 5, green: 7, blue: 9 }[color];
    this.note(step, 0, 0.24);
    this.note(step + 2, 0.08, 0.12);
  }

  toggleMuted() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // Not persisted; fine.
    }
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.08);
    return this.muted;
  }

  get running() {
    return this.ctx?.state === 'running';
  }
}

