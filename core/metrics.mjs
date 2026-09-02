import os from "node:os";

/**
 * Histograma de tiempos con reservoir sampling (circular buffer).
 * Soporta percentiles P50, P95 y P99 sobre las últimas N muestras.
 */
class TimingHistogram {
  constructor(maxSamples = 1000) {
    this.maxSamples = maxSamples;
    this._buf = new Float64Array(maxSamples); // circular buffer
    this._pos = 0; // posición de escritura
    this.count = 0; // total de muestras registradas (puede superar maxSamples)
    this.total = 0;
    this.max = 0;
    this.labels = {};
  }

  add(value) {
    this._buf[this._pos % this.maxSamples] = value;
    this._pos++;
    this.count++;
    this.total += value;
    if (value > this.max) this.max = value;
  }

  /** Tamaño real del buffer (nunca supera maxSamples). */
  get filled() {
    return Math.min(this.count, this.maxSamples);
  }

  get avg() {
    return this.count ? this.total / this.count : 0;
  }

  percentile(p) {
    const n = this.filled;
    if (!n) return 0;
    // Copiar sólo las entradas válidas y ordenar
    const sorted = this._buf.subarray(0, n).slice().sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  snapshot() {
    return {
      count: this.count,
      total: this.total,
      max: this.max,
      avg: this.avg,
      p50: this.percentile(50),
      p95: this.percentile(95),
      p99: this.percentile(99),
      labels: this.labels,
    };
  }
}

export class Metrics {
  constructor({ memory }) {
    this.memory = memory;
    this.startedAt = performance.now();
    this.counters = new Map(); // key → number
    this.timings = new Map(); // key → TimingHistogram
  }

  /** Genera una clave estable de nombre + labels ordenados. */
  key(name, labels = {}) {
    const stable = Object.keys(labels)
      .sort()
      .reduce((acc, k) => {
        acc[k] = labels[k];
        return acc;
      }, {});
    return `${name}:${JSON.stringify(stable)}`;
  }

  /** Incrementa un contador. */
  inc(name, labels = {}, by = 1) {
    const k = this.key(name, labels);
    this.counters.set(k, (this.counters.get(k) ?? 0) + by);
    this.memory.recordMetric(name, by, labels);
  }

  /** Registra una muestra de tiempo (ms). */
  timing(name, value, labels = {}) {
    const k = this.key(name, labels);
    let hist = this.timings.get(k);
    if (!hist) {
      hist = new TimingHistogram(1000);
      hist.labels = labels;
      this.timings.set(k, hist);
    }
    hist.add(value);
    this.memory.recordMetric(name, value, labels);
  }

  /** Registra un cache hit. */
  cacheHit(tool, action) {
    this.inc("cache:hits", { tool, action });
    this.inc("cache:hits", {}); // contador global
  }

  /** Registra un cache miss. */
  cacheMiss(tool, action) {
    this.inc("cache:misses", { tool, action });
    this.inc("cache:misses", {}); // contador global
  }

  /** Calcula cache hit rate global (0–1 ó null si no hay datos). */
  _cacheHitRate() {
    const hits = this.counters.get("cache:hits:{}") ?? 0;
    const misses = this.counters.get("cache:misses:{}") ?? 0;
    const total = hits + misses;
    return { hits, misses, rate: total ? +(hits / total).toFixed(4) : null };
  }

  /** Snapshot completo de todas las métricas. */
  snapshot() {
    const mem = process.memoryUsage();
    return {
      uptimeSeconds: Math.round((performance.now() - this.startedAt) / 1000),
      process: {
        pid: process.pid,
        node: process.version,
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
      },
      system: {
        loadavg: os.loadavg(),
        totalmem: os.totalmem(),
        freemem: os.freemem(),
        cpus: os.cpus().length,
      },
      cache: this._cacheHitRate(),
      counters: Object.fromEntries(this.counters),
      timings: Object.fromEntries(
        [...this.timings].map(([k, hist]) => [k, hist.snapshot()]),
      ),
    };
  }
}
