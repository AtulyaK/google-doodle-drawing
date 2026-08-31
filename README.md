# Doodle Motion

Doodle Motion is a browser prototype for drawing shapes with a fingertip tracked by a camera. It is designed as an original, small game experience inspired by gesture-driven drawing interactions.

## Project journey

- **Initial camera experiment:** Doodle Motion began as a camera-based virtual pen: MediaPipe hand landmarks tracked an index fingertip while the browser captured and recognized drawn symbols.
- **Resilience improvements:** The interaction now uses an explicit Spacebar drawing clutch, pauses and resumes through brief tracking loss, supports finishing a partial stroke, excludes movement after release, and cleans up camera/frame-loop state. Adaptive One Euro smoothing and deterministic geometry checks make recognition less fragile across short, sparse, rotated, or ambiguous strokes.
- **Current prototype:** The app now guides the player through one original two-stroke sigil, **First Binding**: a vessel ring followed by an apex mark. A normalized matcher allows ordinary variation in size, position, noise, and stroke direction while still rejecting incomplete or clearly wrong marks. Completing the sigil explains its meaning, plays a cue when ambience is enabled, and automatically resets the drawing flow for another attempt. The earlier line, V, circle, and triangle recognizer remains the regression reference.
- **Creative direction:** The experience is inspired by the sense of wonder and hand-drawn magic in *Witch Hat Atelier*, without adapting its characters, setting, terminology, artwork, or story.
- **Long-term possibility:** A future **Google Doodle Virtual Drawing** capability could grow this small prototype into a richer, camera-powered doodle experience. That broader capability is not implemented in the current repository.

## Roadmap / next steps

1. Playtest and tune First Binding with a real camera across ordinary lighting, hand angles, and browser sizes.
2. Add pointer/touch and keyboard practice paths with the same matcher and completion rules.
3. Add a small set of original sigils only after the first one is reliable and fun.
4. Explore what a broader Google Doodle Virtual Drawing experience should add beyond the current guided stencil.

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
2. Hold one hand in view, then press and hold **Space** to begin the highlighted stroke.
3. Trace the vessel ring with your index fingertip, then release **Space** to inscribe it.
4. Trace the apex mark as the second stroke and release **Space** again.
5. After the second stroke, the sigil completes automatically. A close attempt is accepted; an egregious miss gets a focused retry hint.
6. If tracking is lost, keep holding **Space** and move your hand back into view, or select **Finish stroke** to submit the points already captured.

The current matcher compares each stroke to a normalized original template. It allows reasonable variation in scale, placement, noise, and direction, but rejects short, open, straight, or widely separated marks. Brief hand-tracking loss pauses the stroke and allows reacquisition instead of submitting it automatically.

Select **Enable ambience** for an original, procedural creek-like texture and quiet drone. Select **Mute ambience** at any time; audio is optional and uses no downloaded music assets.

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

Open <http://localhost:5173/tests/sigil-matcher.test.html> for forgiving First Binding matching and egregious-miss rejection checks.

Open <http://localhost:5173/tests/capture-session.test.html> for ordered multi-stroke and Spacebar boundary checks.

Open <http://localhost:5173/tests/ambient-audio.test.html> for audio availability, ambience, mute, and completion-cue checks.
