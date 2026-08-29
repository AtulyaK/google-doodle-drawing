const MIN_POINTS = 8;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

function resample(points, count = 32) {
  if (points.length < 2) {
    return points;
  }

  const total = pathLength(points);
  const interval = total / (count - 1);
  const result = [points[0]];
  let accumulated = 0;
  let previous = points[0];

  for (let index = 1; index < points.length && result.length < count; index += 1) {
    const current = points[index];
    const segment = distance(previous, current);
    if (segment === 0) {
      continue;
    }

    if (accumulated + segment >= interval) {
      const ratio = (interval - accumulated) / segment;
      const inserted = {
        x: previous.x + (current.x - previous.x) * ratio,
        y: previous.y + (current.y - previous.y) * ratio,
      };
      result.push(inserted);
      points = [inserted, ...points.slice(index)];
      previous = inserted;
      accumulated = 0;
      index = 0;
    } else {
      accumulated += segment;
      previous = current;
    }
  }

  while (result.length < count) {
    result.push(points[points.length - 1]);
  }
  return result;
}

function normalize(points) {
  const box = boundingBox(points);
  const scale = Math.max(box.width, box.height, 1);
  return points.map((point) => ({
    x: (point.x - box.minX) / scale,
    y: (point.y - box.minY) / scale,
  }));
}

function perpendicularDistance(point, start, end) {
  const lineLength = distance(start, end);
  if (lineLength === 0) {
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
    return points;
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

function closedness(points, box) {
  return distance(points[0], points[points.length - 1]) / Math.max(box.diagonal, 1);
}

function lineConfidence(points, box) {
  const directDistance = distance(points[0], points[points.length - 1]);
  const straightness = directDistance / Math.max(pathLength(points), 1);
  const narrowness = Math.min(box.width, box.height) / Math.max(Math.max(box.width, box.height), 1);
  return Math.min(1, Math.max(0, straightness * 0.85 + (1 - narrowness) * 0.15));
}

function circleConfidence(points, box) {
  const centre = {
    x: (box.minX + box.maxX) / 2,
    y: (box.minY + box.maxY) / 2,
  };
  const radii = points.map((point) => distance(point, centre));
  const meanRadius = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
  const variance =
    radii.reduce((sum, radius) => sum + (radius - meanRadius) ** 2, 0) / radii.length;
  const radialConsistency = 1 - Math.min(1, Math.sqrt(variance) / Math.max(meanRadius, 1));
  const aspect = Math.min(box.width, box.height) / Math.max(box.width, box.height, 1);
  const closure = 1 - Math.min(1, closedness(points, box) * 3);
  return Math.max(0, radialConsistency * 0.55 + aspect * 0.25 + closure * 0.2);
}

function triangleConfidence(points, box) {
  const loop = [...points, points[0]];
  const corners = simplify(loop, Math.max(box.diagonal * 0.08, 0.03));
  if (corners.length !== 5) {
    return 0;
  }

  const vertices = corners.slice(0, 3);
  const sides = [
    distance(vertices[0], vertices[1]),
    distance(vertices[1], vertices[2]),
    distance(vertices[2], vertices[0]),
  ];
  const longest = Math.max(...sides);
  const shortest = Math.min(...sides);
  const sideBalance = shortest / Math.max(longest, 0.001);
  const closure = 1 - Math.min(1, closedness(points, box) * 3);
  const area = Math.abs(
    vertices.reduce(
      (sum, vertex, index) =>
        sum + vertex.x * vertices[(index + 1) % vertices.length].y -
        vertices[(index + 1) % vertices.length].x * vertex.y,
      0,
    ),
  );
  const hasArea = area > 0.15;
  return hasArea ? Math.max(0, sideBalance * 0.65 + closure * 0.35) : 0;
}

export function recognizeStroke(inputPoints) {
  if (!Array.isArray(inputPoints) || inputPoints.length < MIN_POINTS) {
    return { shape: null, confidence: 0 };
  }

  const rawPoints = inputPoints.map((point) => ({ x: point.x, y: point.y }));
  const box = boundingBox(rawPoints);
  if (box.diagonal < 30) {
    return { shape: null, confidence: 0 };
  }

  const points = normalize(resample(rawPoints));
  const normalizedBox = boundingBox(points);
  const isClosed = closedness(points, normalizedBox) < 0.3;
  const candidates = [];

  if (!isClosed) {
    candidates.push({ shape: "line", confidence: lineConfidence(points, normalizedBox) });
  } else {
    candidates.push({ shape: "circle", confidence: circleConfidence(points, normalizedBox) });
    candidates.push({ shape: "triangle", confidence: triangleConfidence(points, normalizedBox) });
  }

  const best = candidates.sort((a, b) => b.confidence - a.confidence)[0];
  const threshold = best.shape === "line" ? 0.78 : 0.62;
  return best.confidence >= threshold ? best : { shape: null, confidence: best.confidence };
}

export const recognizerInternals = {
  boundingBox,
  normalize,
  pathLength,
  resample,
  simplify,
};
