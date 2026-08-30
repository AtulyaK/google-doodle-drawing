import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm";
import { VectorOneEuroFilter } from "./one-euro-filter.js";
import { recognizeStroke } from "./recognizer.js";
import { createSpacebarClutch } from "./spacebar-clutch.js";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const SHAPE_LABELS = {
  line: "line",
  v: "V",
  circle: "circle",
  triangle: "triangle",
};

const PHASE = Object.freeze({
  IDLE: "idle",
  READY: "ready",
  DRAWING: "drawing",
  PAUSED: "paused",
  SUBMITTED: "submitted",
});

const TRACKING_LOSS_GRACE_MS = 220;
const BRIDGE_MAX_GAP_MS = 180;
const BRIDGE_STEP_DISTANCE = 18;
const MAX_BRIDGE_STEPS = 4;
const MIN_STROKE_POINTS = 5;

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
  lastFrameTimestamp: null,
  stroke: [],
  cursor: null,
  pauseSince: null,
  pointFilter: new VectorOneEuroFilter({ minCutoff: 1.1, beta: 0.08 }),
  score: 0,
  busy: false,
};

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
    [PHASE.DRAWING, PHASE.PAUSED].includes(state.phase);
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

function transitionToReady(timestamp, statusMessage = "Press and hold Space to draw", tone = "neutral") {
  state.pauseSince = null;
  setPhase(PHASE.READY, timestamp, statusMessage, tone);
}

function transitionToIdle(timestamp, statusMessage = "Camera is off") {
  state.pauseSince = null;
  setPhase(PHASE.IDLE, timestamp, statusMessage, "neutral");
}

function beginStroke(timestamp) {
  state.stroke = [];
  state.pointFilter.reset();
  state.pauseSince = null;
  setPhase(PHASE.DRAWING, timestamp, "Space held — move your index finger to draw.", "active");
}

function resumeDrawing(timestamp, statusMessage = "Drawing...") {
  state.pauseSince = null;
  state.pointFilter.reset();
  setPhase(PHASE.DRAWING, timestamp, statusMessage, "active");
}

function transitionToPaused(timestamp) {
  state.pauseSince = timestamp;
  setPhase(PHASE.PAUSED, timestamp, "Tracking lost — keep holding Space or use Finish stroke.", "neutral");
}

function transitionToSubmitted(timestamp, tone = "success") {
  setPhase(PHASE.SUBMITTED, timestamp, "Stroke submitted", tone);
}

