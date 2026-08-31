const TAU = Math.PI * 2;

function createRingPoints(centerX, centerY, radius, segments) {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = (TAU * index) / segments;
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });
}

export const FIRST_BINDING = {
  id: "first-binding",
  version: 1,
  name: "First Binding",
  coordinateSpace: "unit-square",
  strokes: [
    {
      id: "vessel",
      label: "Vessel",
      closed: true,
      direction: "agnostic",
      hint: "Trace the round vessel in one smooth loop.",
      points: createRingPoints(0.5, 0.5, 0.31, 48),
    },
    {
      id: "apex",
      label: "Apex",
      closed: false,
      direction: "agnostic",
      hint: "Finish with the pointed mark inside the vessel.",
      points: [
        { x: 0.34, y: 0.32 },
        { x: 0.5, y: 0.68 },
        { x: 0.66, y: 0.32 },
      ],
    },
  ],
};

export function templatePointToStage(point, width, height) {
  const size = Math.min(width, height) * 0.82;
  const left = (width - size) / 2;
  const top = (height - size) / 2;
  return {
    x: left + point.x * size,
    y: top + point.y * size,
  };
}
