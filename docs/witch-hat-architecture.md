# Browser Alchemy Stencil: Architecture Proposal

**Status:** critique-ready proposal; no implementation is included here.  
**Scope:** extend the existing Doodle Motion static ES-module app into an original,
camera-powered alchemy-stencil experience.  
**Non-goal:** reproduce any protected characters, artwork, terminology, or story from
another work. The visual direction may share a sense of hand-drawn wonder, but every
sigil and effect must be original.

## How to read this document

- **Implemented** means verified in the current repository.
- **Proposed** means a design target, not a promise that the code already supports it.
- **Decision for critique** identifies a choice that should be confirmed before coding.
- Product ideation is intentionally separated from the technical design below.

## Product ideation boundary

The product idea is a short guided ritual:

1. The camera shows the player's mirrored hand and a faint original sigil stencil.
2. The player holds Space while tracing one stroke.
3. Releasing Space commits that stroke and advances the stencil.
4. A complete sigil produces a restrained glow and optional generated tone.
5. A miss explains what to retry without storing the drawing or camera feed.

The first content slice should be one two-stroke **ring plus chevron** sigil. It is
small enough to teach the interaction and broad enough to prove ordered composition,
normalization, progress, rendering, and effects. A larger library, narrative framing,
particles, music, accounts, sharing, and multiplayer are product ideas only; none is
required by this architecture.

Open product questions:

- Is the first sigil orientation-locked, or may the player rotate it?
- Should the last stroke auto-submit, or should the player explicitly choose
  **Finish sigil**?
- Should a failed stroke reset the whole attempt, or allow replacing only the failed
  stroke?
- Is a non-camera keyboard/pointer practice mode a launch requirement?

## 1. Current baseline and constraints

### Implemented baseline

The current app is a static page with browser-native ES modules and no build step:

| Area | Current behavior |
| --- | --- |
| Camera | `getUserMedia({ audio: false, video: ... })`, one MediaPipe `HandLandmarker`, CPU delegate, one hand |
| Coordinate path | Mirrored video, normalized fingertip landmark 8 mapped into the stage rectangle |
| Smoothing | `VectorOneEuroFilter`, production settings `minCutoff: 1.1`, `beta: 0.08` |
| Capture gate | `createSpacebarClutch`; Space keydown starts and keyup/blur/manual finish ends a stroke |
| Capture resilience | 220 ms stale-frame grace, paused/recovery state, bounded point bridging across short gaps |
| State | `idle`, `ready`, `drawing`, `paused`, `submitted` in `src/main.js` |
| Recognition | Pure deterministic heuristics for line, V, circle, and triangle in `src/recognizer.js` |
| Recognition preparation | finite-point sanitization, near-duplicate collapse, 64-point resampling, simplification, geometry metrics |
| Rendering | One canvas over the video for the orange live stroke and cursor; SVG previews in the challenge card |
| Privacy | Camera frames and inference stay in the tab; tracks stop on page hide/disconnect; no app persistence |
| Verification | Browser fixtures cover recognizer geometry, adversarial cases, Space boundaries, camera lifecycle, filter equations/regressions, short lines, and sparse triangles |

The recognizer already exposes a `normalize` helper internally, but it is not yet a
template matcher. Current thresholds are pixel- and shape-specific: for example,
five points are required, non-line shapes generally need a 24 px diagonal, and
confidence thresholds range from 0.70 to 0.78.

### Constraints to preserve

1. Remain deployable as a static site with relative module imports.
2. Keep camera inference local and do not upload frames, landmarks, or drawings.
3. Preserve Space as an explicit stroke boundary; do not infer pen-up from an
   unreliable hand pose.
4. Keep deterministic pure seams so browser fixtures can run without real hardware.
5. Prefer the existing MediaPipe and One Euro path over a new model or build system.
6. Treat original content as data, not as copied artwork or hidden product logic.
7. Make failure and permission states understandable without relying on audio or color.

## 2. Proposed bounded modules

The following boundaries are proposed. They can initially be files in `src/`; they do
not require a framework or dependency injection container.

