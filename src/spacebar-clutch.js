/**
 * @typedef {"release" | "blur" | "manual"} SpacebarFinishReason
 *
 * @typedef {Object} SpacebarClutchOptions
 * @property {Window} target
 * @property {(event: KeyboardEvent) => boolean} canStart
 * @property {() => void} onStart
 * @property {(reason: SpacebarFinishReason) => void} onFinish
 *
 * @typedef {Object} SpacebarClutch
 * @property {boolean} held
 * @property {(reason?: SpacebarFinishReason) => boolean} finish
 * @property {() => void} reset
 * @property {() => void} destroy
 */

/**
 * @param {SpacebarClutchOptions} options
 * @returns {SpacebarClutch}
 */
export function createSpacebarClutch({ target, canStart, onStart, onFinish }) {
  let held = false;

  /** @param {EventTarget | null} target */
  function isTextEntryTarget(target) {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    );
  }

  /**
   * @param {SpacebarFinishReason} [reason]
   * @returns {boolean}
   */
  function finish(reason = "manual") {
    if (!held) {
      return false;
    }

    held = false;
    onFinish(reason);
    return true;
  }

  /** @param {KeyboardEvent} event */
  function handleKeyDown(event) {
    if (
      event.code !== "Space" ||
      event.repeat ||
      isTextEntryTarget(event.target)
    ) {
      return;
    }
    if (held) {
      event.preventDefault();
      return;
    }
    if (!canStart(event)) {
      return;
    }

    held = true;
    onStart();
  }

  /** @param {KeyboardEvent} event */
  function handleKeyUp(event) {
    if (event.code !== "Space" || !held) {
      return;
    }

    event.preventDefault();
    finish("release");
  }

  function handleBlur() {
    finish("blur");
  }

  target.addEventListener("keydown", handleKeyDown);
  target.addEventListener("keyup", handleKeyUp);
  target.addEventListener("blur", handleBlur);

  return {
    get held() {
      return held;
    },
    finish,
    reset() {
      held = false;
    },
    destroy() {
      target.removeEventListener("keydown", handleKeyDown);
      target.removeEventListener("keyup", handleKeyUp);
      target.removeEventListener("blur", handleBlur);
    },
  };
}
