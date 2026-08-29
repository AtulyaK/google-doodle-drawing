const PINCH_RELEASE_SCALE = 0.45;

function landmarkDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function isDrawingGesture(landmarks) {
  const indexExtended = landmarks[8].y < landmarks[6].y;
  const middleCurled = landmarks[12].y > landmarks[10].y;
  const ringCurled = landmarks[16].y > landmarks[14].y;
  const pinkyCurled = landmarks[20].y > landmarks[18].y;
  return (
    indexExtended &&
    middleCurled &&
    ringCurled &&
    pinkyCurled &&
    !isPinchReleaseGesture(landmarks)
  );
}

export function isPinchReleaseGesture(landmarks) {
  const palmScale = landmarkDistance(landmarks[0], landmarks[9]);
  const thumbIndexDistance = landmarkDistance(landmarks[4], landmarks[8]);
  const middleCurled = landmarks[12].y > landmarks[10].y;
  const ringCurled = landmarks[16].y > landmarks[14].y;
  const pinkyCurled = landmarks[20].y > landmarks[18].y;
  return (
    palmScale > 0 &&
    thumbIndexDistance <= palmScale * PINCH_RELEASE_SCALE &&
    middleCurled &&
    ringCurled &&
    pinkyCurled
  );
}
