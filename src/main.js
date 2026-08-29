import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm";
import { updatePinchState } from "./gestures.js";
import { VectorOneEuroFilter } from "./one-euro-filter.js";
import { recognizeStroke } from "./recognizer.js";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const SHAPES = ["line", "circle", "triangle"];
const SHAPE_LABELS = {
  line: "line",
  v: "V",
  circle: "circle",
  triangle: "triangle",
};

const PHASE = Object.freeze({
  IDLE: "idle",
  READY: "ready",
  PINCH_STARTING: "pinch-starting",
  DRAWING: "drawing",
  PAUSED: "paused",
  PINCH_ENDING: "pinch-ending",
  SUBMITTED: "submitted",
});

const TRACKING_LOSS_GRACE_MS = 220;
const PINCH_TOGGLE_DEBOUNCE_MS = 130;
const POST_SUBMIT_RELEASE_MS = 180;
const BRIDGE_MAX_GAP_MS = 180;
const BRIDGE_STEP_DISTANCE = 18;
const MAX_BRIDGE_STEPS = 4;
const MIN_STROKE_POINTS = 8;

const elements = {
  stage: document.querySelector("#stage"),
  video: document.querySelector("#camera"),
  canvas: document.querySelector("#drawingCanvas"),
  stageMessage: document.querySelector("#stageMessage"),
  status: document.querySelector("#status"),
  startButton: document.querySelector("#startButton"),
  finishButton: document.querySelector("#finishButton"),
  resetButton: document.querySelector("#resetButton"),
  challengeTitle: document.querySelector("#challengeTitle"),
  targetPreview: document.querySelector("#targetPreview"),
  feedbackTitle: document.querySelector("#feedbackTitle"),
  feedbackDetail: document.querySelector("#feedbackDetail"),
  feedbackPanel: document.querySelector(".feedback-panel"),
  score: document.querySelector("#score"),
  shapeKeys: [...document.querySelectorAll("[data-shape-key]")],
};

const context = elements.canvas.getContext("2d");
const state = {
  phase: PHASE.IDLE,
  phaseSince: 0,
  stream: null,
  handLandmarker: null,
  animationFrame: null,
  lastVideoTime: -1,
  stroke: [],
  cursor: null,
  pauseSince: null,
  submittedSince: null,
  cooldownUntil: 0,
  pinchActive: false,
  pointFilter: new VectorOneEuroFilter({ minCutoff: 1.1, beta: 0.08 }),
  targetIndex: 0,
  score: 0,
  complete: false,
  busy: false,
};

function currentShape() {
  return SHAPES[state.targetIndex];
}

function setStatus(message, tone = "neutral") {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}

function setFeedback(title, detail, tone = "neutral") {
  elements.feedbackTitle.textContent = title;
  elements.feedbackDetail.textContent = detail;
  elements.feedbackPanel?.setAttribute("data-tone", tone);
}

function updateFinishButton() {
  if (!elements.finishButton) {
    return;
  }

  const canFinish =
    state.stroke.length >= MIN_STROKE_POINTS &&
    [PHASE.DRAWING, PHASE.PAUSED, PHASE.PINCH_ENDING].includes(state.phase);
  elements.finishButton.disabled = !canFinish;
}

function detectedShapeLabel(result) {
  if (result.shape === "line" && result.orientation) {
    return `${result.orientation} line`;
  }
  return SHAPE_LABELS[result.shape] ?? result.shape;
}

function setPhase(phase, timestamp, statusMessage, tone = "neutral") {
  if (state.phase !== phase) {
    state.phase = phase;
    state.phaseSince = timestamp;
  }
  if (statusMessage) {
    setStatus(statusMessage, tone);
  }
  updateFinishButton();
}

function canvasSample(point, timestamp) {
  return { x: point.x, y: point.y, t: timestamp };
}

function appendSample(buffer, point, timestamp, allowBridge = true) {
  const sample = canvasSample(point, timestamp);
  const previous = buffer[buffer.length - 1];

  if (!previous) {
    buffer.push(sample);
    return;
  }

  const gapMs = Math.max(0, sample.t - previous.t);
  const gapPx = Math.hypot(sample.x - previous.x, sample.y - previous.y);

  if (allowBridge && gapMs <= BRIDGE_MAX_GAP_MS && gapPx >= BRIDGE_STEP_DISTANCE) {
    const bridgeSteps = Math.min(
      MAX_BRIDGE_STEPS,
      Math.max(2, Math.ceil(gapPx / BRIDGE_STEP_DISTANCE)),
    );

    for (let step = 1; step < bridgeSteps; step += 1) {
      const ratio = step / bridgeSteps;
      buffer.push({
        x: previous.x + (sample.x - previous.x) * ratio,
        y: previous.y + (sample.y - previous.y) * ratio,
        t: previous.t + gapMs * ratio,
      });
    }
  }

  if (gapPx > 0.5 || gapMs > 0) {
    buffer.push(sample);
  }
}

