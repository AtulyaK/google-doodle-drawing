export const CAPTURE_PHASE = Object.freeze({
  READY: "ready",
  DRAWING: "drawing",
  PAUSED: "paused",
});

function isFinitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function createCaptureState(strokeCount) {
  return {
    phase: CAPTURE_PHASE.READY,
    activeStroke: [],
    completedStrokes: [],
    strokeCount: Math.max(1, strokeCount),
    lastFinishReason: null,
  };
}

export function reduceCapture(state, action) {
  switch (action.type) {
    case "start":
      if (
        state.phase !== CAPTURE_PHASE.READY ||
        state.completedStrokes.length >= state.strokeCount
      ) {
        return state;
      }
      return {
        ...state,
        phase: CAPTURE_PHASE.DRAWING,
        activeStroke: [],
        lastFinishReason: null,
      };

    case "append":
      if (state.phase !== CAPTURE_PHASE.DRAWING || !isFinitePoint(action.point)) {
        return state;
      }
      return {
        ...state,
        activeStroke: [...state.activeStroke, { ...action.point }],
      };

    case "pause":
      if (state.phase !== CAPTURE_PHASE.DRAWING) {
        return state;
      }
      return { ...state, phase: CAPTURE_PHASE.PAUSED };

    case "resume":
      if (state.phase !== CAPTURE_PHASE.PAUSED) {
        return state;
      }
      return { ...state, phase: CAPTURE_PHASE.DRAWING };

    case "finish":
      if (
        ![CAPTURE_PHASE.DRAWING, CAPTURE_PHASE.PAUSED].includes(state.phase) ||
        state.activeStroke.length === 0
      ) {
        return state;
      }
      return {
        ...state,
        phase: CAPTURE_PHASE.READY,
        activeStroke: [],
        completedStrokes: [...state.completedStrokes, state.activeStroke],
        lastFinishReason: action.reason ?? "manual",
      };

    case "discard":
      if (![CAPTURE_PHASE.DRAWING, CAPTURE_PHASE.PAUSED].includes(state.phase)) {
        return state;
      }
      return {
        ...state,
        phase: CAPTURE_PHASE.READY,
        activeStroke: [],
        lastFinishReason: action.reason ?? "discard",
      };

    case "reset":
      return createCaptureState(state.strokeCount);

    default:
      return state;
  }
}

export function createCaptureSession(strokeCount) {
  let state = createCaptureState(strokeCount);
  return {
    get state() {
      return state;
    },
    dispatch(action) {
      state = reduceCapture(state, action);
      return state;
    },
  };
}
