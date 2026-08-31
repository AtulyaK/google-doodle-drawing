# Witch-Hat Experience Plan

**Status:** Proposal for critique; not an implementation specification
**Working title:** *Glyph Garden*
**Reference boundary:** The broad mood of *Witch Hat Atelier*—wonder, craft, ink, and discovery—without adapting its characters, setting, terminology, or artwork.

## Product premise

*Glyph Garden* is a short, browser-based drawing game in which a player traces original alchemy glyphs to bring small imagined objects to life. A camera can turn the player's index fingertip into a pen, while pointer and keyboard modes make the same game playable without a camera.

The game should feel like practicing a beautiful craft, not passing a handwriting exam: the virtual stencil gives structure, but forgiving geometry and expressive feedback reward a clear intent. Every sigil should also explain its meaning so completion feels like discovery rather than a score event.

## What exists now vs. what is proposed

### Implemented current behavior: Doodle Motion

- The app is a **camera-powered drawing practice** with a live canvas and camera preview.
- A player starts the camera, holds **Space** as a drawing clutch, traces with an index fingertip, and releases Space to submit one stroke.
- The current recognizer identifies four primitive categories: a horizontal, vertical, or diagonal **line**, **V**, **circle**, and **triangle**.
- Small, incomplete, or ambiguous strokes are rejected. A **Finish stroke** button submits captured points during drawing or after tracking pauses.
- Brief tracking loss pauses drawing and can resume while Space remains held. The release frame and movement after release are excluded.
- Successful identifications increment a score. Hand tracking runs in the browser; the README states that camera frames are not uploaded.
- Current terminology includes `idle`, `ready`, `drawing`, `paused`, and `submitted` phases.

### Proposed features in this plan

- A named original world and art direction, virtual stencils, recipes, multi-stroke glyphs, progression, rewards, replay modes, and non-camera input.
- A glyph layer that composes the four existing primitive recognitions into meaningful alchemy components.
- These are design proposals only; they do not describe implemented behavior.

## Target audience

Primary players are curious teens and adults who enjoy short creative browser games, gesture interaction, and illustrated fantasy. The presentation should remain family-friendly, with no account, chat, ads, or frightening content required for the core experience.

## Player fantasy

“I am an apprentice inscriber. With a steady hand and a little experimentation, I can draw a symbol that makes an ordinary object useful or magical.”

The fantasy is expressed through the player's hand, the ink, and the transformation—not through borrowed characters or lore.

## Core loop

1. Choose a recipe or accept the next lesson.
2. Inspect a virtual stencil showing the glyph's components, order, and optional direction hints.
3. Start a component with the camera fingertip, pointer, touch, or keyboard cursor.
4. Trace one component and finish that stroke.
5. Receive immediate clarity feedback; retry only the current component when possible.
6. Complete the ordered components to assemble the glyph.
7. Watch the original object response, earn a small reward, and choose another recipe or replay the same one.

The first successful glyph should take about 60–90 seconds for a new player, including the explanation.

## Virtual stencil interaction

The stencil is a translucent guide over the drawing stage:

- A faint path shows the current component; completed components become inked and locked.
- A small marker indicates the suggested start zone and direction, but a player can begin elsewhere if the shape remains recognizable.
- Locked, current, and upcoming components use labels and texture as well as color.
- The stencil scales to the stage's normalized coordinate space, so a glyph remains legible across camera resolutions and aspect ratios.
- The guide should be forgiving: it communicates the intended gesture without requiring pixel-perfect tracing.
- A “show less guidance” toggle can hide direction arrows and leave only the component outline for replay.

## Evolving the four symbols into alchemy glyph components

The existing recognizer remains a low-level shape detector. A recipe layer gives each accepted primitive an original role:

| Current primitive | Proposed component name | Role in a recipe |
| --- | --- | --- |
| Line (horizontal, vertical, or diagonal) | **Ray** | Sets direction, connects anchors, or divides a field. |
| V | **Fork** | Splits or gathers energy at a deliberate point. |
| Circle | **Vessel** | Contains, seals, or focuses an effect. |
| Triangle | **Apex** | Provides a point of emphasis or transformation. |

Orientation, scale, order, and combination—not the primitive alone—give a recipe its identity. For example, a Vessel followed by a diagonal Ray could make an original “lantern seed” glyph, while a Fork inside an Apex could make a “sprout” glyph. Names and examples are placeholders for critique.

## Multi-stroke completion