function transitionToReady(timestamp, statusMessage = "Trace the target", tone = "neutral") {
  state.submittedSince = null;
  state.cooldownUntil = 0;
  state.pauseSince = null;
  setPhase(PHASE.READY, timestamp, statusMessage, tone);
}

function transitionToIdle(timestamp, statusMessage = "Camera is off") {
  state.submittedSince = null;
  state.cooldownUntil = 0;
  state.pauseSince = null;
  setPhase(PHASE.IDLE, timestamp, statusMessage, "neutral");
}

function transitionToPinchStarting(timestamp) {
  setPhase(PHASE.PINCH_STARTING, timestamp, "Hold pinch to arm the pen...", "active");
}

function beginStroke(timestamp) {
  state.stroke = [];
  state.pointFilter.reset();
  state.pauseSince = null;
  setPhase(PHASE.DRAWING, timestamp, "Pen armed — move your index finger to draw.", "active");
}

function resumeDrawing(timestamp, statusMessage = "Drawing...") {
  state.pauseSince = null;
  state.pointFilter.reset();
  setPhase(PHASE.DRAWING, timestamp, statusMessage, "active");
}

function transitionToPaused(timestamp) {
  state.pauseSince = timestamp;
  setPhase(PHASE.PAUSED, timestamp, "Tracking lost — show your hand or use Finish stroke.", "neutral");
}

function transitionToPinchEnding(timestamp) {
  setPhase(PHASE.PINCH_ENDING, timestamp, "Hold pinch to finish...", "active");
}

function transitionToSubmitted(timestamp, tone = "success") {
  state.submittedSince = timestamp;
  state.cooldownUntil = timestamp + POST_SUBMIT_RELEASE_MS;
  setPhase(
    PHASE.SUBMITTED,
    timestamp,
    state.pinchActive ? "Stroke submitted — release pinch." : "Stroke submitted",
    tone,
  );
}

function updateChallenge() {
  const shape = currentShape();
  elements.challengeTitle.textContent = state.complete ? "Challenge complete!" : `Draw a ${SHAPE_LABELS[shape]}`;
  elements.targetPreview.className = `target-preview ${state.complete ? "target-complete" : `target-${shape}`}`;
  elements.targetPreview.setAttribute("aria-label", state.complete ? "All shapes complete" : `Target shape: ${shape}`);
  elements.score.textContent = state.score;
  elements.shapeKeys.forEach((item) => {
    const shapeIndex = SHAPES.indexOf(item.dataset.shapeKey);
    item.classList.toggle("is-active", !state.complete && item.dataset.shapeKey === shape);
    item.classList.toggle("is-complete", state.complete || shapeIndex < state.targetIndex);
  });
}

function resizeCanvas() {
  const rect = elements.stage.getBoundingClientRect();
  const deviceScale = window.devicePixelRatio || 1;
  elements.canvas.width = Math.max(1, Math.floor(rect.width * deviceScale));
  elements.canvas.height = Math.max(1, Math.floor(rect.height * deviceScale));
  context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  redraw();
}

function canvasPoint(point) {
  const rect = elements.stage.getBoundingClientRect();
  const videoWidth = elements.video.videoWidth || 16;
  const videoHeight = elements.video.videoHeight || 10;
  const scale = Math.max(rect.width / videoWidth, rect.height / videoHeight);
  const renderedWidth = videoWidth * scale;
  const renderedHeight = videoHeight * scale;
  const offsetX = (renderedWidth - rect.width) / 2;
  const offsetY = (renderedHeight - rect.height) / 2;
  return {
    x: (1 - point.x) * renderedWidth - offsetX,
    y: point.y * renderedHeight - offsetY,
  };
}

function drawStroke() {
  if (state.stroke.length < 2) {
    return;
  }
  context.save();
  context.lineWidth = 5;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#f97316";
  context.shadowColor = "rgba(249, 115, 22, 0.35)";
  context.shadowBlur = 12;
  context.beginPath();
  state.stroke.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.stroke();
  context.restore();
}

