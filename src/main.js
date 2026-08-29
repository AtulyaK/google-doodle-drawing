import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm";
import { recognizeStroke } from "./recognizer.js";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const SHAPES = ["line", "circle", "triangle"];
const SHAPE_LABELS = {
  line: "line",
  circle: "circle",
  triangle: "triangle",
};

const elements = {
  stage: document.querySelector("#stage"),
  video: document.querySelector("#camera"),
  canvas: document.querySelector("#drawingCanvas"),
  stageMessage: document.querySelector("#stageMessage"),
  status: document.querySelector("#status"),
  startButton: document.querySelector("#startButton"),
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
  stream: null,
  handLandmarker: null,
  animationFrame: null,
  lastVideoTime: -1,
  drawing: false,
  lostFrames: 0,
  stroke: [],
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
  state.drawing = false;
  state.lostFrames = 0;
  redraw();
}

function isDrawingGesture(landmarks) {
  const indexExtended = landmarks[8].y < landmarks[6].y;
  const middleCurled = landmarks[12].y > landmarks[10].y;
  const ringCurled = landmarks[16].y > landmarks[14].y;
  const pinkyCurled = landmarks[20].y > landmarks[18].y;
  return indexExtended && middleCurled && ringCurled && pinkyCurled;
}

function appendPoint(point) {
  const last = state.stroke[state.stroke.length - 1];
  if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 2) {
    state.stroke.push(point);
    redraw(point);
  } else {
    redraw(last);
  }
}

function submitStroke() {
  if (state.stroke.length < 8) {
    clearStroke();
    return;
  }

  const result = recognizeStroke(state.stroke);
  const requested = currentShape();
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
      `I saw a ${SHAPE_LABELS[result.shape]}. Try tracing the ${SHAPE_LABELS[requested]} again.`,
      "warning",
    );
  } else {
    setFeedback("Shape not clear yet", "Try a larger, slower stroke and keep your index finger extended.", "warning");
  }
  clearStroke();
}

function handleLandmarks(landmarks) {
  const fingertip = canvasPoint(landmarks[8]);
  if (state.complete) {
    redraw(fingertip);
    return;
  }
  const drawing = isDrawingGesture(landmarks);
  state.lostFrames = 0;

  if (drawing) {
    if (!state.drawing) {
      state.stroke = [];
      state.drawing = true;
      setStatus("Drawing...", "active");
    }
    appendPoint(fingertip);
  } else if (state.drawing) {
    state.drawing = false;
    setStatus("Shape captured", "neutral");
    submitStroke();
  } else {
    redraw(fingertip);
  }
}

function handleTrackingLoss() {
  state.lostFrames += 1;
  redraw();
  if (state.drawing && state.lostFrames > 5) {
    state.drawing = false;
    submitStroke();
  }
}

function processFrame() {
  if (!state.handLandmarker || elements.video.readyState < 2) {
    state.animationFrame = requestAnimationFrame(processFrame);
    return;
  }

  if (elements.video.currentTime !== state.lastVideoTime) {
    state.lastVideoTime = elements.video.currentTime;
    const result = state.handLandmarker.detectForVideo(elements.video, performance.now());
    const landmarks = result.landmarks?.[0];
    if (landmarks) {
      handleLandmarks(landmarks);
    } else {
      handleTrackingLoss();
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
    setStatus("Camera ready", "success");
    setFeedback("Trace the target", `Draw a ${SHAPE_LABELS[currentShape()]} with your index finger.`, "neutral");
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
}

function resetGame() {
  state.targetIndex = 0;
  state.score = 0;
  state.complete = false;
  clearStroke();
  updateChallenge();
  setFeedback("Ready when you are", "Start the camera, then use your index finger to trace the target.");
  setStatus(state.stream ? "Camera ready" : "Camera is off");
}

elements.startButton.addEventListener("click", startCamera);
elements.resetButton.addEventListener("click", resetGame);
window.addEventListener("resize", resizeCanvas);

updateChallenge();
resizeCanvas();
