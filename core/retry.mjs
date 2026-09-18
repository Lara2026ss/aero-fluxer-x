export async function retry(
  fn,
  { attempts = 2, delayMs = 200, factor = 2, shouldRetry = () => true } = {},
) {
  let lastError;
  let wait = delayMs;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetry(error)) break;
      await new Promise((resolve) => setTimeout(resolve, wait));
      wait *= factor;
    }
  }
  throw lastError;
}

export class CircuitBreaker {
  constructor({ threshold = 5, cooldownMs = 30000 } = {}) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    this.state = new Map();
  }

  assert(route) {
    const item = this.state.get(route);
    if (!item || item.failures < this.threshold) return;
    if (Date.now() - item.lastFailure > this.cooldownMs) return;
    throw new Error(`circuit open for ${route}`);
  }

  success(route) {
    this.state.delete(route);
  }

  failure(route) {
    const item = this.state.get(route) ?? { failures: 0, lastFailure: 0 };
    item.failures += 1;
    item.lastFailure = Date.now();
    this.state.set(route, item);
  }

  snapshot() {
    return Object.fromEntries(this.state);
  }
}