| Module | Responsibility | Does not own |
| --- | --- | --- |
| `camera-session.js` | Permission, stream, video readiness, hand-landmarker lifecycle, frame scheduling | Game rules, DOM copy |
| `pointer-tracker.js` | Landmark 8 to stage coordinates, mirroring transform, One Euro filtering, gap policy | Stroke completion |
| `spacebar-clutch.js` | Existing keyboard boundary primitive | Sigil matching or score |
| `capture-session.js` | Pure reducer/model for attempts, active stroke, completed strokes, pause/recovery, and finish actions | Camera APIs, canvas drawing |
| `sigil-templates.js` | Versioned original normalized template data and derived metadata | Captured user state |
| `sigil-matcher.js` | Normalize/resample captured strokes and score one stroke or a composition | UI feedback, effects |
| `stencil-renderer.js` | Draw ghost, progress, live stroke, cursor, and completion state in a defined order | Camera inference, audio |
| `feedback-presenter.js` | DOM status, instructions, score, `aria-live` announcements | Geometry decisions |
| `effects.js` | CSS class events and optional Web Audio tones | Match thresholds or rendering |
| `main.js` | Composition root: wires adapters, reducer, renderer, presenter, and lifecycle | Large algorithms |

**Migration note:** extracting these boundaries does not require changing behavior in
one release. The first extraction can wrap the existing `main.js` functions and keep
the existing DOM IDs. `recognizer.js`, `one-euro-filter.js`, and
`spacebar-clutch.js` are already useful seams.

## 3. Template data model

Templates should be original, reviewable data in a module such as
`src/sigil-templates.js`. Coordinates are normalized to a unit square, independent
of camera resolution, CSS pixels, and device pixel ratio.

```js
export const SIGILS = [
  {
    id: "ring-chevron-01",
    version: 1,
    name: "First Binding",
    coordinateSpace: "unit-square",
    orientation: "locked", // proposed policy, not matcher behavior yet
    strokes: [
      {
        id: "ring",
        order: 0,
        role: "anchor",
        closed: true,
        direction: "agnostic",
        points: [
          { x: 0.18, y: 0.48 },
          // ... original, normalized control samples
        ],
        weight: 0.55,
      },
      {
        id: "chevron",
        order: 1,
        role: "completion",
        closed: false,
        direction: "forward",
        points: [
          { x: 0.38, y: 0.30 },
          { x: 0.50, y: 0.70 },
          { x: 0.62, y: 0.30 },
        ],
        weight: 0.45,
      },
    ],
    composition: {
      order: "strict",
      maxStrokeCount: 2,
      preserveRelativePlacement: true,
    },
    style: {
      guideColor: "#c4b5fd",
      completionColor: "#34d399",
    },
    provenance: "original project artwork",
  },
];
```

The exact points, name, and style are proposed content and need product/art review.
Template metadata should include:

- stable `id` and incrementing `version`;
- stroke order, closure, direction, and semantic role;
- normalized points plus precomputed path length and bounding box;
- matching policy (strict order, placement preservation, rotation policy);
- provenance stating that the asset is original;
- no user data, camera frames, or generated runtime state.

Captured strokes should remain a separate runtime model:

```js
{
  points: [{ x, y, t }],
  startedAt,
  endedAt,
  finishReason: "release" | "blur" | "manual",
  trackingRecoveries: 0
}
```

`x` and `y` are stage coordinates; `t` is used for diagnostics and gap handling, not
as a handwriting signature. The matcher receives points without timestamps.

## 4. Capture and state-machine flow

### Proposed state model

Keep the camera lifecycle separate from the composition lifecycle. A minimal
composition state can be represented as:

```text
ready
  └─ Space down ─> drawing
drawing
  ├─ tracking lost ─> paused
  ├─ tracking recovered ─> drawing
  └─ Space up / Finish current stroke ─> stroke-committed
paused
  ├─ tracking recovered ─> drawing
  └─ Finish current stroke ─> stroke-committed
stroke-committed
  ├─ more strokes expected ─> ready-for-next-stroke
  └─ Finish sigil ─> matching
matching
  ├─ pass ─> success
  └─ fail ─> retry
success / retry
  └─ Reset or new attempt ─> ready
```

