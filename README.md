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
3. Trace the requested shape in the air.
4. Lower your index finger briefly to submit the stroke.
5. Complete the line, circle, and triangle challenges.

The first prototype recognizes shapes with deterministic geometry heuristics. Very small, incomplete, or ambiguous strokes are rejected so the game can ask for a retry.

## Browser support

Use a current browser with `getUserMedia`, ES modules, WebAssembly, and WebGL/WASM support. Chromium-based browsers are the primary target for this prototype.

## Recognizer checks

Serve the repository locally, then open <http://localhost:5173/tests/recognizer.test.html> to run the browser-based synthetic stroke checks.
