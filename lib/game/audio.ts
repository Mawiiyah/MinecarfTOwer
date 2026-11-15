/**
 * All sound effects are synthesised with the Web Audio API — no audio files.
 * A compressor on the master bus keeps 20 simultaneous explosions from clipping.
 */
export class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmMaster: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.7;
  private recent: Record<string, number[]> = {};

  // Background Music (BGM) state
  private bgmVolume = 0.35;
  private bgmEnabled = true;
  private bgmTrack: "cyber_hype" | "arcade_rush" | "custom" = "cyber_hype";
  private customBgmUrl = "";
  private bgmAudioEl: HTMLAudioElement | null = null;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private nextStepTime = 0;
  private isUrgentBgm = false;

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
      master.connect(comp);

      const bgmMaster = ctx.createGain();
      bgmMaster.gain.value = this.bgmEnabled ? this.bgmVolume : 0;
      bgmMaster.connect(comp);

      comp.connect(ctx.destination);

      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      this.ctx = ctx;
      this.master = master;
      this.bgmMaster = bgmMaster;
      this.noise = buf;

      this.startBgmLoop();
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Call from a user gesture so browsers allow playback (OBS allows autoplay anyway). */
  unlock() {
    this.ensure();
    if (this.bgmTrack === "custom" && this.bgmAudioEl && this.bgmEnabled) {
      this.bgmAudioEl.play().catch(() => {});
    }
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  setBgm(
    enabled: boolean,
    volume: number,
    track: "cyber_hype" | "arcade_rush" | "custom",
    customUrl?: string,
  ) {
    this.bgmEnabled = enabled;
    this.bgmVolume = Math.max(0, Math.min(1, volume));
    this.bgmTrack = track;
    this.customBgmUrl = customUrl || "";

    const ctx = this.ensure();
    if (ctx && this.bgmMaster) {
      const targetGain = enabled && track !== "custom" ? this.bgmVolume : 0;
      this.bgmMaster.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.05);
    }

    if (track === "custom" && this.customBgmUrl) {
      if (!this.bgmAudioEl && typeof Audio !== "undefined") {
        this.bgmAudioEl = new Audio();
        this.bgmAudioEl.loop = true;
      }
      if (this.bgmAudioEl) {
        if (this.bgmAudioEl.src !== this.customBgmUrl) {
          this.bgmAudioEl.src = this.customBgmUrl;
        }
        this.bgmAudioEl.volume = this.bgmVolume;
        if (this.bgmEnabled) {
          this.bgmAudioEl.play().catch(() => {});
        } else {
          this.bgmAudioEl.pause();
        }
      }
    } else if (this.bgmAudioEl) {
      this.bgmAudioEl.pause();
    }
  }

  setUrgentBgm(urgent: boolean) {
    this.isUrgentBgm = urgent;
  }

  private startBgmLoop() {
    if (this.bgmTimer != null || typeof window === "undefined") return;
    this.nextStepTime = this.ctx ? this.ctx.currentTime + 0.05 : 0;
    this.bgmTimer = window.setInterval(() => this.bgmScheduler(), 25);
  }

  private bgmScheduler() {
    if (!this.ctx || !this.bgmMaster) return;
    if (!this.bgmEnabled || this.bgmVolume <= 0 || this.bgmTrack === "custom") return;

    // Tempo: 132 BPM in normal play, 148 BPM when timer is in the urgent hold phase
    const bpm = this.isUrgentBgm ? 148 : 132;
    const stepDuration = 60 / bpm / 4; // 16th note

    const scheduleAheadTime = 0.12;
    while (this.nextStepTime < this.ctx.currentTime + scheduleAheadTime) {
      this.scheduleBgmStep(this.bgmStep, this.nextStepTime);
      this.nextStepTime += stepDuration;
      this.bgmStep = (this.bgmStep + 1) % 32;
    }
  }

  private scheduleBgmStep(step: number, t: number) {
    if (!this.ctx || !this.bgmMaster || !this.noise) return;

    const urgent = this.isUrgentBgm;
    const isArcade = this.bgmTrack === "arcade_rush";

    // 1. Kick Drum (Four-on-the-floor beat)
    if (step % 4 === 0) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(urgent ? 160 : 140, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.08);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(g).connect(this.bgmMaster);
      o.start(t);
      o.stop(t + 0.13);
    }

    // 2. Snare / Clap on beats 4, 12, 20, 28
    if (step % 8 === 4) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "bandpass";
      hp.frequency.setValueAtTime(1200, t);
      hp.Q.value = 1.5;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.32, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(hp).connect(g).connect(this.bgmMaster);
      src.start(t);
      src.stop(t + 0.13);

      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.05);
      const og = this.ctx.createGain();
      og.gain.setValueAtTime(0.2, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      o.connect(og).connect(this.bgmMaster);
      o.start(t);
      o.stop(t + 0.07);
    }

    // 3. Hi-Hats
    // Off-beat hats normally; 16th rolls when urgent
    if (step % 2 === 1 || urgent) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 6500;
      const g = this.ctx.createGain();
      const isOpen = step % 4 === 2;
      g.gain.setValueAtTime(isOpen ? 0.18 : 0.10, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (isOpen ? 0.09 : 0.035));
      src.connect(hp).connect(g).connect(this.bgmMaster);
      src.start(t);
      src.stop(t + 0.1);
    }

    // 4. Bassline: 4-bar driving electronic progression (Am, F, C, G)
    const BASS_FREQS = [
      // Bar 1: A1 (55Hz)
      55, 55, 110, 55, 55, 110, 55, 55,
      // Bar 2: F1 (43.65Hz)
      43.65, 43.65, 87.3, 43.65, 43.65, 87.3, 43.65, 49,
      // Bar 3: C2 (65.4Hz)
      65.4, 65.4, 130.8, 65.4, 65.4, 130.8, 65.4, 65.4,
      // Bar 4: G1 (49Hz)
      49, 49, 98, 49, 41.2, 41.2, 82.4, 49,
    ];
    const bFreq = BASS_FREQS[step];
    if (bFreq) {
      const o = this.ctx.createOscillator();
      o.type = isArcade ? "triangle" : "sawtooth";
      o.frequency.value = bFreq;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(urgent ? 1400 : 700, t);
      lp.frequency.exponentialRampToValueAtTime(urgent ? 260 : 160, t + 0.09);
      lp.Q.value = 4;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.28, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(lp).connect(g).connect(this.bgmMaster);
      o.start(t);
      o.stop(t + 0.11);
    }

    // 5. Melody / Synth Lead Hook
    const CYBER_LEAD = [
      659.25, 0, 880, 0, 783.99, 659.25, 0, 523.25,
      587.33, 0, 698.46, 0, 659.25, 587.33, 0, 440,
      523.25, 0, 659.25, 0, 783.99, 880, 0, 783.99,
      659.25, 0, 587.33, 0, 523.25, 587.33, 659.25, 783.99,
    ];
    const ARCADE_LEAD = [
      440, 523.25, 659.25, 880, 783.99, 659.25, 523.25, 659.25,
      349.23, 440, 523.25, 698.46, 659.25, 523.25, 440, 523.25,
      261.63, 329.63, 392, 523.25, 587.33, 659.25, 783.99, 659.25,
      392, 493.88, 587.33, 783.99, 880, 783.99, 659.25, 587.33,
    ];
    const leadPattern = isArcade ? ARCADE_LEAD : CYBER_LEAD;
    const lFreq = leadPattern[step];

    if (lFreq && lFreq > 0) {
      const o = this.ctx.createOscillator();
      o.type = isArcade ? "square" : "sawtooth";
      o.frequency.value = lFreq;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(urgent ? 3800 : 2200, t);
      lp.frequency.exponentialRampToValueAtTime(urgent ? 1200 : 600, t + (isArcade ? 0.08 : 0.16));
      lp.Q.value = 2;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (isArcade ? 0.09 : 0.18));
      o.connect(lp).connect(g).connect(this.bgmMaster);
      o.start(t);
      o.stop(t + (isArcade ? 0.1 : 0.19));
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

  /** Clock tick for the final countdown; `urgency` 0..1 raises the pitch. */
  tick(urgency = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(660 + urgency * 440, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.13);
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
