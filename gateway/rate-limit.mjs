/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🛡️ AERON FLUXER X FEEDBACK GATEWAY — rate-limit.mjs
 * Control de tasa de solicitudes por cliente/IP para prevenir abusos y spam
 * ══════════════════════════════════════════════════════════════════════════════
 */

export class RateLimiter {
  /**
   * @param {object} options
   * @param {number} [options.maxRequests=60] Máximo de peticiones permitidas en la ventana (60/hora)
   * @param {number} [options.windowMs=3600000] Duración de la ventana en milisegundos (1 hora por defecto)
   */
  constructor({ maxRequests = 60, windowMs = 3600000 } = {}) {
    this.maxRequests = Number(process.env.FEEDBACK_RATE_LIMIT) || maxRequests;
    this.windowMs = windowMs;
    this.clients = new Map();

    // Limpieza periódica de clientes inactivos cada 15 minutos
    setInterval(() => this.cleanup(), 15 * 60 * 1000).unref();
  }

  /**
   * Comprueba si el cliente tiene permitido realizar una solicitud.
   * @param {string} clientId IP o identificador de instalación
   * @returns {{ allowed: boolean, remaining: number, resetMs: number }}
   */
  check(clientId) {
    const now = Date.now();
    let record = this.clients.get(clientId);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + this.windowMs,
      };
      this.clients.set(clientId, record);
      return { allowed: true, remaining: this.maxRequests - 1, resetMs: this.windowMs };
    }

    if (record.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetMs: Math.max(0, record.resetTime - now),
      };
    }

    record.count++;
    return {
      allowed: true,
      remaining: this.maxRequests - record.count,
      resetMs: Math.max(0, record.resetTime - now),
    };
  }

  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.clients.entries()) {
      if (now > record.resetTime) {
        this.clients.delete(key);
      }
    }
  }
}
