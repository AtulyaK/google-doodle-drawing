const MIN_POINTS = 8;
const RESAMPLE_COUNT = 64;
const MIN_DIAGONAL = 30;
const EPSILON = 1e-6;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pathLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distance(points[index - 1], points[index]);
  }
  return length;
}

function boundingBox(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    diagonal: Math.hypot(maxX - minX, maxY - minY),
  };
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function centroid(points) {
  const total = points.reduce(
    (accumulator, point) => {
      accumulator.x += point.x;
      accumulator.y += point.y;
      return accumulator;
    },
    { x: 0, y: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

function sanitizePoints(inputPoints) {
  const sanitized = [];
  for (const point of inputPoints) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      continue;
    }
    sanitized.push({ x: point.x, y: point.y });
  }
  return sanitized;
}

function collapseNearDuplicates(points, threshold) {
  if (points.length <= 1) {
    return points.slice();
  }

  const result = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    if (distance(points[index], result[result.length - 1]) >= threshold) {
      result.push(points[index]);
    }
  }
  return result;
}

function resample(points, count = RESAMPLE_COUNT) {
  if (points.length <= 1) {
    return points.slice();
  }

  const total = pathLength(points);
  if (total <= EPSILON) {
    return Array.from({ length: count }, () => ({ ...points[0] }));
  }

  const interval = total / (count - 1);
  const result = [{ ...points[0] }];
  let travelled = 0;
  let previous = points[0];
  let index = 1;

  while (result.length < count && index < points.length) {
    const current = points[index];
    const segment = distance(previous, current);

    if (segment <= EPSILON) {
      previous = current;
      index += 1;
      continue;
    }

    if (travelled + segment >= interval) {
      const ratio = (interval - travelled) / segment;
      const inserted = {
        x: previous.x + (current.x - previous.x) * ratio,
        y: previous.y + (current.y - previous.y) * ratio,
      };
      result.push(inserted);
      previous = inserted;
      travelled = 0;
    } else {
      travelled += segment;
      previous = current;
      index += 1;
    }
  }

  while (result.length < count) {
    result.push({ ...points[points.length - 1] });
  }

  return result;
}

function perpendicularDistance(point, start, end) {
  const lineLength = distance(start, end);
  if (lineLength <= EPSILON) {
    return distance(point, start);
  }

  return Math.abs(
    (end.y - start.y) * point.x -
      (end.x - start.x) * point.y +
      end.x * start.y -
      end.y * start.x,
  ) / lineLength;
}