- A glyph contains **1–4 ordered components**; each component is one stroke.
- The player finishes each stroke with Space release, a pointer/touch release, Enter, or the on-screen **Finish stroke** action.
- The current component is validated before advancing. A failed component keeps the earlier components and offers a focused retry.
- A glyph completes automatically when every component is accepted in order and within the stencil's broad placement/orientation tolerance.
- Repeated components are allowed when the recipe makes their order or orientation distinct.
- The final accepted stroke validates the captured component set together; the basic flow does not add a separate symbol-level finish button.

## Feedback and reward

### Immediate feedback

- Ink follows the cursor with a visible active state.
- Valid components brighten, pulse once, and remain visible as the player's work.
- A near miss shows a specific, non-judgmental hint such as “make the loop larger” or “try the fork's two legs.”
- Tracking loss pauses rather than silently failing; the player can reacquire the hand or finish the captured stroke.
- Successful glyph completion uses a short original visual transformation and an optional generated tone. A glyph may also have an original ambient bed, such as a quiet creek-like texture; audio is never required to understand success.

### Rewards

- Award a completion mark for the glyph and optional clarity stars for fewer retries, not for speed alone.
- Unlock a small palette, stencil variation, or object vignette after a lesson set.
- Keep the current score concept for quick feedback, but make the proposed reward name and meaning explicit; a score should not imply competitive ranking.

## Progression

1. **Foundations:** one-component recipes using each primitive once.
2. **Weaving:** two-component recipes with order and orientation.
3. **Binding:** three- and four-component recipes with one optional repeated primitive.
4. **Free atelier:** replay unlocked recipes with reduced guidance and randomized presentation.

Progression should unlock through demonstrated understanding, not grinding. A player can replay every unlocked recipe immediately and can enter a no-score practice mode at any time.

## Replayability

- Randomize the presentation order and harmless visual palette variations while keeping recognition fair.
- Offer a daily, locally seeded “practice set” without a server or leaderboard.
- Track local bests such as fewest retries and clean completions; make clearing them one action.
- Include a free-draw mode that shows which primitive component the recognizer sees, without requiring a recipe.
- Rotate optional guidance: full stencil, outline only, and memory mode.

## Accessibility and keyboard fallback

Camera use is optional, not an accessibility requirement.

- Every control is keyboard reachable with visible focus, a clear status region, and no color-only state.
- Retain Space as the current stroke clutch; avoid starting a stroke from repeated keydown events.
- Pointer and touch drawing provide a direct non-camera path.
- A keyboard trace mode moves a large, high-contrast cursor along a quantized grid with arrow keys; Space starts/stops the trace and Enter submits the component. It has no timing requirement.
- Provide a “reduced motion” mode, captions for sounds, adjustable guide contrast/size, and a setting to disable audio.
- Announce component state, retries, completion, and tracking loss through an `aria-live` status message.
- Do not require simultaneous key holds beyond the documented drawing action; support remapping where practical.

## Privacy

Proposed default:

- Camera is off until the player explicitly selects **Start camera** and grants permission.
- Hand landmark inference and stroke recognition stay on-device. No camera frames, hand landmarks, voice, or biometric profile are uploaded or stored.
- No account, analytics, ad SDK, social graph, or leaderboard is needed for MVP.
- Progress and settings may be stored locally only, with a visible **Clear local data** action.
- Explain that the current prototype downloads the MediaPipe runtime/model from public CDNs on first load; a production version should document, pin, and review those dependencies.
- Stop the stream on navigation, reset, camera disconnect, or explicit stop.

## Mobile and camera constraints

- Support current Chromium-based browsers first, with `getUserMedia`, WebAssembly, and WebGL/WASM support.
- Camera mode requires localhost or HTTPS, requests video without audio, and should use the front-facing camera with `playsinline`.
- Design for portrait and landscape, with a minimum usable stage rather than assuming a 16:9 display.
- Show a short setup check for lighting, hand distance, and fingertip visibility. Keep the hand cursor and stencil legible on a small screen.
- Mobile players should use touch/pointer mode when camera permission is unavailable, undesirable, or too costly for the device.
- Treat dropped frames and brief tracking loss as recoverable. Do not submit a stroke solely because one camera frame is missed.
- MVP performance target: maintain a responsive cursor and avoid blocking the main thread during normal camera play on a mid-range phone.

## Originality and copyright boundaries

