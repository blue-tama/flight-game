// Sound, all synthesised with WebAudio — no audio files. An engine hum that
// follows the throttle, wind that grows with speed, a chime for a ring, a
// warning beep when the fuel runs low, and a thud for a hard arrival. The
// audio context is created on the first user gesture; every call is safe to
// make before that, and safe when sound is off.

export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;

  /** Build the context and the always-on engine and wind voices. */
  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(context.destination);
      engineOsc.start();

      const length = context.sampleRate * 2;
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      windSource = context.createBufferSource();
      windSource.buffer = buffer;
      windSource.loop = true;
      windFilter = context.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windGain = context.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(context.destination);
      windSource.start();
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  /** One short note: a sine voice with a quick attack and a fade. */
  function blip(frequency, duration, volume, when) {
    if (context === null || muted) return;
    try {
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      const gain = context.createGain();
      const start = context.currentTime + (when || 0);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    } catch {
      // A note that fails to play is never worth stopping the game for.
    }
  }

  return {
    /** Call from any user gesture: starts the engine and wind voices. */
    unlock() {
      if (!ensure()) return;
      if (context.state === 'suspended') context.resume().catch(() => {});
    },
    /** Engine and wind follow throttle and speed every frame. */
    update(throttle, speed) {
      if (context === null || muted) return;
      const t = context.currentTime;
      engineOsc.frequency.setTargetAtTime(48 + throttle * 62 + speed * 0.25, t, 0.08);
      engineGain.gain.setTargetAtTime(0.015 + throttle * 0.05, t, 0.1);
      windFilter.frequency.setTargetAtTime(400 + speed * 9, t, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.09, speed * 0.0011), t, 0.15);
    },
    ring() {
      blip(880, 0.35, 0.16, 0);
      blip(1318, 0.45, 0.12, 0.09);
    },
    warning() {
      blip(440, 0.18, 0.12, 0);
      blip(440, 0.18, 0.12, 0.25);
    },
    thud() {
      blip(90, 0.4, 0.25, 0);
    },
    land() {
      blip(523, 0.3, 0.14, 0);
      blip(659, 0.3, 0.14, 0.12);
      blip(784, 0.5, 0.14, 0.24);
    },
    /** A short click for menu picks. */
    click() {
      blip(1200, 0.08, 0.08, 0);
    },
    toggleMute() {
      muted = !muted;
      if (context !== null) {
        engineGain.gain.value = 0;
        windGain.gain.value = 0;
      }
      return muted;
    },
  };
}
