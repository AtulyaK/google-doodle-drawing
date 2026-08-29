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
2. Hold one hand in view, then press and hold **Space**.
3. Trace the requested shape with your index fingertip while holding Space. Hand roll and tilt do not cancel the stroke.
4. Release **Space** to freeze and submit the stroke without drawing a return line.
5. Use **Finish stroke** to submit manually if tracking slips or you prefer a button.
6. Complete the line, circle, and triangle challenges.

The app recognizes a small set of primitive strokes with deterministic geometry heuristics: open strokes map to horizontal, vertical, or diagonal lines; open two-leg strokes can map to a V; and closed loops are classified as circle or triangle. Very small, incomplete, or ambiguous strokes are rejected so the game can ask for a retry. Brief hand-tracking loss pauses the stroke and allows reacquisition instead of submitting it automatically.

The interaction uses a keyboard clutch rather than a continuously evaluated “index finger up” pose. Holding Space explicitly opens the stroke boundary, and releasing it confirms the latest valid fingertip point. The fingertip cursor uses image landmarks and an adaptive One Euro filter for low-latency smoothing. The release frame and any movement after release are excluded from the submitted stroke.

## Browser support

Use a current browser with `getUserMedia`, ES modules, WebAssembly, and WebGL/WASM support. Chromium-based browsers are the primary target for this prototype.

## Recognizer checks

Serve the repository locally, then open <http://localhost:5173/tests/recognizer.test.html> to run the browser-based synthetic stroke checks.