- Use mood-level references only: handmade wonder, ink, apprenticeship, careful practice, and transformation.
- Do not use the reference's characters, names, setting, terminology, plot, costumes, panel layouts, recognizable glyphs, or copied compositions.
- Create a distinct product name, symbol vocabulary, UI, object designs, animation language, and sound palette.
- Treat “alchemy glyph” as a generic design premise; every glyph arrangement and finished artwork must be newly authored.
- Keep a short asset provenance record for commissioned, generated, or licensed art and sound.
- Do not market the game as an adaptation, official companion, or branded experience. A legal review should approve final public-facing copy before release.

## MVP and non-goals

### MVP

- One polished original two-stroke glyph and three simpler practice glyphs.
- Virtual stencil with component order, start/direction hint, progress state, and focused retry.
- Camera fingertip input using the current Spacebar clutch plus pointer/touch and keyboard fallback.
- Symbol-level completion, one clear success animation, readable retry feedback, and a local completion count.
- Camera-off-by-default behavior, local-only processing, reduced-motion option, and keyboard-navigable controls.
- A small test script or playtest checklist covering camera loss, release boundaries, mobile layout, and non-camera completion.

### Non-goals

- A *Witch Hat Atelier* adaptation or use of its intellectual property.
- Accounts, cloud saves, social sharing, public leaderboards, ads, purchases, or behavioral analytics.
- Full handwriting recognition, arbitrary spell authoring, multiplayer, 3D/AR effects, or a large narrative campaign.
- Requiring a camera, audio, precise timing, or a specific browser/device for completion.

## Staged roadmap

### Stage 0 — Critique and alignment

Resolve the open questions below, approve the original art direction, and define the first four recipes. **Exit measure:** one-page recipe sheet with component order, tolerance intent, feedback copy, and originality review.

### Stage 1 — Tracer bullet

Turn the README's ring-plus-chevron direction into one original two-stroke recipe with a normalized stencil, ordered progress, automatic completion, and a visible meaning. **Exit measure:** at least 8 of 10 first-time playtesters complete it within three attempts using camera or pointer input.

### Stage 2 — Playable lesson set

Add three practice recipes, focused retries, success animation, optional tone, keyboard trace mode, and touch/pointer parity. **Exit measure:** median time to first completion is under 90 seconds; all four input paths can complete at least one recipe.

### Stage 3 — Atelier progression

Add unlocks, local bests, reduced-guidance replay, free draw, and a locally seeded practice set. **Exit measure:** in a 10-minute session, at least 70% of playtesters choose to replay or try a second recipe without prompting.

### Stage 4 — Device and release hardening

Tune stage sizing, tracking-loss recovery, dependency loading, accessibility copy, and original assets across supported browsers and representative phones. **Exit measure:** no critical camera-permission, keyboard-navigation, or privacy-boundary defect remains in the release checklist.

## Success criteria

- At least 80% of first-time testers understand the first stroke without live coaching.
- At least 80% complete the first two-stroke glyph within three attempts in normal lighting.
- The same recipe is completable without camera access, audio, or color discrimination.
- All game actions and state changes are reachable and understandable from keyboard and screen-reader status text.
- Camera frames and landmarks remain local in the shipped experience; no account or telemetry is required for core play.
- A reviewer can distinguish every shipped symbol, asset, and name from the reference work without relying on that work's terminology.

## Open design questions for critique

1. Is *Glyph Garden* a useful working title, or should the product lean more toward “atelier,” “garden,” “workshop,” or a wholly different metaphor?
2. Should the camera be the headline interaction, or should pointer/touch mode be equally prominent from the first screen?
3. Is a forgiving stencil more magical, or does it remove too much mastery? Where should the tolerance sit between intent and precision?
4. Should a failed component consume a limited resource, reduce a star, or simply invite another attempt?
5. Do “Ray / Fork / Vessel / Apex” communicate the component roles, or should the vocabulary be less technical?
6. Is progression better as a short lesson path, a recipe shelf, or a world map without narrative characters?
7. Should rewards emphasize completion, clarity, experimentation, or a combination?
8. Is a daily locally seeded set worthwhile without sharing or a leaderboard?
9. What level of sound, haptic feedback, or camera setup guidance is appropriate for a quiet public-space game?
10. Which mobile browsers and low-end devices are release-blocking targets?
11. Should local progress be opt-in, automatic with a clear reset action, or omitted from MVP?
12. What final review process should approve art, names, and marketing copy against the originality boundary?