`idle` and camera failure remain the outer lifecycle states already represented in
`main.js`. A `CaptureSession` reducer should emit semantic events such as
`strokeStarted`, `trackingPaused`, `strokeCommitted`, `sigilFinished`, `matched`, and
`rejected`; the presenter and effects module subscribe without inspecting geometry.

### Single versus multi-stroke boundaries

One Space hold is exactly one stroke. Releasing Space is an intentional boundary;
tracking loss is not a boundary. This preserves the current, tested rule that
movement after release cannot leak into the submitted stroke.

For a multi-stroke sigil:

1. Release (or manual finish) commits the active stroke to the attempt.
2. The attempt retains committed strokes and prompts for the next ordered stroke.
3. A second Space hold starts a new stroke; it never silently appends to the prior one.
4. **Finish sigil** validates the composition. A failed composition can reset the
   attempt, unless product review chooses per-stroke replacement.

This intentionally does not segment multiple strokes from a single Space hold. The
camera cannot reliably distinguish a deliberate pen lift from a tracking pause.
Single-stroke templates use the same semantics; they may offer an optional
auto-finish policy only after the boundary behavior is proven.

## 5. Matching strategy and tolerances

The first matcher should extend the current deterministic geometry approach rather
than replace it with ML.

### Pipeline

1. Reject invalid points and fewer than the existing five samples.
2. Split by explicit stroke boundary; never infer stroke count from point gaps.
3. Resample each user stroke to the template's sample count (for example, 32 open
   points and 48 closed points).
4. Normalize the complete attempt by a uniform scale and translation derived from
   its union bounding box. Preserve aspect ratio and relative stroke placement.
5. For closed strokes, allow cyclic starting-point alignment. Keep ring direction
   agnostic; keep chevron direction forward unless review decides otherwise.
6. Score each ordered pair using normalized point distance, path-length ratio,
   closure, corner/turn structure, and relative placement.
7. Combine stroke scores using template weights. Return the best template,
   confidence, per-stroke scores, and a rejection reason.
8. Reject below threshold or when the best and second-best candidates are too close;
   never present an ambiguous match as success.

### Initial calibration targets (proposed)

These are starting values for fixtures, not final UX promises:

| Signal | Initial target |
| --- | --- |
| Minimum stroke samples | Preserve `5` for compatibility; require more for a closed ring if the fixture shows noise |
| Uniform scale | Accept roughly 0.6–1.6 relative to the stencil |
| Global placement | Union-box translation error at most about 0.12 of normalized diagonal |
| Orientation | Locked first; optionally test ±15° only after a rotated fixture exists |
| Ring closure | Normalized endpoint gap at most about 0.12 |
| Point fit | Mean normalized RMS distance at most about 0.16, with a looser max-distance guard |
| Composition confidence | Start near `0.72`; tune from false-positive and near-miss fixtures |
| Ambiguity margin | Require the winner to exceed the runner-up by about `0.08` |
| Inter-stroke wait | No geometry penalty for a short pause; optionally expire an abandoned attempt after a visible, generous timeout |

The current pixel thresholds remain valid for the four-symbol identification mode
until the new matcher has independent coverage. Do not silently reuse current
circle/triangle thresholds as sigil tolerances: normalized composition matching has
different failure modes.

## 6. Stencil and rendering layers

The current implementation has one canvas that draws the live orange stroke and
cursor over the mirrored `<video>`, plus SVG previews in the sidebar. The proposed
render model has explicit conceptual layers:

1. **Camera layer** — existing video element.
2. **Stencil layer** — faint original template paths, inactive strokes muted.
3. **Progress layer** — completed strokes, current expected stroke, labels or markers.
4. **Live input layer** — filtered captured points and cursor.
5. **Feedback layer** — transient glow/pulse or rejection treatment.
6. **DOM accessibility layer** — status text, instructions, progress list, and
   controls that do not depend on pixels.

For the first migration, keep one canvas and draw in this order; a renderer model
can still keep the layers separate. Split into multiple canvases or SVG only if
profiling shows that independent invalidation matters. All layers must use one
shared stage transform so the mirrored camera, stencil, and captured point cannot
drift apart.

Rendering rules:

- Draw the ghost in a low-contrast style distinct from the captured stroke.
- Do not hide the target after an error; show the expected stroke and a textual
  retry message.
