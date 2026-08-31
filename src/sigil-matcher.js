const MIN_POINTS = 5;
const RESAMPLE_COUNT = 48;
const EPSILON = 1e-6;
const MAX_PATH_ERROR = 0.3;
const MAX_PLACEMENT_ERROR = 0.34;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizePoints(inputPoints) {
  if (!Array.isArray(inputPoints)) {
    return [];
  }

  return inputPoints
    .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({ x: point.x, y: point.y }));
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

function normalizePoints(points) {
  const box = boundingBox(points);
  const scale = Math.max(box.width, box.height, EPSILON);
  return {
    points: points.map((point) => ({
      x: (point.x - box.minX) / scale,
      y: (point.y - box.minY) / scale,
    })),
    box,
  };
}

function sequenceDistance(first, second, offset = 0, reversed = false) {
  let total = 0;
  for (let index = 0; index < first.length; index += 1) {
    const sourceIndex = reversed
      ? (second.length - 1 - index + offset + second.length * 2) % second.length
      : (index + offset) % second.length;
    total += distance(first[index], second[sourceIndex]);
  }
  return total / first.length;
}

function bestPathError(userPoints, templatePoints, closed, direction) {
  const offsets = closed ? templatePoints.map((_, index) => index) : [0];
  const reversedOptions = closed || direction === "agnostic" ? [false, true] : [false];
  let best = Infinity;

  for (const reversed of reversedOptions) {
    for (const offset of offsets) {
      best = Math.min(best, sequenceDistance(userPoints, templatePoints, offset, reversed));
    }
  }

  return best;
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

function cornerDepth(points) {
  if (points.length < 3) {
    return 0;
  }

  const start = points[0];
  const end = points[points.length - 1];
  return Math.max(...points.map((point) => perpendicularDistance(point, start, end)));
}

function centroid(points) {
  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
    }),
    { x: 0, y: 0 },
  );
  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

function normalizeComposition(strokes) {
  const allPoints = strokes.flat();
  const box = boundingBox(allPoints);
  const scale = Math.max(box.width, box.height, EPSILON);
  return strokes.map((stroke) =>
    stroke.map((point) => ({
      x: (point.x - box.minX) / scale,
      y: (point.y - box.minY) / scale,
    })),
  );
}

function placementError(userStrokes, templateStrokes) {
  let total = 0;

  for (let index = 0; index < userStrokes.length; index += 1) {
    const user = userStrokes[index];
    const template = templateStrokes[index];
    const userBox = boundingBox(user);
    const templateBox = boundingBox(template);
    const userCenter = centroid(user);
    const templateCenter = centroid(template);
    const centerError = distance(userCenter, templateCenter);
    const sizeError =
      Math.abs(userBox.width - templateBox.width) +
      Math.abs(userBox.height - templateBox.height);
    total += centerError * 0.75 + sizeError * 0.25;
  }

  return total / userStrokes.length;
}

export function matchStrokeToTemplate(inputPoints, templateStroke) {
  const rawPoints = sanitizePoints(inputPoints);
  if (rawPoints.length < MIN_POINTS) {
    return { matched: false, confidence: 0, reason: "too-short" };
  }

  const rawBox = boundingBox(rawPoints);
  const collapsed = collapseNearDuplicates(rawPoints, Math.max(rawBox.diagonal * 0.005, 0.0005));
  if (collapsed.length < MIN_POINTS) {
    return { matched: false, confidence: 0, reason: "too-short" };
  }

  const userNormalized = normalizePoints(collapsed);
  const templateNormalized = normalizePoints(sanitizePoints(templateStroke.points));
  const userSample = resample(userNormalized.points);
  const templateSample = resample(templateNormalized.points);
  const pathError = bestPathError(
    userSample,
    templateSample,
    templateStroke.closed,
    templateStroke.direction,
  );
  const pathScore = clamp(1 - pathError / MAX_PATH_ERROR, 0, 1);

  if (templateStroke.closed) {
    const closure = distance(rawPoints[0], rawPoints[rawPoints.length - 1]) /
      Math.max(rawBox.diagonal, 1);
    if (closure > 0.34) {
      return { matched: false, confidence: pathScore, reason: "not-closed" };
    }

    const closureScore = 1 - closure / 0.34;
    const confidence = pathScore * 0.84 + closureScore * 0.16;
    if (confidence < 0.56) {
      return { matched: false, confidence, pathError, reason: "shape-mismatch" };
    }
    return { matched: true, confidence, pathError, closure };
  }

  const depth = cornerDepth(userSample);
  if (depth < 0.14) {
    return { matched: false, confidence: pathScore, reason: "missing-corner" };
  }

  const cornerScore = clamp(depth / 0.6, 0, 1);
  const confidence = pathScore * 0.86 + cornerScore * 0.14;
  if (confidence < 0.56) {
    return { matched: false, confidence, pathError, reason: "shape-mismatch" };
  }

  return { matched: true, confidence, pathError, cornerDepth: depth };
}

export function matchSigil(inputStrokes, template) {
  if (!Array.isArray(inputStrokes) || inputStrokes.length !== template.strokes.length) {
    return {
      matched: false,
      confidence: 0,
      reason: "stroke-count",
      strokeResults: [],
    };
  }

  const strokeResults = inputStrokes.map((stroke, index) =>
    matchStrokeToTemplate(stroke, template.strokes[index]),
  );
  const firstFailure = strokeResults.findIndex((result) => !result.matched);
  if (firstFailure >= 0) {
    return {
      matched: false,
      confidence: strokeResults.reduce((sum, result) => sum + result.confidence, 0) /
        strokeResults.length,
      reason: `stroke-${firstFailure + 1}-${strokeResults[firstFailure].reason}`,
      strokeResults,
    };
  }

  const userNormalized = normalizeComposition(inputStrokes.map(sanitizePoints));
  const templateNormalized = normalizeComposition(
    template.strokes.map((stroke) => sanitizePoints(stroke.points)),
  );
  const placement = placementError(userNormalized, templateNormalized);
  const placementScore = clamp(1 - placement / MAX_PLACEMENT_ERROR, 0, 1);
  const shapeScore =
    strokeResults.reduce((sum, result) => sum + result.confidence, 0) / strokeResults.length;
  const confidence = shapeScore * 0.72 + placementScore * 0.28;

  if (placementScore < 0.35) {
    return {
      matched: false,
      confidence,
      reason: "placement-mismatch",
      placement,
      strokeResults,
    };
  }

  if (confidence < 0.6) {
    return {
      matched: false,
      confidence,
      reason: "composition-mismatch",
      placement,
      strokeResults,
    };
  }

  return {
    matched: true,
    confidence,
    placement,
    strokeResults,
  };
}
