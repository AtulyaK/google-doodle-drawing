# Doodle Motion

Doodle Motion is a browser prototype for drawing shapes with a fingertip tracked by a camera. It is designed as an original, small game experience inspired by gesture-driven drawing interactions.

## Run locally

Camera access requires a secure context. Use localhost rather than opening `index.html` directly:

```powershell
python -m http.server 5173
```

Then open <http://localhost:5173>.

Use `localhost` (or `127.0.0.1`) for camera access. Do not use the LAN IP addresses printed by the server when serving over plain HTTP; browsers block camera access on those origins unless they are configured for HTTPS.

The first load downloads the MediaPipe hand-landmark runtime and model from their public CDNs. After that, camera frames are processed locally in the browser and are not uploaded by this app.

## How to play

1. Select **Start camera** and grant camera permission.
2. Hold one hand in view and pinch your thumb and index finger together until the pen is armed.
3. Release the pinch, then trace the requested shape with your index fingertip. Hand roll and tilt do not cancel an armed stroke.
4. Pinch your thumb and index finger again and hold briefly to freeze and submit the stroke without drawing a return line.
5. Use **Finish stroke** to submit manually if tracking slips or you prefer a button.
6. Complete the line, circle, and triangle challenges.

The app recognizes a small set of primitive strokes with deterministic geometry heuristics: open strokes map to horizontal, vertical, or diagonal lines; open two-leg strokes can map to a V; and closed loops are classified as circle or triangle. Very small, incomplete, or ambiguous strokes are rejected so the game can ask for a retry. Brief hand-tracking loss pauses the stroke and allows reacquisition instead of submitting it automatically.

The interaction uses a virtual-pen latch rather than a continuously evaluated “index finger up” pose. Pinch detection uses thumb-index distance normalized by palm width from MediaPipe world landmarks, with hysteresis to prevent noisy toggles. The fingertip cursor uses image landmarks and an adaptive One Euro filter for low-latency smoothing. Pinch frames and the movement used to release or finish are excluded from the submitted stroke.

## Browser support

Use a current browser with `getUserMedia`, ES modules, WebAssembly, and WebGL/WASM support. Chromium-based browsers are the primary target for this prototype.

## Recognizer checks

Serve the repository locally, then open <http://localhost:5173/tests/recognizer.test.html> to run the browser-based synthetic stroke checks.