- Use CSS classes for short state pulses rather than rendering a permanent
  screenshot or storing the user's path.
- Cap device-pixel-ratio backing dimensions to avoid oversized canvases on dense
  displays.

## 7. Effects and audio

`effects.js` should consume semantic events, not matcher internals:

- `strokeCommitted`: small progress accent;
- `matched`: CSS glow/pulse and optional short oscillator tone;
- `rejected`: restrained shake/fade only when reduced motion is not requested;
- camera/tracking failure: no celebratory effects.

Use Web Audio only after a user gesture, create no remote audio asset, and expose a
mute control. Respect `prefers-reduced-motion`; audio preference is independent of
motion preference. The effect sink must tolerate AudioContext creation being blocked
or unavailable and must never turn a successful match into an error.

## 8. Accessibility and privacy

### Accessibility

Implemented controls already have buttons, focus-visible styling, status text, and
an `aria-live` feedback panel. The proposed flow should add:

- a clearly named **Finish current stroke** and **Finish sigil** action;
- an ordered progress list whose text mirrors the stencil state;
- announcements such as “Stroke 1 of 2 captured” and “Sigil not recognized”;
- a visible non-color distinction for active, complete, paused, and rejected states;
- reduced-motion behavior and no audio-only success signal;
- a keyboard/pointer practice seam for automated tests and a considered fallback for
  people who cannot use a camera gesture.

The camera preview can remain visual, but instructions and result state must be
usable without interpreting the canvas. Do not claim camera-gesture parity is fully
accessible until the fallback decision is made.

### Privacy

Preserve the current local-only contract:

- request `audio: false`;
- never upload frames, landmarks, templates derived from users, or drawings;
- stop tracks and close the landmarker on page hide, reset, disconnect, and teardown;
- keep no localStorage/IndexedDB history in the first version;
- disclose that the MediaPipe runtime/model is downloaded from external CDNs, while
  inference remains in-browser;
- avoid analytics that could turn a drawing attempt into identifying telemetry.

If persistence or sharing is later proposed, it is a separate privacy review, not a
small extension of this architecture.

## 9. Test seams and fixtures

The repository's browser fixtures are the primary contract today:

- `recognizer.test.html` — ordinary lines, V shapes, circles, triangles, rotations,
  sparse and rejected paths;
- `recognizer.adversarial.test.html` — near misses, closure gaps, scribbles, and
  orientation boundaries;
- `interaction.test.html` — Space boundaries, repeat keydown, blur, recovery, and
  manual finish;
- `camera-lifecycle.test.html` — stubbed camera/model, stale frames, disconnect and
  cleanup;
- `one-euro.test.html` and `one-euro-regression.test.html` — reference equations,
  irregular timestamps, reset, and vector independence;
- `triangle-scale.test.html`, `line-speed.test.html`, and
  `line-v-regression.test.html` — small, sparse, filtered, and production-flow
  regressions.

Keep all of these unchanged while introducing the new path. Add focused fixtures
only for new pure seams:

| Proposed fixture | Contract |
| --- | --- |
| `sigil-matcher.test.html` | Original ring/chevron positives under translation, scale, jitter, and permitted direction; near-miss and ambiguity negatives |
| `capture-session.test.html` | Ordered multi-stroke boundaries, pause/recovery, finish actions, reset, and no post-release leakage |
| `stencil-model.test.html` | Expected layer commands/progress semantics, independent of canvas pixels |
| `effects.test.html` | CSS event names, reduced-motion behavior, fake AudioContext/mute handling |
| `template-data.test.html` | Unit-square bounds, unique IDs/versions, declared order, and original-content metadata |

Use synthetic point arrays, not recorded faces or camera video. Keep the MediaPipe
import-map stubs and `getUserMedia` fakes at the existing integration boundary.

## 10. Failure modes and responses

