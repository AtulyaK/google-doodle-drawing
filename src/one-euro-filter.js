function smoothingFactor(rate, deltaSeconds) {
  const timeConstant = 1 / (2 * Math.PI * rate);
  return 1 / (1 + timeConstant / deltaSeconds);
}

function lowPass(previous, value, alpha) {
  return previous === null ? value : alpha * value + (1 - alpha) * previous;
}

export class OneEuroFilter {
  constructor({ minCutoff = 1.2, beta = 0.04, derivativeCutoff = 1 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.derivativeCutoff = derivativeCutoff;
    this.previousRaw = null;
    this.previousFiltered = null;
    this.previousDerivative = null;
    this.previousTime = null;
  }

  reset() {
    this.previousRaw = null;
    this.previousFiltered = null;
    this.previousDerivative = null;
    this.previousTime = null;
  }

  filter(value, timestamp) {
    const time = timestamp / 1000;
    if (this.previousTime === null || time <= this.previousTime) {
      this.previousRaw = value;
      this.previousFiltered = value;
      this.previousDerivative = 0;
      this.previousTime = time;
      return value;
    }

    const deltaSeconds = Math.max(time - this.previousTime, 0.001);
    const derivative = (value - this.previousRaw) / deltaSeconds;
    const derivativeAlpha = smoothingFactor(this.derivativeCutoff, deltaSeconds);
    const filteredDerivative = lowPass(this.previousDerivative, derivative, derivativeAlpha);
    const cutoff = this.minCutoff + this.beta * Math.abs(filteredDerivative);
    const valueAlpha = smoothingFactor(cutoff, deltaSeconds);
    const filteredValue = lowPass(this.previousFiltered, value, valueAlpha);

    this.previousRaw = value;
    this.previousFiltered = filteredValue;
    this.previousDerivative = filteredDerivative;
    this.previousTime = time;
    return filteredValue;
  }
}

export class VectorOneEuroFilter {
  constructor(options) {
    this.x = new OneEuroFilter(options);
    this.y = new OneEuroFilter(options);
  }

  reset() {
    this.x.reset();
    this.y.reset();
  }

  filter(point, timestamp) {
    return {
      x: this.x.filter(point.x, timestamp),
      y: this.y.filter(point.y, timestamp),
    };
  }
}
