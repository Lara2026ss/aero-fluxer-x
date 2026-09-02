/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🧩 AERON FLUXER X FEEDBACK GATEWAY — dedup.mjs
 * Generador de huella digital normalizada y deduplicación inteligente
 * ══════════════════════════════════════════════════════════════════════════════
 */

import crypto from "node:crypto";

export class DeduplicationEngine {
  /**
   * @param {object} options
   * @param {number} [options.cooldownMs=86400000] Ventana de deduplicación (24 horas)
   */
  constructor({ cooldownMs = 24 * 60 * 60 * 1000 } = {}) {
    this.cooldownMs = cooldownMs;
    this.memoryIndex = new Map();
  }

  /**
   * Genera una huella SHA-256 a partir del contenido normalizado (sin PII).
   * @param {object} payload
   * @returns {string} Huella digital hexadecimal
   */
  computeFingerprint(payload) {
    const normType = String(payload.type || "general").trim().toLowerCase();
    const normTitle = String(payload.title || "").trim().toLowerCase().replace(/\s+/g, " ");
    const normTool = String(payload.tool || "").trim().toLowerCase();
    const normVersion = String(payload.version || "").trim();

    // Extraer firma de error si existe en descripción o logs
    let errorSignature = "";
    const errMatch = String(payload.description || "").match(/(Error:\s*[^\n]+|EACCES|ENOENT|ECONNREFUSED|ENOTFOUND)/i);
    if (errMatch) {
      errorSignature = errMatch[1].trim().toLowerCase();
    }

    const raw = `${normType}|${normTitle}|${normTool}|${errorSignature}|${normVersion}`;
    return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
  }

  /**
   * Comprueba si el reporte es un duplicado reciente.
   * @param {string} fingerprint
   * @returns {{ isDuplicate: boolean, canonicalId: string|null, count: number }}
   */
  check(fingerprint) {
    const now = Date.now();
    const record = this.memoryIndex.get(fingerprint);

    if (record && now - record.lastSeen < this.cooldownMs) {
      record.count++;
      record.lastSeen = now;
      return {
        isDuplicate: true,
        canonicalId: record.id,
        count: record.count,
      };
    }

    return {
      isDuplicate: false,
      canonicalId: null,
      count: 1,
    };
  }

  /**
   * Registra una nueva huella digital canónica.
   * @param {string} fingerprint
   * @param {string} canonicalId
   */
  register(fingerprint, canonicalId) {
    this.memoryIndex.set(fingerprint, {
      id: canonicalId,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      count: 1,
    });
  }
}
