/**
 * FLUXER Audit Log v7.0
 * Log inmutable de auditoría separado del log general.
 * Registra: timestamp, agent, tool, action, args (sanitizados), permission, result.
 * Guardar en storage/logs/audit.jsonl (append-only).
 */
import fs from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import path from "node:path";

/** Claves que indican datos sensibles — se enmascaran en args */
const SENSITIVE_KEYS = new Set([
  "password", "passwd", "pwd", "secret", "token", "api_key", "apikey",
  "key", "auth", "authorization", "credential", "credentials",
  "groq_api_key", "openai_api_key", "anthropic_api_key",
]);

function sanitizeArgs(args) {
  if (!args || typeof args !== "object") return args;
  const result = {};
  for (const [k, v] of Object.entries(args)) {
    const keyLower = k.toLowerCase().replace(/[_-]/g, "");
    if (SENSITIVE_KEYS.has(keyLower) || SENSITIVE_KEYS.has(k.toLowerCase())) {
      result[k] = "[REDACTED]";
    } else if (typeof v === "object" && v !== null) {
      result[k] = sanitizeArgs(v);
    } else {
      // Truncar valores largos
      result[k] = typeof v === "string" && v.length > 200 ? `${v.slice(0, 200)}...` : v;
    }
  }
  return result;
}

export class AuditLog {
  /**
   * @param {object} options
   * @param {string} options.dir - Directorio de logs
   * @param {boolean} options.enabled - Si está activo
   */
  constructor({ dir, enabled = true }) {
    this.dir = dir;
    this.enabled = enabled;
    this.file = path.join(dir, "audit.jsonl");
    this._stream = null;
    this._ready = false;
  }

  async init() {
    if (!this.enabled) return;
    try {
      await fs.mkdir(this.dir, { recursive: true });
      this._stream = createWriteStream(this.file, { flags: "a", encoding: "utf8" });
      this._stream.on("error", () => {}); // Silenciar errores de escritura
      this._ready = true;
    } catch {
      this._ready = false;
    }
  }

  /**
   * Registra una entrada de auditoría.
   * @param {object} entry
   * @param {string} entry.agent - Nombre del agente/cliente
   * @param {string} entry.tool - Dominio de la herramienta
   * @param {string} entry.action - Acción ejecutada
   * @param {object} entry.args - Argumentos (se sanitizan)
   * @param {string} entry.permission - Nivel de permiso requerido
   * @param {string} entry.result - "ok" | "error" | "denied" | "confirmation_required"
   * @param {number} entry.durationMs - Duración en ms
   * @param {string} [entry.error] - Mensaje de error si aplica
   * @param {string} [entry.traceId] - ID de trazabilidad
   */
  record({ agent, tool, action, args, permission, result, durationMs, error, traceId } = {}) {
    if (!this.enabled || !this._ready) return;

    const entry = {
      ts: new Date().toISOString(),
      agent: agent || "unknown",
      tool: tool || "unknown",
      action: action || "unknown",
      args: sanitizeArgs(args),
      permission: permission || "user",
      result: result || "ok",
      durationMs: durationMs || 0,
      ...(error ? { error: String(error).slice(0, 500) } : {}),
      ...(traceId ? { traceId } : {}),
    };

    try {
      this._stream?.write(JSON.stringify(entry) + "\n");
    } catch {}
  }

  /**
   * Lee las últimas N entradas del audit log.
   * @param {number} limit - Máximo de entradas a devolver
   * @returns {Promise<object[]>}
   */
  async readRecent(limit = 100) {
    try {
      const content = await fs.readFile(this.file, "utf8");
      const lines = content.trim().split("\n").filter(Boolean);
      return lines
        .slice(-limit)
        .map(line => {
          try { return JSON.parse(line); } catch { return null; }
        })
        .filter(Boolean)
        .reverse(); // Más recientes primero
    } catch {
      return [];
    }
  }

  /**
   * Filtra entradas del audit log.
   * @param {object} filters
   * @param {string} [filters.tool]
   * @param {string} [filters.action]
   * @param {string} [filters.result]
   * @param {string} [filters.agent]
   * @param {number} [filters.limit]
   */
  async search({ tool, action, result: resultFilter, agent, limit = 200 } = {}) {
    const recent = await this.readRecent(limit);
    return recent.filter(e => {
      if (tool && e.tool !== tool) return false;
      if (action && e.action !== action) return false;
      if (resultFilter && e.result !== resultFilter) return false;
      if (agent && e.agent !== agent) return false;
      return true;
    });
  }

  /** Estadísticas resumidas del audit log */
  async stats() {
    const recent = await this.readRecent(500);
    const byResult = {};
    const byTool = {};
    for (const e of recent) {
      byResult[e.result] = (byResult[e.result] || 0) + 1;
      byTool[e.tool] = (byTool[e.tool] || 0) + 1;
    }
    return {
      total: recent.length,
      byResult,
      byTool,
      lastEntry: recent[0] || null,
    };
  }

  close() {
    try { this._stream?.end(); } catch {}
  }
}