function redraw(cursor = null) {
  const rect = elements.stage.getBoundingClientRect();
  context.clearRect(0, 0, rect.width, rect.height);
  drawStroke();
  if (cursor) {
    context.save();
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#f97316";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(cursor.x, cursor.y, 9, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }
}

function clearStroke() {
  state.stroke = [];
  state.pauseSince = null;
  state.pointFilter.reset();
  redraw();
}

function appendPoint(point, timestamp) {
  appendSample(state.stroke, point, timestamp, true);
  redraw(point);
}

function resetStrokeLifecycle() {
  state.stroke = [];
  state.pauseSince = null;
  state.submittedSince = null;
  state.cooldownUntil = 0;
  state.pinchActive = false;
  state.pointFilter.reset();
  updateFinishButton();
}

function submitStroke(timestamp) {
  const rawStroke = state.stroke.map((point) => ({ x: point.x, y: point.y }));
  const requested = currentShape();
  let result = { shape: null, confidence: 0 };

  if (rawStroke.length >= MIN_STROKE_POINTS) {
    result = recognizeStroke(rawStroke);
  }

  if (result.shape === requested) {
    state.score += 1;
    state.complete = state.targetIndex === SHAPES.length - 1;
    setFeedback(
      state.complete ? "You nailed it!" : "Nice drawing!",
      state.complete
        ? "You completed all three shape challenges."
        : `You drew a ${SHAPE_LABELS[result.shape]}. Move on to the next shape.`,
      "success",
    );
    state.targetIndex = Math.min(state.targetIndex + 1, SHAPES.length - 1);
    updateChallenge();
  } else if (result.shape) {
    setFeedback(
      "Almost there",
      `I saw a ${detectedShapeLabel(result)}. Try tracing the ${SHAPE_LABELS[requested]} again.`,
      "warning",
    );
  } else {
    setFeedback(
      "Shape not clear yet",
      "Try a larger stroke, keep your fingertip visible, and pinch only when you are finished.",
      "warning",
    );
  }

  clearStroke();
  transitionToSubmitted(timestamp, result.shape === requested ? "success" : "warning");
}

function handleLandmarks(landmarks, worldLandmarks, timestamp) {
  const rawPoint = canvasPoint(landmarks[8]);
  const filteredPoint = state.pointFilter.filter(rawPoint, timestamp);
  const fingertip = canvasSample(filteredPoint, timestamp);
  state.cursor = fingertip;

  if (state.complete) {
    redraw(fingertip);
    return;
  }

  const pinchLandmarks = worldLandmarks ?? landmarks;
  state.pinchActive = updatePinchState(state.pinchActive, pinchLandmarks);

  if (state.phase === PHASE.SUBMITTED) {
    if (!state.pinchActive && timestamp >= state.cooldownUntil) {
      transitionToReady(timestamp, "Pinch to arm the pen");
    }
    redraw(fingertip);
    return;
  }

  if (state.phase === PHASE.PINCH_STARTING) {
    if (!state.pinchActive) {
      if (timestamp - state.phaseSince >= PINCH_TOGGLE_DEBOUNCE_MS) {
        beginStroke(timestamp);
      } else {
        transitionToReady(timestamp, "Pinch was too brief — try again");
      }
    } else if (timestamp - state.phaseSince >= PINCH_TOGGLE_DEBOUNCE_MS) {
      setStatus("Release pinch to begin drawing.", "active");
    }
    redraw(fingertip);
    return;
  }

  if (state.phase === PHASE.PINCH_ENDING) {
    if (!state.pinchActive) {
      resumeDrawing(timestamp);
    } else if (timestamp - state.phaseSince >= PINCH_TOGGLE_DEBOUNCE_MS) {
      submitStroke(timestamp);
    }
    redraw(fingertip);
    return;
  }

  if (state.phase === PHASE.PAUSED) {
    if (state.pinchActive) {
      transitionToPinchEnding(timestamp);
    } else {
      const resumedQuickly = timestamp - state.pauseSince <= TRACKING_LOSS_GRACE_MS;
      resumeDrawing(timestamp);
      appendPoint(fingertip, timestamp);
      if (!resumedQuickly) {
        setStatus("Drawing resumed after tracking recovered.", "active");
      }
    }
    redraw(fingertip);
    return;
  }

  if (state.phase === PHASE.DRAWING) {
    if (state.pinchActive) {
      transitionToPinchEnding(timestamp);
      redraw(fingertip);
    } else {
      appendPoint(fingertip, timestamp);
    }
    return;
  }

  if (state.phase === PHASE.READY) {
    if (state.pinchActive) {
      transitionToPinchStarting(timestamp);
    }
    redraw(fingertip);
    return;
  }

  redraw(fingertip);
}

function handleTrackingLoss(timestamp) {
  state.cursor = null;

  if (state.complete) {
    redraw();
    return;
  }

  if (state.phase === PHASE.DRAWING || state.phase === PHASE.PINCH_ENDING) {
    transitionToPaused(timestamp);
  } else if (state.phase === PHASE.PINCH_STARTING) {
    transitionToReady(timestamp, "Tracking lost before the pen was armed");
  } else if (state.phase === PHASE.SUBMITTED && timestamp >= state.cooldownUntil && !state.pinchActive) {
    transitionToReady(timestamp, "Pinch to arm the pen");
  }

  redraw();
}

function processFrame() {
  if (!state.handLandmarker || elements.video.readyState < 2) {
    state.animationFrame = requestAnimationFrame(processFrame);
    return;
  }

  if (elements.video.currentTime !== state.lastVideoTime) {
    state.lastVideoTime = elements.video.currentTime;
    const frameTime = performance.now();
    const result = state.handLandmarker.detectForVideo(elements.video, frameTime);
    const landmarks = result.landmarks?.[0];
    if (landmarks) {
      handleLandmarks(landmarks, result.worldLandmarks?.[0] ?? null, frameTime);
    } else {
      handleTrackingLoss(frameTime);
    }
  }
  state.animationFrame = requestAnimationFrame(processFrame);
}

async function createHandLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
  });
}

