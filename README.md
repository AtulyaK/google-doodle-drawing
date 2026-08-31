# Doodle Motion

Doodle Motion is a browser prototype for drawing shapes with a fingertip tracked by a camera. It is designed as an original, small game experience inspired by gesture-driven drawing interactions.

## Project journey

- **Initial camera experiment:** Doodle Motion began as a camera-based virtual pen: MediaPipe hand landmarks tracked an index fingertip while the browser captured and recognized drawn symbols.
- **Resilience improvements:** The interaction now uses an explicit Spacebar drawing clutch, pauses and resumes through brief tracking loss, supports finishing a partial stroke, excludes movement after release, and cleans up camera/frame-loop state. Adaptive One Euro smoothing and deterministic geometry checks make recognition less fragile across short, sparse, rotated, or ambiguous strokes.
- **Current prototype:** The app identifies four symbol categories: a line (horizontal, vertical, or diagonal), a V, a circle, and a triangle. Small, incomplete, or ambiguous traces are rejected instead of being presented as confident matches.
- **Creative direction:** The next visual direction is an original drawing experience inspired by the sense of wonder and hand-drawn magic in *Witch Hat Atelier*. That is a direction for the project, not an implemented adaptation.
- **Long-term possibility:** A future **Google Doodle Virtual Drawing** capability could grow this small prototype into a richer, camera-powered doodle experience. That broader capability is not implemented in the current repository.

## Roadmap / next steps

1. Build one original two-stroke sigil: a ring plus a chevron, shown as a normalized virtual stencil with ordered stroke progress.
2. Add a symbol-level finish action that validates the captured strokes together while preserving Spacebar as the stroke clutch.
3. Add a first visual response—a glow/pulse—and a short generated tone for successful sigil completion.
4. Expand into a data-driven library of original sigils, then explore what a broader Google Doodle Virtual Drawing experience should add beyond the current four-symbol prototype.

## Run locally

Camera access requires a secure context. Use localhost rather than opening `index.html` directly:

```powershell
python -m http.server 5173
```

Then open <http://localhost:5173>.

Use `localhost` (or `127.0.0.1`) for camera access. Do not use the LAN IP addresses printed by the server when serving over plain HTTP; browsers block camera access on those origins unless they are configured for HTTPS.
Select **Start camera**, then allow camera permission when your browser prompts. If permission was previously blocked, re-enable it in the browser's site permissions and reload the page.

The first load downloads the MediaPipe hand-landmark runtime and model from their public CDNs. After that, camera frames are processed locally in the browser and are not uploaded by this app.

## How to play

1. Select **Start camera** and grant camera permission.
2. Hold one hand in view, then press and hold **Space** to begin a stroke.
3. Trace any supported shape with your index fingertip while continuing to hold **Space**. Hand roll and tilt do not cancel the stroke.
4. Release **Space** to identify the shape. The release frame and all later movement are excluded, so returning your hand does not draw an extra line.
5. If tracking is lost, keep holding **Space** and move your hand back into view to continue. Select **Finish stroke** to submit the points already captured instead.
6. Draw another shape whenever you want; each clear identification increments the score.

The app identifies four primitive symbol categories with deterministic geometry heuristics: open strokes map to horizontal, vertical, or diagonal lines; open two-leg strokes map to a V; and closed loops are classified as circle or triangle. Very small, incomplete, or ambiguous strokes are rejected so the app can ask for a retry. Brief hand-tracking loss pauses the stroke and allows reacquisition instead of submitting it automatically.

The interaction uses a keyboard clutch rather than a continuously evaluated “index finger up” pose. Holding Space explicitly opens the stroke boundary, and releasing it confirms the latest valid fingertip point. The fingertip cursor uses image landmarks and an adaptive One Euro filter for low-latency smoothing. The release frame and any movement after release are excluded from the submitted stroke.

## Browser support

Use a current browser with `getUserMedia`, ES modules, WebAssembly, and WebGL/WASM support. Chromium-based browsers are the primary target for this prototype.

## Recognizer checks

Serve the repository locally, then open <http://localhost:5173/tests/recognizer.test.html> to run the browser-based synthetic stroke checks.

Open <http://localhost:5173/tests/interaction.test.html> to run the Spacebar hold/release boundary checks.

Open <http://localhost:5173/tests/recognizer.adversarial.test.html> for near-miss and rotated-stroke checks, and <http://localhost:5173/tests/camera-lifecycle.test.html> for stubbed camera/tracking lifecycle checks.

Open <http://localhost:5173/tests/one-euro.test.html> for filter conformance checks, and <http://localhost:5173/tests/one-euro-regression.test.html> for timestamp/reset regressions.

Open <http://localhost:5173/tests/triangle-scale.test.html> for small and sparse triangle recognition checks.

Open <http://localhost:5173/tests/line-speed.test.html> for short-line and open-ended identification coverage through the production camera flow.

Open <http://localhost:5173/tests/line-v-regression.test.html> for filtered short-line and V recognition regressions.
