/**
 * MINIMAL AUDIO — Procedural mining, water, and rumble sounds
 * ~80 lines. Zero external dependencies. All Web Audio API.
 */

export class MinimalAudio {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.4;
    this.masterGain.connect(this.ctx.destination);

    this.sounds = {
      mine: this._createMineSound(),
      water: this._createWaterSound(),
      rumble: this._createRumbleSound()
    };
  }

  _createMineSound() {
    return (params = {}) => {
      const t = this.ctx.currentTime;
      const dur = params.duration || 0.15;
      const vol = params.volume || 0.5;

      const bufSize = Math.ceil(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.15));
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buf;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1500 + Math.random() * 1000;
      filter.Q.value = 1.5;

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(vol, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + dur);

      src.connect(filter);
      filter.connect(env);
      env.connect(this.masterGain);
      src.start(t);
      src.stop(t + dur);
    };
  }

  _createWaterSound() {
    return (params = {}) => {
      const t = this.ctx.currentTime;
      const dur = params.duration || 2.0;
      const vol = params.volume || 0.2;

      const bufSize = Math.ceil(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufSize; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        data[i] = (b0 + b1 + b2 + w * 0.00761) / 4;
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buf;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(vol, t + 0.3);
      env.gain.linearRampToValueAtTime(0, t + dur);

      src.connect(filter);
      filter.connect(env);
      env.connect(this.masterGain);
      src.start(t);
      src.stop(t + dur);
    };
  }

  _createRumbleSound() {
    return (params = {}) => {
      const t = this.ctx.currentTime;
      const dur = params.duration || 1.0;
      const vol = params.volume || 0.6;

      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';

      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 4;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 15;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      osc.frequency.setValueAtTime(60, t);
      osc.frequency.exponentialRampToValueAtTime(25, t + dur);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 180;

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(vol, t + 0.15);
      env.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc.connect(filter);
      filter.connect(env);
      env.connect(this.masterGain);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + dur);
      lfo.stop(t + dur);
    };
  }

  play(soundName, params = {}) {
    if (this.sounds[soundName]) {
      this.sounds[soundName](params);
    }
  }

  resume() {
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
}