| Failure | State/response |
| --- | --- |
| Insecure origin, denied permission, missing API, CDN/model failure | Remain idle; explain the fix; never enter drawing |
| Camera track ends | Stop loop, close landmarker, clear capture, restore start action (existing behavior) |
| No hand or stale frame | Pause while Space remains held; allow recovery or manual finish |
| Tiny, sparse, or noisy stroke | Commit boundary safely, reject with a concrete retry hint; do not award progress |
| Wrong stroke order/count | Reject composition; identify the expected stroke; use the selected reset/replacement policy |
| Ambiguous top candidates | Reject as unclear rather than guessing |
| Mirroring or aspect mismatch | Centralize transform and cover with fixture coordinates before content expansion |
| User abandons an attempt | Make reset explicit; optionally expire only after a documented timeout |
| Audio blocked or reduced motion enabled | Complete silently/without motion; feedback remains textual and visual |

## 11. Performance

The current loop already processes only a new video timestamp and tracks one hand.
The proposed path should retain that budget:

- keep `numHands: 1` and CPU inference until measurement justifies a delegate change;
- precompute template resampling, bounds, and derived metrics at module load;
- perform matching on stroke commit, not every animation frame;
- keep live rendering to one scheduled redraw per frame and avoid effect timers per
  point;
- bound bridge insertion and stroke length to prevent pathological memory growth;
- cap canvas backing scale and release camera/model resources deterministically;
- avoid persistence and network work during capture.

The matcher is linear in captured sample count times template count. A small
data-driven library is acceptable; if the library grows materially, index by stroke
count/closure before considering a more complex recognizer.

## 12. Staged migration

1. **Pure seams, no UX change.** Extract a capture reducer and a shared coordinate
   transform around the current `main.js`; keep existing shape identification and
   all fixtures green.
2. **Template and matcher slice.** Add one original normalized ring/chevron template,
   matcher diagnostics, and deterministic positive/negative fixtures. Run it behind
   an explicit mode or local flag; do not replace the four-shape baseline yet.
3. **Guided stencil UI.** Add ordered progress, stencil rendering, current-stroke
   finish semantics, and symbol-level Finish sigil while preserving Space behavior.
4. **Semantic effects and accessibility polish.** Add CSS pulse, optional generated
   tone, mute/reduced-motion behavior, progress announcements, and failure copy.
5. **Content expansion only after measurement.** Add more original templates from the
   same schema, calibrate tolerances with fixture data, and decide whether a
   keyboard/pointer practice mode is product-required.

Do not combine a matcher rewrite, visual redesign, audio, and camera lifecycle
refactor in one change. Each stage should leave the current app runnable and
deterministically testable.

## 13. Explicit tradeoffs

| Choice | Benefit | Cost / risk | Proposed default |
| --- | --- | --- | --- |
| Deterministic templates over ML | Local, explainable, fixture-friendly, small | Less tolerant of radically varied handwriting | Choose deterministic first |
| Strict Space boundaries over pose segmentation | Predictable and already tested | Requires two deliberate holds for two strokes | Keep strict boundaries |
| Strict stroke order | Teaches a reproducible ritual and simplifies matching | Less forgiving and less replayable | Use for first sigil |
| Normalized point paths over only SVG paths | Captures stroke order/direction and supports matching | Requires calibration data and metadata | Store both render/match intent in one schema |
| Orientation locked initially | Avoids rotation/placement false positives | Less expressive | Lock first; add tested rotation later |
| One canvas with conceptual layers | Minimal DOM and migration risk | More redraw work | Start here; split only after profiling |
| Generated tone over audio asset | No asset licensing or network dependency | Browser audio policy and less musical richness | Optional short tone |
| No persistence | Strong privacy and simple lifecycle | No progress history or personalization | Keep for first version |
| Explicit Finish sigil | Prevents accidental early composition submission | Adds one control and one decision | Prefer for multi-stroke first slice |

## Critique checklist

Before implementation, confirm:

1. The ring/chevron content is original and approved as the first sigil.
2. Strict order and Space-release boundaries are acceptable.
3. Orientation is locked for the first slice.
4. Multi-stroke attempts use explicit **Finish sigil** rather than auto-submit.
5. A failed composition resets the attempt (or the replacement policy is specified).
6. Generated audio is optional and muted independently from reduced motion.
7. No persistence, telemetry, or remote frame processing is desired.
8. The existing four-shape mode should remain available during migration or be
   replaced once the sigil slice is validated.