function updateChallenge() {
  elements.challengeTitle.textContent = "Identify the shape";
  elements.targetPreview.className = "target-preview target-identification";
  elements.targetPreview.setAttribute(
    "aria-label",
    "Supported shapes: line, circle, triangle, V",
  );
  elements.score.textContent = state.score;
  elements.shapeKeys.forEach((item) => {
    item.classList.remove("is-active", "is-complete");
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
  if (!spacebarClutch.held) {
    return;
  }
  appendSample(state.stroke, point, timestamp, true);
  redraw(point);
}

function resetStrokeLifecycle() {
  state.stroke = [];
  state.cursor = null;
  state.pauseSince = null;
  spacebarClutch.reset();
  state.pointFilter.reset();
  updateFinishButton();
}

function submitStroke(timestamp) {
  const rawStroke = state.stroke.map((point) => ({ x: point.x, y: point.y }));
  let result = { shape: null, confidence: 0 };

  if (rawStroke.length >= MIN_STROKE_POINTS) {
    result = recognizeStroke(rawStroke);
  }

  if (result.shape) {
    state.score += 1;
    setFeedback(
      "Shape identified",
      `I identified a ${detectedShapeLabel(result)}. Draw another supported shape whenever you're ready.`,
      "success",
    );
    updateChallenge();
  } else {
    setFeedback(
      "Shape not clear yet",
      "Try a larger, clearer line, circle, triangle, or V, then release Space when you are finished.",
      "warning",
    );
  }

  clearStroke();
  transitionToSubmitted(timestamp, result.shape ? "success" : "warning");
}

function handleLandmarks(landmarks, timestamp) {
  if (!spacebarClutch.held) {
    const hadCursor = state.cursor !== null;
    state.cursor = null;
    if ([PHASE.DRAWING, PHASE.PAUSED].includes(state.phase)) {
      clearStroke();
      transitionToReady(timestamp);
      return;
    } else if (state.phase === PHASE.SUBMITTED) {
      transitionToReady(timestamp);
    }
    if (hadCursor) {
      redraw();
    }
    return;
  }

  const rawPoint = canvasPoint(landmarks[8]);
  const filteredPoint = state.pointFilter.filter(rawPoint, timestamp);
  const fingertip = canvasSample(filteredPoint, timestamp);
  state.cursor = fingertip;

  if (state.phase === PHASE.SUBMITTED) {
    transitionToReady(timestamp);
    redraw(fingertip);
    return;
  }

  if (state.phase === PHASE.PAUSED) {
    if (spacebarClutch.held) {
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
    appendPoint(fingertip, timestamp);
    return;
  }

  redraw(fingertip);
}

function handleTrackingLoss(timestamp) {
  const hadCursor = state.cursor !== null;
  state.cursor = null;

  if (state.phase === PHASE.DRAWING) {
    transitionToPaused(timestamp);
  } else if (state.phase === PHASE.SUBMITTED) {
    transitionToReady(timestamp);
  }

  if (hadCursor) {
    redraw();
  }
}

function scheduleFrame() {
  if (state.animationFrame === null && state.stream && state.handLandmarker) {
    state.animationFrame = requestAnimationFrame(processFrame);
  }
}

function processFrame(frameTime) {
  state.animationFrame = null;

  try {
    if (!state.handLandmarker || !state.stream) {
      return;
    }

    const frameIsStale =
      state.lastFrameTimestamp !== null &&
      frameTime - state.lastFrameTimestamp > TRACKING_LOSS_GRACE_MS;

    if (frameIsStale && (state.cursor || state.phase === PHASE.DRAWING)) {
      handleTrackingLoss(frameTime);
    }

    if (elements.video.readyState < 2) {
      return;
    }

    if (elements.video.currentTime !== state.lastVideoTime) {
      state.lastVideoTime = elements.video.currentTime;
      state.lastFrameTimestamp = frameTime;
      const result = state.handLandmarker.detectForVideo(elements.video, frameTime);
      const landmarks = result.landmarks?.[0];
      if (landmarks) {
        handleLandmarks(landmarks, frameTime);
      } else {
        handleTrackingLoss(frameTime);
      }
    }
  } finally {
    scheduleFrame();
  }
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
  if ([PHASE.DRAWING, PHASE.PAUSED].includes(state.phase)) {
    spacebarClutch.finish("manual");
  }
}

function canStartSpacebarStroke(event) {
  if (state.phase === PHASE.IDLE) {
    setStatus("Start the camera before drawing.", "neutral");
    return false;
  }

  event.preventDefault();
  if (state.phase === PHASE.SUBMITTED) {
    transitionToReady(performance.now());
  }
  return state.phase === PHASE.READY;
}

function finishSpacebarStroke() {
  state.cursor = null;
  if ([PHASE.DRAWING, PHASE.PAUSED].includes(state.phase)) {
    submitStroke(performance.now());
  }
}

function handleCameraEnded() {
  if (!state.stream) {
    return;
  }

  stopCamera();
  elements.stageMessage.classList.remove("is-hidden");
  elements.startButton.textContent = "Start camera";
  elements.startButton.disabled = false;
  setStatus("Camera disconnected", "error");
  setFeedback("Camera connection ended", "Reconnect the camera to keep drawing.", "error");
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
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    state.stream = stream;
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener("ended", handleCameraEnded, { once: true });
    });
    elements.video.srcObject = stream;
    await elements.video.play();
    resizeCanvas();
    const handLandmarker = await createHandLandmarker();
    if (state.stream !== stream || !stream.active) {
      handLandmarker.close();
      throw new Error("The camera connection ended before hand tracking was ready.");
    }
    state.handLandmarker = handLandmarker;
    transitionToReady(performance.now(), "Camera ready — hold Space to draw", "success");
    setFeedback(
      "Hold Space to draw",
      "Hold Space while tracing any supported shape with your index fingertip, then release to identify it.",
      "neutral",
    );
    scheduleFrame();
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
  state.lastFrameTimestamp = null;
  resetStrokeLifecycle();
  transitionToIdle(performance.now());
  redraw();
}

function resetGame() {
  state.score = 0;
  resetStrokeLifecycle();
  clearStroke();
  updateChallenge();
  setFeedback(
    "Ready when you are",
    "Start the camera, hold Space to draw any supported shape, then release it for identification.",
  );
  if (state.stream) {
    transitionToReady(performance.now(), "Camera ready", "success");
  } else {
    transitionToIdle(performance.now());
  }
}

const spacebarClutch = createSpacebarClutch({
  target: window,
  canStart: canStartSpacebarStroke,
  onStart: () => beginStroke(performance.now()),
  onFinish: finishSpacebarStroke,
});

elements.startButton.addEventListener("click", startCamera);
elements.finishButton?.addEventListener("click", finishStroke);
elements.resetButton.addEventListener("click", resetGame);
window.addEventListener("pagehide", stopCamera);
window.addEventListener("resize", resizeCanvas);

updateChallenge();
resizeCanvas();
