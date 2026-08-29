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
2. Hold one hand in view with the index finger extended and the other fingers curled.
3. Trace the requested shape in the air while keeping the index finger extended.
4. Pinch your thumb and index finger briefly to release and submit the stroke without drawing a return line.
5. Lowering your index finger remains available as a fallback release gesture.
6. Complete the line, circle, and triangle challenges.

The first prototype recognizes a small set of primitive strokes with deterministic geometry heuristics: open strokes map to horizontal, vertical, or diagonal lines; open two-leg strokes can map to a V; and closed loops are classified as circle or triangle. Very small, incomplete, or ambiguous strokes are rejected so the game can ask for a retry. Brief hand-tracking loss while drawing is tolerated before the stroke is submitted.

## Browser support

Use a current browser with `getUserMedia`, ES modules, WebAssembly, and WebGL/WASM support. Chromium-based browsers are the primary target for this prototype.

## Recognizer checks

Serve the repository locally, then open <http://localhost:5173/tests/recognizer.test.html> to run the browser-based synthetic stroke checks.
