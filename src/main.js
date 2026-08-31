import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm";
import { createAmbientAudio } from "./ambient-audio.js";
import { createWaterCelebration } from "./water-celebration.js";
import { VectorOneEuroFilter } from "./one-euro-filter.js";
import { createCaptureSession } from "./capture-session.js";
import { createSpacebarClutch } from "./spacebar-clutch.js";
import { FIRST_BINDING, templatePointToStage } from "./sigil-templates.js";
import { matchSigil, matchStrokeToTemplate } from "./sigil-matcher.js";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

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
  audioButton: document.querySelector("#audioButton"),
  resetButton: document.querySelector("#resetButton"),
  challengeTitle: document.querySelector("#challengeTitle"),
  challengeElement: document.querySelector("#challengeElement"),
  challengeMeaning: document.querySelector("#challengeMeaning"),
  targetPreview: document.querySelector("#targetPreview"),
  feedbackTitle: document.querySelector("#feedbackTitle"),
  feedbackDetail: document.querySelector("#feedbackDetail"),
  feedbackPanel: document.querySelector(".feedback-panel"),
  score: document.querySelector("#score"),
  progressItems: [...document.querySelectorAll("[data-stroke-key]")],
};

const context = elements.canvas.getContext("2d");
const captureSession = createCaptureSession(FIRST_BINDING.strokes.length);
const ambientAudio = createAmbientAudio({ onChange: () => updateAudioButton() });
const waterCelebration = createWaterCelebration({
  stage: elements.stage,
  caption: `${FIRST_BINDING.name} represents ${FIRST_BINDING.element}`,
});
const state = {
  phase: PHASE.IDLE,
  phaseSince: 0,
  stream: null,
  handLandmarker: null,
  animationFrame: null,
  lastVideoTime: -1,
  lastFrameTimestamp: null,
  stroke: [],
  committedStrokes: [],
  cursor: null,
  pauseSince: null,
  pointFilter: new VectorOneEuroFilter({ minCutoff: 1.1, beta: 0.08 }),
  score: 0,
  sigilCompleted: false,
  busy: false,
};

function setStatus(message, tone = "neutral") {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}

// Hiding the stage overlay drops keyboard focus to the body, so hand it to the
// next sensible control instead of sending the player back to the page start.
function reclaimFocus(target) {
  if (document.activeElement === document.body || document.activeElement === null) {
    target?.focus?.();
  }
}

function setFeedback(title, detail, tone = "neutral") {
  elements.feedbackTitle.textContent = title;
  elements.feedbackDetail.textContent = detail;
  elements.feedbackPanel?.setAttribute("data-tone", tone);
}

