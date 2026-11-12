/**
 * Tiny SFX helper. The AudioContext is created on the first user gesture
 * (browsers block audio before one), and ogg decode failures fall back to a
 * synthesized two-note "tink" so Safari still gets a coin sound.
 */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
  }

  /** Safe to call repeatedly; also resumes a suspended context. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.load('coin', 'sounds/coin.ogg');
  }

  async load(name, url) {
    try {
      const res = await fetch(url);
      const data = await res.arrayBuffer();
      this.buffers.set(name, await this.ctx.decodeAudioData(data));
    } catch {
      // No buffer stored: play() falls back to the synth tink.
    }
  }

  play(name, volume = 0.5) {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    const buf = this.buffers.get(name);
    if (!buf) {
      this.tink(volume);
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }

  /** Springy jump: pitch drop with a fast wobble, like a cartoon spring. */
  boing(volume = 0.3) {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(620, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.3);
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 26; // wobble rate
    lfoGain.gain.value = 45; // wobble depth in Hz
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.4);
    lfo.stop(t + 0.4);
  }

  /** Crouch squish: a short noise burst squeezed through a falling,
   *  resonant low-pass filter. */
  squish(volume = 0.35) {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    const t = this.ctx.currentTime;
    if (!this.noise) {
      const len = Math.floor(this.ctx.sampleRate * 0.25);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 7;
    filter.frequency.setValueAtTime(950, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.16);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start(t);
    src.stop(t + 0.2);
  }

  /** Super jump: a bigger, deeper spring with a sub-octave layer. */
  superBoing(volume = 0.35) {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    gain.connect(this.ctx.destination);
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 20;
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain);
    for (const mult of [1, 0.5]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(700 * mult, t);
      osc.frequency.exponentialRampToValueAtTime(90 * mult, t + 0.55);
      lfoGain.connect(osc.frequency);
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.7);
    }
    lfo.start(t);
    lfo.stop(t + 0.7);
  }

  /** Obstacle smash: noise blast through a falling filter over a low boom. */
  explosion(volume = 0.5) {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    const t = this.ctx.currentTime;
    if (!this.noise) {
      const len = Math.floor(this.ctx.sampleRate * 0.25);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, t);
    filter.frequency.exponentialRampToValueAtTime(90, t + 0.4);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(volume, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    src.connect(filter).connect(nGain).connect(this.ctx.destination);
    src.start(t);
    src.stop(t + 0.5);

    const boom = this.ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(150, t);
    boom.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    const bGain = this.ctx.createGain();
    bGain.gain.setValueAtTime(volume * 0.9, t);
    bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    boom.connect(bGain).connect(this.ctx.destination);
    boom.start(t);
    boom.stop(t + 0.45);
  }

  /** Power-up pickup: quick rising three-note arpeggio. */
  powerup(volume = 0.3) {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 880].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      const start = t + i * 0.07;
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  }

  /** Classic coin blip: B5 hopping to E6 with a fast decay. */
  tink(volume = 0.25) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(987.77, t);
    osc.frequency.setValueAtTime(1318.51, t + 0.08);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }
}
