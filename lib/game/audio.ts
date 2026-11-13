/**
 * All sound effects are synthesised with the Web Audio API — no audio files.
 * A compressor on the master bus keeps 20 simultaneous explosions from clipping.
 */
export class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.7;
  private recent: Record<string, number[]> = {};

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 12;
      comp.ratio.value = 8;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      const master = ctx.createGain();
      master.gain.value = this.volume;
      master.connect(comp).connect(ctx.destination);

      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      this.ctx = ctx;
      this.master = master;
      this.noise = buf;
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Call from a user gesture so browsers allow playback (OBS allows autoplay anyway). */
  unlock() {
    this.ensure();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  /** Rate limiter so a 20-TNT chain doesn't stack 20 identical sounds in the same instant. */
  private allow(kind: string, max: number, windowMs: number): boolean {
    if (this.volume <= 0) return false;
    const now = performance.now();
    const arr = (this.recent[kind] ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      this.recent[kind] = arr;
      return false;
    }
    arr.push(now);
    this.recent[kind] = arr;
    return true;
  }

  explosion(intensity = 1) {
    if (!this.allow("boom", 4, 140)) return;
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;

    // Noise burst through a closing low-pass = the "boom" body
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.7 + Math.random() * 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3800, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * intensity, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.4);
    src.stop(t + 1.5);

    // Sub thump
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    const og = ctx.createGain();
    og.gain.setValueAtTime(1.0 * intensity, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.65);

    // High crackle
    const cr = ctx.createBufferSource();
    cr.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2500;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.35 * intensity, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    cr.connect(hp).connect(cg).connect(this.master);
    cr.start(t, Math.random());
    cr.stop(t + 0.3);
  }

  fuse() {
    if (!this.allow("fuse", 3, 160)) return;
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.55);
  }

  place() {
    if (!this.allow("place", 2, 80)) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(200 + Math.random() * 80, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.1);
  }

  like() {
    if (!this.allow("like", 4, 200)) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.2);
  }

  fanfare() {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.volume <= 0) return;
    const t0 = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, t0 + i * 0.12, 0.11, 0.12));
    // Final chord
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => this.tone(f, t0 + 0.5, 0.8, 0.07));
  }

  private tone(freq: number, start: number, dur: number, gain: number) {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    o.type = "square";
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(this.master);
    o.start(start);
    o.stop(start + dur + 0.02);
  }
}