function syncCaptureState() {
  const captureState = captureSession.state;
  state.stroke = captureState.activeStroke;
  state.committedStrokes = captureState.completedStrokes;
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

function currentStrokeTemplate() {
  return FIRST_BINDING.strokes[state.committedStrokes.length] ?? null;
}

function currentStrokeLabel() {
  return currentStrokeTemplate()?.label ?? "next stencil stroke";
}

function readyStatusMessage() {
  return state.committedStrokes.length === FIRST_BINDING.strokes.length
    ? "Both strokes are ready — the sigil will finish automatically."
    : `Press and hold Space to draw the ${currentStrokeLabel()}.`;
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

function transitionToReady(
  timestamp,
  statusMessage = readyStatusMessage(),
  tone = "neutral",
) {
  state.pauseSince = null;
  setPhase(PHASE.READY, timestamp, statusMessage, tone);
}

function transitionToIdle(timestamp, statusMessage = "Camera is off") {
  state.pauseSince = null;
  setPhase(PHASE.IDLE, timestamp, statusMessage, "neutral");
}

function beginStroke(timestamp) {
  captureSession.dispatch({ type: "start" });
  syncCaptureState();
  state.pointFilter.reset();
  state.pauseSince = null;
  setPhase(
    PHASE.DRAWING,
    timestamp,
    `Space held — trace the ${currentStrokeLabel()}.`,
    "active",
  );
}

function resumeDrawing(timestamp, statusMessage = "Drawing...") {
  state.pauseSince = null;
  state.pointFilter.reset();
  captureSession.dispatch({ type: "resume" });
  syncCaptureState();
  setPhase(PHASE.DRAWING, timestamp, statusMessage, "active");
}

function transitionToPaused(timestamp) {
  state.pauseSince = timestamp;
  captureSession.dispatch({ type: "pause" });
  syncCaptureState();
  setPhase(PHASE.PAUSED, timestamp, "Tracking lost — keep holding Space or use Finish stroke.", "neutral");
}

function transitionToSubmitted(timestamp, statusMessage, tone = "success") {
  setPhase(PHASE.SUBMITTED, timestamp, statusMessage, tone);
}

function updateChallenge() {
  elements.challengeTitle.textContent = FIRST_BINDING.name;
  elements.targetPreview.className = "target-preview target-sigil";
  elements.targetPreview.setAttribute(
    "aria-label",
    "First Binding water sigil: a vessel ring followed by a pointed apex",
  );
  elements.targetPreview.classList.toggle("is-awakened", state.sigilCompleted);
  elements.score.textContent = state.score;
  elements.challengeElement.textContent = `Element: ${FIRST_BINDING.element}`;
  elements.challengeMeaning.textContent = FIRST_BINDING.meaning;
  elements.progressItems.forEach((item, index) => {
    item.classList.toggle("is-complete", index < state.committedStrokes.length);
    item.classList.toggle(
      "is-active",
      index === state.committedStrokes.length && !state.sigilCompleted,
    );
  });
  updateFinishButton();
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

function drawPath(points, { color, width, dash = [], glow = false, glowColor = color }) {
  if (points.length < 2) {
    return;
  }
  context.save();
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = color;
  context.setLineDash(dash);
  if (glow) {
    context.shadowColor = glowColor;
    context.shadowBlur = 12;
  }
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.stroke();
  context.restore();
}

function drawStencil(rect) {
  FIRST_BINDING.strokes.forEach((stroke, index) => {
    const points = stroke.points.map((point) =>
      templatePointToStage(point, rect.width, rect.height),
    );
    const isComplete = index < state.committedStrokes.length;
    const isCurrent = index === state.committedStrokes.length && !state.sigilCompleted;
    drawPath(points, {
      color: isComplete
        ? "rgba(52, 211, 153, 0.72)"
        : isCurrent
          ? "rgba(250, 204, 21, 0.96)"
          : "rgba(96, 165, 250, 0.58)",
      width: isCurrent ? 5 : 3,
      dash: isComplete ? [] : [7, 9],
      glow: isCurrent,
      glowColor: "rgba(250, 204, 21, 0.65)",
    });
  });
}

function drawCommittedStrokes() {
  state.committedStrokes.forEach((stroke) => {
    drawPath(stroke, {
      color: "#34d399",
      width: 5,
      glow: state.sigilCompleted,
    });
  });
}

function drawStroke() {
  drawPath(state.stroke, {
    color: "#f97316",
    width: 5,
    glow: true,
  });
}

function redraw(cursor = null) {
  const rect = elements.stage.getBoundingClientRect();
  context.clearRect(0, 0, rect.width, rect.height);
  drawStencil(rect);
  drawCommittedStrokes();
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
  captureSession.dispatch({ type: "discard", reason: "clear" });
  syncCaptureState();
  state.pauseSince = null;
  state.pointFilter.reset();
  redraw();
}

function appendPoint(point, timestamp) {
  if (!spacebarClutch.held) {
    return;
  }
  const previousLength = state.stroke.length;
  const nextStroke = [...state.stroke];
  appendSample(nextStroke, point, timestamp, true);
  nextStroke.slice(previousLength).forEach((sample) => {
    captureSession.dispatch({ type: "append", point: sample });
    syncCaptureState();
  });
  if (nextStroke.length === previousLength) {
    syncCaptureState();
  }
  redraw(point);
}

function resetStrokeLifecycle() {
  captureSession.dispatch({ type: "reset" });
  syncCaptureState();
  waterCelebration.cancel();
  state.cursor = null;
  state.pauseSince = null;
  state.sigilCompleted = false;
  spacebarClutch.reset();
  state.pointFilter.reset();
  updateFinishButton();
}

function strokeRetryHint(result, template) {
  if (result.reason === "too-short") {
    return `Keep holding Space a little longer while tracing the ${template.label}.`;
  }
  if (result.reason === "not-closed") {
    return "Bring the end of the vessel back near where you began.";
  }
  if (result.reason === "missing-corner") {
    return "Give the apex one clear point instead of a straight line.";
  }
  return `That mark was close. Follow the ${template.label} stencil and try once more.`;
}

function submitStroke(timestamp, finishReason = "release") {
  const rawStroke = state.stroke.map((point) => ({ x: point.x, y: point.y }));
  const template = currentStrokeTemplate();
  const result = template
    ? matchStrokeToTemplate(rawStroke, template)
    : { matched: false, confidence: 0, reason: "stroke-count" };

  if (result.matched) {
    captureSession.dispatch({ type: "finish", reason: finishReason });
    syncCaptureState();
    const completedAllStrokes =
      state.committedStrokes.length === FIRST_BINDING.strokes.length;
    if (completedAllStrokes) {
      state.cursor = null;
      state.pauseSince = null;
      state.pointFilter.reset();
      completeSigil(timestamp);
      return;
    }
    setFeedback(
      `${template.label} inscribed`,
      `Good start. Now trace the ${currentStrokeLabel()} and release Space when you are ready.`,
      "success",
    );
    updateChallenge();
    transitionToSubmitted(
      timestamp,
      `${template.label} inscribed`,
      "success",
    );
  } else {
    captureSession.dispatch({ type: "discard", reason: "rejected" });
    syncCaptureState();
    setFeedback(
      "That stroke needs another try",
      template ? strokeRetryHint(result, template) : "Choose the next stencil stroke and try again.",
      "warning",
    );
    transitionToSubmitted(timestamp, "Stroke needs another try", "warning");
  }

  state.cursor = null;
  state.pauseSince = null;
  state.pointFilter.reset();
  redraw();
}

function resetAttempt() {
  captureSession.dispatch({ type: "reset" });
  syncCaptureState();
  waterCelebration.cancel();
  state.cursor = null;
  state.pauseSince = null;
  state.sigilCompleted = false;
  state.pointFilter.reset();
  updateChallenge();
  redraw();
}

function completeSigil(timestamp = performance.now()) {
  if (
    state.committedStrokes.length !== FIRST_BINDING.strokes.length ||
    state.sigilCompleted ||
    state.phase === PHASE.IDLE
  ) {
    return;
  }

  const result = matchSigil(state.committedStrokes, FIRST_BINDING);
  if (result.matched) {
    state.score += 1;
    state.sigilCompleted = true;
    waterCelebration.start();
    ambientAudio.playSigilComplete();
    setFeedback(
      `${FIRST_BINDING.element} sigil awakened`,
      `${FIRST_BINDING.name} represents ${FIRST_BINDING.element}. ${FIRST_BINDING.meaning} Press Space to draw it again or Reset to clear the score.`,
      "success",
    );
    updateChallenge();
    transitionToSubmitted(timestamp, "Sigil awakened", "success");
    redraw();
    return;
  }

  resetAttempt();
  setFeedback(
    "The sigil needs another try",
    "The pieces were clear, but their placement drifted apart. Start again and keep the apex inside the vessel.",
    "warning",
  );
  transitionToSubmitted(timestamp, "Sigil needs another try", "warning");
}

function handleLandmarks(landmarks, timestamp) {
  if (!spacebarClutch.held) {
    const hadCursor = state.cursor !== null;
    state.cursor = null;
    if ([PHASE.DRAWING, PHASE.PAUSED].includes(state.phase)) {
      clearStroke();
      transitionToReady(timestamp);
      return;
    } else if (state.phase === PHASE.SUBMITTED && !state.sigilCompleted) {
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
    if (!state.sigilCompleted) {
      transitionToReady(timestamp);
    }
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
  } else if (state.phase === PHASE.SUBMITTED && !state.sigilCompleted) {
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
  if (state.committedStrokes.length >= FIRST_BINDING.strokes.length) {
    if (!state.sigilCompleted) {
      setStatus("The sigil is finishing — try again in a moment.", "success");
      return false;
    }
    resetAttempt();
    transitionToReady(performance.now(), "Press and hold Space to draw the Vessel again.", "success");
  }
  if (state.phase === PHASE.SUBMITTED) {
    transitionToReady(performance.now());
  }
  return state.phase === PHASE.READY;
}

function finishSpacebarStroke(reason) {
  state.cursor = null;
  if ([PHASE.DRAWING, PHASE.PAUSED].includes(state.phase)) {
    submitStroke(performance.now(), reason);
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
  reclaimFocus(elements.startButton);
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
    transitionToReady(
      performance.now(),
      "Camera ready — hold Space to draw the Vessel.",
      "success",
    );
    setFeedback(
      "Hold Space to draw",
      "Trace the Vessel ring first, then the Apex mark. Release Space after each stroke.",
      "neutral",
    );
    scheduleFrame();
    elements.startButton.textContent = "Camera ready";
    reclaimFocus(elements.status);
  } catch (error) {
    stopCamera();
    elements.stageMessage.classList.remove("is-hidden");
    setStatus("Camera could not start", "error");
    setFeedback("Camera access needed", error instanceof Error ? error.message : "Please check your browser permissions.", "error");
    elements.startButton.disabled = false;
    reclaimFocus(elements.startButton);
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
  updateChallenge();
  setFeedback(
    "Ready when you are",
    "Start the camera, trace both stencil strokes, and release Space after each one.",
  );
  if (state.stream) {
    transitionToReady(performance.now(), "Camera ready", "success");
  } else {
    transitionToIdle(performance.now());
  }
  redraw();
}

function updateAudioButton() {
  if (!elements.audioButton) {
    return;
  }
  if (!ambientAudio.available) {
    elements.audioButton.disabled = true;
    elements.audioButton.textContent = "Audio unavailable";
    elements.audioButton.setAttribute("aria-pressed", "false");
    return;
  }

  elements.audioButton.disabled = false;
  elements.audioButton.textContent = ambientAudio.enabled ? "Mute ambience" : "Enable ambience";
  elements.audioButton.setAttribute("aria-pressed", String(ambientAudio.enabled));
  elements.audioButton.classList.toggle("is-active", ambientAudio.enabled);
}

function toggleAudio() {
  ambientAudio.toggle();
  updateAudioButton();
}

const spacebarClutch = createSpacebarClutch({
  target: window,
  canStart: canStartSpacebarStroke,
  onStart: () => beginStroke(performance.now()),
  onFinish: finishSpacebarStroke,
});

elements.startButton.addEventListener("click", startCamera);
elements.finishButton?.addEventListener("click", finishStroke);
elements.audioButton?.addEventListener("click", toggleAudio);
elements.resetButton.addEventListener("click", resetGame);
window.addEventListener("pagehide", () => {
  stopCamera();
  ambientAudio.stop();
  waterCelebration.cancel();
});
window.addEventListener("resize", resizeCanvas);

updateChallenge();
updateAudioButton();
resizeCanvas();
