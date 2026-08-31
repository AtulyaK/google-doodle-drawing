const DEFAULT_DURATION_MS = 3600;
const REDUCED_MOTION_DURATION_MS = 1200;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

let instanceCount = 0;

function finiteDuration(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function svgElement(documentRef, name, attributes = {}) {
  const element = documentRef.createElementNS(SVG_NAMESPACE, name);
  Object.entries(attributes).forEach(([attribute, value]) => {
    element.setAttribute(attribute, value);
  });
  return element;
}

function appendStreamArtwork(documentRef, streamId) {
  const svg = svgElement(documentRef, "svg", {
    viewBox: "0 0 520 180",
    preserveAspectRatio: "none",
    "aria-hidden": "true",
    focusable: "false",
  });
  svg.style.cssText =
    "position:absolute;top:23%;left:0;width:78%;height:56%;overflow:visible;" +
    "filter:drop-shadow(0 0 12px rgba(34,211,238,.72));will-change:transform,opacity;";

  const defs = svgElement(documentRef, "defs");
  const gradient = svgElement(documentRef, "linearGradient", {
    id: streamId,
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "0",
  });
  [
    ["0%", "#67e8f9"],
    ["45%", "#0ea5e9"],
    ["75%", "#38bdf8"],
    ["100%", "#cffafe"],
  ].forEach(([offset, color]) => {
    gradient.append(svgElement(documentRef, "stop", { offset, "stop-color": color }));
  });
  defs.append(gradient);
  svg.append(defs);

  const body = svgElement(documentRef, "path", {
    d: "M-54 116 C22 58 76 145 147 99 C216 54 269 148 340 93 C405 43 465 118 555 78 L555 126 C468 161 410 93 339 143 C267 190 209 97 144 148 C69 196 19 112 -54 165 Z",
    fill: `url(#${streamId})`,
    opacity: ".86",
  });
  const edge = svgElement(documentRef, "path", {
    d: "M-54 116 C22 58 76 145 147 99 C216 54 269 148 340 93 C405 43 465 118 555 78",
    fill: "none",
    stroke: "#cffafe",
    "stroke-width": "8",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    opacity: ".95",
  });
  const current = svgElement(documentRef, "path", {
    d: "M-42 145 C28 104 83 178 149 130 C222 78 274 173 344 119 C421 62 473 139 548 104",
    fill: "none",
    stroke: "#a5f3fc",
    "stroke-width": "4",
    "stroke-linecap": "round",
    "stroke-dasharray": "18 16",
    opacity: ".9",
  });
  const foam = svgElement(documentRef, "path", {
    d: "M-35 124 C35 82 83 154 151 109 C216 66 275 158 342 104 C411 53 470 126 540 91",
    fill: "none",
    stroke: "#ecfeff",
    "stroke-width": "2.5",
    "stroke-linecap": "round",
    "stroke-dasharray": "7 19",
    opacity: ".85",
  });
  const droplets = svgElement(documentRef, "g", { fill: "#a5f3fc" });
  [
    ["115", "63", "5"],
    ["246", "52", "3.5"],
    ["381", "49", "5.5"],
    ["444", "83", "3"],
  ].forEach(([cx, cy, r]) => droplets.append(svgElement(documentRef, "circle", { cx, cy, r })));

  svg.append(body, edge, current, foam, droplets);
  return { svg, current, foam, droplets };
}

function createCaption(documentRef, text) {
  const caption = documentRef.createElement("p");
  caption.className = "celebration-caption";
  caption.textContent = text;
  caption.style.cssText =
    "position:absolute;top:15%;left:50%;margin:0;max-width:82%;padding:8px 14px;" +
    "border:1px solid rgba(165,243,252,.45);border-radius:999px;background:rgba(8,47,73,.78);" +
    "color:#cffafe;font-size:clamp(.72rem,2vw,.9rem);font-weight:800;letter-spacing:.08em;" +
    "text-align:center;text-transform:uppercase;transform:translateX(-50%);opacity:0;" +
    "transition:opacity 220ms ease;";
  return caption;
}

/**
 * Creates a self-contained visual effect above a positioned stage. It does not
 * read or alter canvases, so any captured drawing remains intact beneath it.
 */
export function createWaterCelebration({
  stage,
  caption = "",
  durationMs = DEFAULT_DURATION_MS,
  setTimeoutFn = globalThis.setTimeout.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout.bind(globalThis),
  matchMedia = globalThis.matchMedia?.bind(globalThis),
  reducedMotion,
} = {}) {
  if (!stage?.append) {
    throw new TypeError("createWaterCelebration requires a stage element.");
  }

  const documentRef = stage.ownerDocument;
  const root = documentRef.createElement("div");
  const streamId = `water-celebration-gradient-${instanceCount++}`;
  const { svg, current, foam, droplets } = appendStreamArtwork(documentRef, streamId);
  const captionElement = caption ? createCaption(documentRef, caption) : null;
  const previousPosition = stage.style.position;
  const computedPosition = documentRef.defaultView?.getComputedStyle?.(stage).position;
  const positionedStage = computedPosition === "static";
  let timerId = null;
  let active = false;
  let destroyed = false;
  let run = 0;
  let animations = [];

  if (positionedStage) {
    stage.style.position = "relative";
  }
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  root.dataset.waterCelebration = "true";
  root.style.cssText =
    "position:absolute;z-index:2;inset:0;overflow:hidden;pointer-events:none;" +
    "contain:layout paint style;";
  root.append(svg);
  if (captionElement) {
    root.append(captionElement);
  }
  stage.append(root);

  const cancelAnimations = () => {
    animations.forEach((animation) => animation.cancel());
    animations = [];
  };

  const hide = () => {
    cancelAnimations();
    root.hidden = true;
    svg.style.opacity = "0";
    if (captionElement) {
      captionElement.style.opacity = "0";
    }
    active = false;
  };

  const play = (element, frames, timing) => {
    if (typeof element.animate !== "function") {
      return;
    }
    const animation = element.animate(frames, timing);
    animations.push(animation);
  };

  const cancel = () => {
    if (timerId !== null) {
      clearTimeoutFn(timerId);
      timerId = null;
    }
    hide();
  };

  const show = ({ duration: requestedDuration } = {}) => {
    if (destroyed) {
      return false;
    }

    cancel();
    const isReducedMotion =
      typeof reducedMotion === "boolean"
        ? reducedMotion
        : Boolean(matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    const animationDuration = finiteDuration(requestedDuration, finiteDuration(durationMs, DEFAULT_DURATION_MS));
    const visibleDuration = isReducedMotion
      ? Math.min(animationDuration, REDUCED_MOTION_DURATION_MS)
      : animationDuration;
    const currentRun = ++run;

    root.hidden = false;
    active = true;
    svg.style.opacity = "1";
    if (captionElement) {
      captionElement.style.opacity = "1";
    }

    if (isReducedMotion) {
      svg.style.width = "112%";
      svg.style.transform = "translateX(-6%)";
    } else {
      svg.style.width = "78%";
      svg.style.transform = "translateX(-90%)";
      play(
        svg,
        [
          { transform: "translateX(-90%)", opacity: 0 },
          { offset: 0.08, transform: "translateX(-68%)", opacity: 1 },
          { offset: 0.86, transform: "translateX(118%)", opacity: 1 },
          { transform: "translateX(144%)", opacity: 0 },
        ],
        { duration: animationDuration, easing: "cubic-bezier(.18,.68,.24,1)", fill: "forwards" },
      );
      play(current, [{ strokeDashoffset: 0 }, { strokeDashoffset: -68 }], {
        duration: 560,
        iterations: Infinity,
      });
      play(foam, [{ strokeDashoffset: 0 }, { strokeDashoffset: 104 }], {
        duration: 720,
        iterations: Infinity,
      });
      play(
        droplets,
        [
          { transform: "translateY(0)", opacity: 0.9 },
          { offset: 0.45, transform: "translateY(-13px)", opacity: 1 },
          { transform: "translateY(12px)", opacity: 0.15 },
        ],
        { duration: 700, iterations: Infinity, direction: "alternate", easing: "ease-in-out" },
      );
    }

    timerId = setTimeoutFn(() => {
      if (currentRun !== run || destroyed) {
        return;
      }
      timerId = null;
      hide();
    }, visibleDuration);
    return true;
  };

  return {
    start: show,
    show,
    cancel,
    reset: cancel,
    destroy() {
      if (destroyed) {
        return;
      }
      cancel();
      root.remove();
      if (positionedStage) {
        stage.style.position = previousPosition;
      }
      destroyed = true;
    },
    get element() {
      return root;
    },
    get isActive() {
      return active;
    },
  };
}