function simplify(points, tolerance) {
  if (points.length < 3) {
    return points.slice();
  }

  let farthestIndex = 0;
  let farthestDistance = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let index = 1; index < points.length - 1; index += 1) {
    const currentDistance = perpendicularDistance(points[index], start, end);
    if (currentDistance > farthestDistance) {
      farthestDistance = currentDistance;
      farthestIndex = index;
    }
  }

  if (farthestDistance <= tolerance) {
    return [start, end];
  }

  const left = simplify(points.slice(0, farthestIndex + 1), tolerance);
  const right = simplify(points.slice(farthestIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

function normalize(points) {
  const box = boundingBox(points);
  const scale = Math.max(box.width, box.height, 1);
  return points.map((point) => ({
    x: (point.x - box.minX) / scale,
    y: (point.y - box.minY) / scale,
  }));
}

function angleBetween(prev, current, next) {
  const ux = prev.x - current.x;
  const uy = prev.y - current.y;
  const vx = next.x - current.x;
  const vy = next.y - current.y;
  const uLength = Math.hypot(ux, uy);
  const vLength = Math.hypot(vx, vy);

  if (uLength <= EPSILON || vLength <= EPSILON) {
    return Math.PI;
  }

  const cosine = clamp((ux * vx + uy * vy) / (uLength * vLength), -1, 1);
  return Math.acos(cosine);
}

function turnStrength(prev, current, next) {
  return Math.PI - angleBetween(prev, current, next);
}

function circularDistance(indexA, indexB, count) {
  const delta = Math.abs(indexA - indexB);
  return Math.min(delta, count - delta);
}

function detectCorners(points, closed, threshold = 0.55) {
  if (points.length < 3) {
    return [];
  }

  const effectiveCount =
    closed && distance(points[0], points[points.length - 1]) <= EPSILON
      ? points.length - 1
      : points.length;
  if (effectiveCount < 3) {
    return [];
  }

  const candidates = [];
  const count = effectiveCount;

  for (let index = closed ? 0 : 1; index < (closed ? count : count - 1); index += 1) {
    const prev = points[(index - 1 + count) % count];
    const current = points[index];
    const next = points[(index + 1) % count];
    const strength = turnStrength(prev, current, next);
    if (strength >= threshold) {
      candidates.push({ index, strength });
    }
  }

  candidates.sort((a, b) => b.strength - a.strength);
  const selected = [];
  const minSpacing = Math.max(2, Math.round(count / (closed ? 8 : 10)));

  for (const candidate of candidates) {
    const tooClose = selected.some(
      (corner) =>
        (closed
          ? circularDistance(candidate.index, corner.index, count)
          : Math.abs(candidate.index - corner.index)) < minSpacing,
    );
    if (!tooClose) {
      selected.push(candidate);
    }
  }

  return selected.sort((a, b) => a.index - b.index);
}

function maxDeviationFromLine(points, start, end) {
  let maxDeviation = 0;
  for (const point of points) {
    maxDeviation = Math.max(maxDeviation, perpendicularDistance(point, start, end));
  }
  return maxDeviation;
}

function lineConfidence(points, box) {
  const start = points[0];
  const end = points[points.length - 1];
  const totalLength = pathLength(points);
  const directDistance = distance(start, end);
  if (totalLength <= EPSILON || directDistance <= EPSILON) {
    return 0;
  }

  const roughness = 1 - directDistance / totalLength;
  const deviation = maxDeviationFromLine(points, start, end) / Math.max(box.diagonal, 1);
  const corners = detectCorners(points, false, 0.45);

  if (corners.length > 0 || roughness > 0.14 || deviation > 0.06) {
    return 0;
  }

  return clamp(
    (directDistance / totalLength) * 0.55 +
      (1 - Math.min(1, deviation / 0.06)) * 0.3 +
      (1 - Math.min(1, roughness / 0.14)) * 0.15,
    0,
    1,
  );
}

function lineOrientation(points) {
  const start = points[0];
  const end = points[points.length - 1];
  const angle = (Math.atan2(Math.abs(end.y - start.y), Math.abs(end.x - start.x)) * 180) / Math.PI;

  if (angle <= 22.5) {
    return "horizontal";
  }
  if (angle >= 67.5) {
    return "vertical";
  }
  return "diagonal";
}

function vConfidence(points, box) {
  const corners = detectCorners(points, false, 0.55);
  if (corners.length !== 1) {
    return 0;
  }

  const corner = corners[0];
  const start = points[0];
  const middle = points[corner.index];
  const end = points[points.length - 1];
  const totalLength = pathLength(points);
  const directDistance = distance(start, end);
  if (totalLength <= EPSILON || directDistance <= EPSILON) {
    return 0;
  }

  const firstLeg = pathLength(points.slice(0, corner.index + 1));
  const secondLeg = pathLength(points.slice(corner.index));
  const legBalance = Math.min(firstLeg, secondLeg) / Math.max(firstLeg, secondLeg, EPSILON);
  const cornerStrength = turnStrength(points[corner.index - 1], middle, points[corner.index + 1]);
  const openness = directDistance / totalLength;
  const cornerPosition = corner.index / (points.length - 1);

  if (
    cornerStrength < 0.8 ||
    legBalance < 0.45 ||
    openness < 0.4 ||
    openness > 0.9 ||
    cornerPosition < 0.25 ||
    cornerPosition > 0.75
  ) {
    return 0;
  }

  return clamp(
    (cornerStrength / Math.PI) * 0.45 +
      legBalance * 0.25 +
      (1 - Math.abs(openness - 0.6) / 0.3) * 0.2 +
      (1 - Math.abs(cornerPosition - 0.5) / 0.25) * 0.1,
    0,
    1,
  );
}

function closedMetrics(points, box) {
  const closure = distance(points[0], points[points.length - 1]) / Math.max(box.diagonal, 1);
  return {
    closure,
    closed: closure <= 0.18,
  };
}

function circleConfidence(points, box) {
  const { closed, closure } = closedMetrics(points, box);
  if (!closed) {
    return 0;
  }

  const resampled = resample(points, RESAMPLE_COUNT);
  const center = centroid(resampled);
  const radii = resampled.map((point) => distance(point, center));
  const meanRadius = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
  const variance =
    radii.reduce((sum, radius) => sum + (radius - meanRadius) ** 2, 0) / radii.length;
  const radialConsistency = 1 - Math.min(1, Math.sqrt(variance) / Math.max(meanRadius, 1));
  const aspect = Math.min(box.width, box.height) / Math.max(box.width, box.height, 1);
  const area = Math.abs(polygonArea(resampled));
  const circularity = (4 * Math.PI * area) / Math.max(pathLength(resampled) ** 2, 1);
  const corners = detectCorners(resampled, true, 0.5);

  if (corners.length > 1 || radialConsistency < 0.8 || circularity < 0.68) {
    return 0;
  }

  return clamp(
    radialConsistency * 0.42 +
      circularity * 0.32 +
      aspect * 0.16 +
      (1 - Math.min(1, closure / 0.18)) * 0.1,
    0,
    1,
  );
}

function triangleConfidence(points, box) {
  const { closed } = closedMetrics(points, box);
  if (!closed) {
    return 0;
  }

  const resampled = resample(points, RESAMPLE_COUNT);
  const corners = detectCorners(resampled, true, 0.52);
  if (corners.length < 3) {
    return 0;
  }

  const strongest = [...corners].sort((a, b) => b.strength - a.strength).slice(0, 4);
  if (strongest.length > 3 && strongest[3].strength > strongest[2].strength * 0.7) {
    return 0;
  }

  const vertices = strongest.slice(0, 3).sort((a, b) => a.index - b.index);
  const arcFractions = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index].index;
    const next = vertices[(index + 1) % vertices.length].index;
    const arc = next > current ? next - current : resampled.length - current + next;
    arcFractions.push(arc / resampled.length);
  }

  const meanArc = arcFractions.reduce((sum, value) => sum + value, 0) / arcFractions.length;
  const arcVariance =
    arcFractions.reduce((sum, value) => sum + (value - meanArc) ** 2, 0) / arcFractions.length;
  const arcBalance = 1 - Math.min(1, Math.sqrt(arcVariance) / Math.max(meanArc, 1 / resampled.length));
  const cornerStrength = vertices.reduce((sum, corner) => sum + corner.strength, 0) / vertices.length;
  const area = Math.abs(polygonArea(resampled));
  const circularity = (4 * Math.PI * area) / Math.max(pathLength(resampled) ** 2, 1);
  const fit = 1 - Math.min(1, Math.abs(circularity - 0.62) / 0.26);
  const areaRatio = area / Math.max(box.width * box.height, 1);
  const polygon = vertices.map((corner) => resampled[corner.index]);
  const sides = [
    distance(polygon[0], polygon[1]),
    distance(polygon[1], polygon[2]),
    distance(polygon[2], polygon[0]),
  ];
  const sideBalance = Math.min(...sides) / Math.max(...sides, EPSILON);

  if (
    cornerStrength < 0.75 ||
    arcBalance < 0.45 ||
    circularity < 0.5 ||
    circularity > 0.82 ||
    areaRatio < 0.12 ||
    sideBalance < 0.28
  ) {
    return 0;
  }

  return clamp(
    cornerStrength / Math.PI * 0.35 +
      arcBalance * 0.2 +
      fit * 0.2 +
      areaRatio * 0.15 +
      sideBalance * 0.1,
    0,
    1,
  );
}

