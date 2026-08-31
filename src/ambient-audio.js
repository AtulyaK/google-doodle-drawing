const AMBIENT_NOTES = [146.83, 174.61, 220, 277.18, 293.66, 220, 174.61, 110];
const AMBIENT_STEP_MS = 2200;
const AMBIENT_NOTE_DURATION_S = 2.9;
const DRONE_FREQUENCIES = [73.42, 110];

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
  let droneNodes = [];
  let ambientTimer = null;
  let noteIndex = 0;
  let enabled = false;

  function createDrone() {
    if (!context || !master) {
      return;
    }

    droneNodes = DRONE_FREQUENCIES.map((frequency, index) => {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      filter.type = "lowpass";
      filter.frequency.value = index === 0 ? 420 : 720;
      gain.gain.value = index === 0 ? 0.018 : 0.008;
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      oscillator.start();
      return { oscillator, filter, gain };
    });
  }

  function scheduleAmbientNote() {
    if (!enabled || !context || !master) {
      return;
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const harmonic = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const harmonicGain = context.createGain();
    oscillator.type = "triangle";
    harmonic.type = "sine";
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, now);
    const frequency = AMBIENT_NOTES[noteIndex % AMBIENT_NOTES.length];
    oscillator.frequency.setValueAtTime(frequency, now);
    harmonic.frequency.setValueAtTime(frequency * 2, now);
    noteIndex += 1;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.024, now + 0.08);
    gain.gain.linearRampToValueAtTime(0.0001, now + AMBIENT_NOTE_DURATION_S);
    harmonicGain.gain.setValueAtTime(0.0001, now);
    harmonicGain.gain.linearRampToValueAtTime(0.007, now + 0.04);
    harmonicGain.gain.linearRampToValueAtTime(0.0001, now + 1.4);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(master);
    oscillator.onended = () => {
      disconnect(oscillator);
      disconnect(harmonic);
      disconnect(filter);
      disconnect(gain);
      disconnect(harmonicGain);
    };
    oscillator.start(now);
    harmonic.start(now);
    oscillator.stop(now + AMBIENT_NOTE_DURATION_S);
    harmonic.stop(now + AMBIENT_NOTE_DURATION_S);
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
      createDrone();
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
    droneNodes.forEach(({ oscillator, filter, gain }) => {
      oscillator.stop();
      disconnect(oscillator);
      disconnect(filter);
      disconnect(gain);
    });
    droneNodes = [];
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
    [293.66, 349.23, 440].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      oscillator.type = "triangle";
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2200, now + index * 0.12);
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.12);
      gain.gain.setValueAtTime(0.0001, now + index * 0.12);
      gain.gain.linearRampToValueAtTime(0.045, now + index * 0.12 + 0.04);
      gain.gain.linearRampToValueAtTime(0.0001, now + index * 0.12 + 1.2);
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      oscillator.onended = () => {
        disconnect(oscillator);
        disconnect(filter);
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
