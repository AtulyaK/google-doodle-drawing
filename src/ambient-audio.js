// Ambience plays a bundled CC0 recording ("The Old Tower Inn" by RandomMind,
// OpenGameArt) through a media element. The short completion cue is generated and
// stays secondary: it never plays unless ambience is already enabled.
const DEFAULT_TRACK_URL = new URL("../assets/audio/the-old-tower-inn.mp3", import.meta.url).href;
const DEFAULT_VOLUME = 0.32;
const COMPLETION_NOTES = [293.66, 349.23, 440];

function defaultCreateMediaElement() {
  if (typeof globalThis.Audio !== "function") {
    return null;
  }
  return new globalThis.Audio();
}

function disconnect(node) {
  node?.disconnect?.();
}

export function createAmbientAudio({
  trackUrl = DEFAULT_TRACK_URL,
  volume = DEFAULT_VOLUME,
  createMediaElement = defaultCreateMediaElement,
  AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext,
  onChange = () => {},
} = {}) {
  const media = createMediaElement();
  let cueContext = null;
  let enabled = false;
  let failed = false;
  let trackAttached = false;

  function fail() {
    const wasUsable = !failed;
    failed = true;
    enabled = false;
    media?.pause?.();
    if (wasUsable) {
      onChange();
    }
  }

  if (media && typeof media.addEventListener === "function") {
    media.addEventListener("error", fail);
  }

  // The track is only attached on the first explicit start, so nothing is
  // downloaded before the player opts in.
  function attachTrack() {
    if (trackAttached) {
      return;
    }
    media.loop = true;
    media.preload = "auto";
    media.src = trackUrl;
    trackAttached = true;
  }

  function start() {
    if (!media || failed) {
      return false;
    }
    if (enabled) {
      return true;
    }
    if (typeof media.play !== "function") {
      fail();
      return false;
    }

    attachTrack();
    media.volume = volume;
    enabled = true;
    const playback = media.play();
    if (playback?.catch) {
      playback.catch(fail);
    }
    return true;
  }

  function stop() {
    enabled = false;
    if (media) {
      media.pause?.();
      try {
        media.currentTime = 0;
      } catch {
        // Seeking can be rejected before metadata loads; muting is enough.
      }
    }
    if (cueContext) {
      void cueContext.close?.();
      cueContext = null;
    }
  }

  function cueTarget() {
    if (cueContext) {
      return cueContext;
    }
    if (!AudioContextClass) {
      return null;
    }
    try {
      cueContext = new AudioContextClass();
    } catch {
      return null;
    }
    cueContext.resume?.()?.catch?.(() => {});
    return cueContext;
  }

  function playSigilComplete() {
    if (!enabled) {
      return;
    }
    const context = cueTarget();
    if (!context) {
      return;
    }

    const master = context.destination;
    const now = context.currentTime;
    COMPLETION_NOTES.forEach((frequency, index) => {
      const offset = now + index * 0.12;
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      oscillator.type = "triangle";
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2200, offset);
      oscillator.frequency.setValueAtTime(frequency, offset);
      gain.gain.setValueAtTime(0.0001, offset);
      gain.gain.linearRampToValueAtTime(0.05, offset + 0.04);
      gain.gain.linearRampToValueAtTime(0.0001, offset + 1.2);
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      oscillator.onended = () => {
        disconnect(oscillator);
        disconnect(filter);
        disconnect(gain);
      };
      oscillator.start(offset);
      oscillator.stop(offset + 1.25);
    });
  }

  return {
    get enabled() {
      return enabled;
    },
    get available() {
      return Boolean(media) && !failed;
    },
    get trackUrl() {
      return trackUrl;
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
