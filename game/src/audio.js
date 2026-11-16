// Sound for LUXWARD, made in code with the Web Audio API: no audio files, no
// network, just oscillators and a little noise. A low pad drone hums under
// play; every action answers with its own sound — a pluck when a lamp is
// placed, a chime when its link snaps on, a bell when a wave clears, a dark
// sting when a boss changes phase. The context is created on the first user
// gesture, so a silent page load stays silent; M toggles mute, persisted.

let context = null;
let muted = false;
let noiseBuffer = null;
let padNodes = null;

function ensureContext() {
  if (context) {
    if (context.state === 'suspended') void context.resume();
    return context;
  }
  const AudioContext = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContext) return null;
  context = new AudioContext();
  const length = Math.floor(context.sampleRate * 0.25);
  noiseBuffer = context.createBuffer(1, length, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return context;
}

function note(from, to, seconds, volume, when = 0, type = 'sine') {
  const audio = ensureContext();
  if (!audio || muted) return;
  const start = audio.currentTime + when;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + seconds);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + seconds + 0.05);
}

function noise(seconds, volume, frequency) {
  const audio = ensureContext();
  if (!audio || muted || !noiseBuffer) return;
  const start = audio.currentTime;
  const source = audio.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
  source.connect(filter).connect(gain).connect(audio.destination);
  source.start(start);
  source.stop(start + seconds + 0.05);
}

export function createAudio() {
  return {
    unlock() {
      ensureContext();
      this.startPad();
    },
    toggleMute() {
      muted = !muted;
      if (padNodes) padNodes.gain.gain.value = muted ? 0 : 0.035;
      return muted;
    },
    isMuted() {
      return muted;
    },
    setMuted(value) {
      muted = value;
    },
    /** The low drone under play: two detuned oscillators with a slow LFO. */
    startPad() {
      const audio = ensureContext();
      if (!audio || padNodes || muted === undefined) return;
      if (padNodes) return;
      const gain = audio.createGain();
      gain.gain.value = muted ? 0 : 0.035;
      gain.connect(audio.destination);
      const lfo = audio.createOscillator();
      const lfoGain = audio.createGain();
      lfo.frequency.value = 0.07;
      lfoGain.gain.value = 0.012;
      lfo.connect(lfoGain).connect(gain.gain);
      const oscillators = [110, 164.8].map((freq) => {
        const osc = audio.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        osc.connect(gain);
        osc.start();
        return osc;
      });
      lfo.start();
      padNodes = { gain, oscillators, lfo };
    },
    /** A placement pluck, pitched by lamp kind. */
    place(kindIndex) {
      const base = 392 * Math.pow(1.059, kindIndex * 2);
      note(base, base * 1.4, 0.18, 0.14, 0, 'triangle');
    },
    linkSnap() {
      note(880, 1320, 0.16, 0.08);
    },
    /** A kill blip that rises with the streak: the pitch is the reward. */
    kill(streak) {
      const base = 520 * Math.pow(1.059, Math.min(streak, 12));
      note(base, base * 1.5, 0.12, 0.09);
    },
    leak() {
      note(160, 60, 0.35, 0.22);
      noise(0.25, 0.16, 500);
    },
    snuff() {
      note(300, 90, 0.4, 0.12, 0, 'sawtooth');
    },
    rekindle() {
      note(660, 990, 0.18, 0.1);
      note(990, 1480, 0.22, 0.08, 0.06);
    },
    upgrade() {
      note(523, 784, 0.16, 0.1, 0, 'triangle');
      note(784, 1047, 0.2, 0.1, 0.08, 'triangle');
    },
    waveClear() {
      note(523, 523, 0.14, 0.12);
      note(659, 659, 0.14, 0.12, 0.09);
      note(784, 784, 0.2, 0.12, 0.18);
      note(1047, 1047, 0.32, 0.12, 0.27);
    },
    bossSting() {
      note(110, 55, 0.8, 0.2, 0, 'sawtooth');
      note(116, 58, 0.8, 0.16, 0.05, 'sawtooth');
      noise(0.5, 0.1, 300);
    },
    win() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => note(f, f, 0.36, 0.12, i * 0.11));
    },
    lose() {
      note(392, 392, 0.28, 0.12);
      note(330, 330, 0.28, 0.12, 0.22);
      note(262, 196, 0.55, 0.12, 0.44);
    },
  };
}