function finishStroke() {
  if ([PHASE.DRAWING, PHASE.PAUSED, PHASE.PINCH_ENDING].includes(state.phase)) {
    submitStroke(performance.now());
  }
}

async function startCamera() {
  if (state.busy || state.stream) {
    return;
  }
  state.busy = true;
  elements.startButton.disabled = true;
  setStatus("Loading hand tracking...", "active");
  elements.stageMessage.classList.add("is-hidden");

  try {
    const localHosts = ["localhost", "127.0.0.1", "[::1]"];
    if (!window.isSecureContext && !localHosts.includes(window.location.hostname)) {
      throw new Error("Camera access requires localhost or HTTPS. Open http://localhost:5173 instead of this LAN address.");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not provide camera access.");
    }
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    elements.video.srcObject = state.stream;
    await elements.video.play();
    resizeCanvas();
    state.handLandmarker = await createHandLandmarker();
    transitionToReady(performance.now(), "Camera ready — pinch to arm the pen", "success");
    setFeedback(
      "Pinch to start",
      `Pinch once, release, then draw a ${SHAPE_LABELS[currentShape()]} with your index fingertip.`,
      "neutral",
    );
    state.animationFrame = requestAnimationFrame(processFrame);
    elements.startButton.textContent = "Camera ready";
  } catch (error) {
    stopCamera();
    elements.stageMessage.classList.remove("is-hidden");
    setStatus("Camera could not start", "error");
    setFeedback("Camera access needed", error instanceof Error ? error.message : "Please check your browser permissions.", "error");
  } finally {
    state.busy = false;
    elements.startButton.disabled = Boolean(state.stream);
  }
}

function stopCamera() {
  if (state.animationFrame) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
  elements.video.srcObject = null;
  state.handLandmarker?.close();
  state.handLandmarker = null;
  state.lastVideoTime = -1;
  resetStrokeLifecycle();
  transitionToIdle(performance.now());
  redraw();
}

function resetGame() {
  state.targetIndex = 0;
  state.score = 0;
  state.complete = false;
  resetStrokeLifecycle();
  clearStroke();
  updateChallenge();
  setFeedback("Ready when you are", "Start the camera, pinch to arm the pen, then trace the target.");
  if (state.stream) {
    transitionToReady(performance.now(), "Camera ready", "success");
  } else {
    transitionToIdle(performance.now());
  }
}

elements.startButton.addEventListener("click", startCamera);
elements.finishButton?.addEventListener("click", finishStroke);
elements.resetButton.addEventListener("click", resetGame);
window.addEventListener("resize", resizeCanvas);

updateChallenge();
resizeCanvas();
