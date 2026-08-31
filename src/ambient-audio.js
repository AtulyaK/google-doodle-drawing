const AMBIENT_NOTES = [146.83, 174.61, 220, 261.63, 196, 220];
const AMBIENT_STEP_MS = 5200;

function disconnect(node) {
  node?.disconnect?.();
}

export function createAmbientAudio({
  AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
} = {}) {
  let context = null;
  let master = null;
  let waterSource = null;
  let ambientTimer = null;
  let noteIndex = 0;
  let enabled = false;

  function createWaterTexture() {
    if (!context?.createBuffer) {
      return;
    }

    const sampleRate = context.sampleRate;
    const buffer = context.createBuffer(1, sampleRate * 2, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * 0.35;
    }

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    const gain = context.createGain();
    gain.gain.value = 0.012;
    waterSource = context.createBufferSource();
    waterSource.buffer = buffer;
    waterSource.loop = true;
    waterSource.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    waterSource.start();
  }

  function scheduleAmbientNote() {
    if (!enabled || !context || !master) {
      return;
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(
      AMBIENT_NOTES[noteIndex % AMBIENT_NOTES.length],
      now,
    );
    noteIndex += 1;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.018, now + 1.2);
    gain.gain.linearRampToValueAtTime(0.0001, now + 5.8);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.onended = () => {
      disconnect(oscillator);
      disconnect(gain);
    };
    oscillator.start(now);
    oscillator.stop(now + 6);
    ambientTimer = setTimeoutFn(() => {
      ambientTimer = null;
      scheduleAmbientNote();
    }, AMBIENT_STEP_MS);
  }

  function start() {
    if (enabled) {
      return true;
    }
    if (!AudioContextClass) {
      return false;
    }

    if (!context) {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = 0.7;
      master.connect(context.destination);
      createWaterTexture();
    }

    enabled = true;
    const resumeResult = context.resume?.();
    if (resumeResult?.catch) {
      resumeResult.catch(() => {
        enabled = false;
      });
    }
    scheduleAmbientNote();
    return true;
  }

  function stop() {
    enabled = false;
    if (ambientTimer !== null) {
      clearTimeoutFn(ambientTimer);
      ambientTimer = null;
    }
    if (waterSource) {
      waterSource.stop();
      disconnect(waterSource);
      waterSource = null;
    }
    if (context) {
      void context.close?.();
      context = null;
      master = null;
    }
  }

  function playSigilComplete() {
    if (!enabled || !context || !master) {
      return;
    }

    const now = context.currentTime;
    [293.66, 369.99, 440].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.12);
      gain.gain.setValueAtTime(0.0001, now + index * 0.12);
      gain.gain.linearRampToValueAtTime(0.045, now + index * 0.12 + 0.04);
      gain.gain.linearRampToValueAtTime(0.0001, now + index * 0.12 + 1.2);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.onended = () => {
        disconnect(oscillator);
        disconnect(gain);
      };
      oscillator.start(now + index * 0.12);
      oscillator.stop(now + index * 0.12 + 1.25);
    });
  }

  return {
    get enabled() {
      return enabled;
    },
    get available() {
      return Boolean(AudioContextClass);
    },
    start,
    stop,
    toggle() {
      if (enabled) {
        stop();
        return false;
      }
      return start();
    },
    playSigilComplete,
  };
}
