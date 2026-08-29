export const PINCH_ON_RATIO = 0.42;
export const PINCH_OFF_RATIO = 0.58;

function distance(first, second) {
  const dimensions = ["x", "y", "z"];
  const hasDepth = dimensions.every((dimension) => Number.isFinite(first?.[dimension]) && Number.isFinite(second?.[dimension]));
  return Math.hypot(
    first.x - second.x,
    first.y - second.y,
    hasDepth ? first.z - second.z : 0,
  );
}

export function pinchRatio(landmarks) {
  if (!landmarks || landmarks.length < 21) {
    return Number.POSITIVE_INFINITY;
  }

  const palmWidth = distance(landmarks[5], landmarks[17]);
  if (palmWidth <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return distance(landmarks[4], landmarks[8]) / palmWidth;
}

export function isPinched(landmarks, threshold = PINCH_ON_RATIO) {
  return pinchRatio(landmarks) <= threshold;
}

export function updatePinchState(previousState, landmarks) {
  const ratio = pinchRatio(landmarks);
  if (previousState) {
    return ratio < PINCH_OFF_RATIO;
  }
  return ratio <= PINCH_ON_RATIO;
}
