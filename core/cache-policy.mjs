/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚡ AERON FLUXER X — core/cache-policy.mjs
 * Motor Central de Caché Determinista, Deduplicación de Invocaciones y Políticas
 * ══════════════════════════════════════════════════════════════════════════════
 */

export const CACHE_CATEGORIES = Object.freeze({
  SAFE: "SAFE",             // Información estática / hardware base (TTL: 60s)
  SHORT_LIVED: "SHORT_LIVED", // Invocaciones repetitivas de IA (TTL: 3s)
  NEVER_CACHE: "NEVER_CACHE"  // Estados mutables / seguridad (TTL: 0s)
});

const NEVER_CACHE_PATTERNS = [
  /^security\./,
  /^terminal\./,
  /^database\./,
  /^files\.(write|append|delete|replace|edit|patch|create|move|copy)/,
  /^system\.(kill|reboot|shutdown|set|clean|optimize)/,
  /git_status/,
  /inspect_port/,
  /process_tree/,
  /workflow/
];

export class CachePolicyEngine {
  constructor({ runtime = null } = {}) {
    this.runtime = runtime;
    this.store = new Map();
    this.inFlight = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      deduplicated: 0,
      bypassed: 0
    };
  }

  isNeverCache(tool, action) {
    const key = `${tool}.${action}`;
    return NEVER_CACHE_PATTERNS.some(p => p.test(key));
  }

  /**
   * Obtiene un valor en caché si es válido y no ha expirado.
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Guarda un valor en caché con TTL específico según su categoría.
   */
  set(key, value, { ttlMs = null, category = CACHE_CATEGORIES.SHORT_LIVED, source = "internal" } = {}) {
    if (category === CACHE_CATEGORIES.NEVER_CACHE) {
      this.stats.bypassed++;
      return;
    }

    const duration = ttlMs !== null ? ttlMs : (category === CACHE_CATEGORIES.SAFE ? 60000 : 3000);
    const now = Date.now();

    this.store.set(key, {
      value,
      source,
      category,
      createdAt: now,
      expiresAt: now + duration
    });
  }

  /**
   * Deduplica operaciones concurrentes idénticas para evitar lanzar múltiples procesos redundantes.
   */
  async deduplicate(key, fn) {
    if (this.inFlight.has(key)) {
      this.stats.deduplicated++;
      return this.inFlight.get(key);
    }

    const promise = (async () => {
      try {
        return await fn();
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  invalidate(pattern) {
    if (!pattern) {
      this.store.clear();
      return;
    }
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
      }
    }
  }

  getMetrics() {
    return {
      entriesCount: this.store.size,
      inFlightCount: this.inFlight.size,
      ...this.stats
    };
  }
}

export { CachePolicyEngine as CachePolicy };