export function recognizeStroke(inputPoints) {
  if (!Array.isArray(inputPoints) || inputPoints.length < MIN_POINTS) {
    return { shape: null, confidence: 0 };
  }

  const rawPoints = sanitizePoints(inputPoints);
  if (rawPoints.length < MIN_POINTS) {
    return { shape: null, confidence: 0 };
  }

  const rawBox = boundingBox(rawPoints);
  if (rawBox.diagonal < MIN_DIAGONAL) {
    return { shape: null, confidence: 0 };
  }

  const step = Math.max(0.5, rawBox.diagonal * 0.005);
  const collapsed = collapseNearDuplicates(rawPoints, step);
  if (collapsed.length < MIN_POINTS) {
    return { shape: null, confidence: 0 };
  }

  const sampled = resample(collapsed, RESAMPLE_COUNT);
  const box = boundingBox(sampled);
  const metrics = [
    { shape: "line", confidence: lineConfidence(sampled, box) },
    { shape: "v", confidence: vConfidence(sampled, box) },
    { shape: "circle", confidence: circleConfidence(sampled, box) },
    { shape: "triangle", confidence: triangleConfidence(sampled, box) },
  ];

  const best = metrics.sort((a, b) => b.confidence - a.confidence)[0];
  const threshold = best.shape === "line" ? 0.82 : 0.72;

  if (best.confidence < threshold) {
    return { shape: null, confidence: best.confidence };
  }

  return best.shape === "line"
    ? { ...best, orientation: lineOrientation(sampled) }
    : best;
}

export const recognizerInternals = {
  boundingBox,
  collapseNearDuplicates,
  normalize,
  pathLength,
  polygonArea,
  resample,
  simplify,
  lineOrientation,
};
