// ============================================================================
// FLUXER MCP — Confirmation
// Solicitudes de permiso puntuales: cuando una acción requiere más nivel del
// que hay activo, en vez de fallar directo se crea una solicitud pendiente.
// El cliente MCP (Claude) se la muestra al humano; si dice "sí", se llama
// security.approve_request({ requestId }) y router.execute() REINTENTA esa
// llamada exacta una sola vez — no se otorga un grant genérico de horas
// como hace permissions.grant().
//
// NOTA: esta clase es puro estado en memoria + getters/setters de status.
// A propósito NO usa Promise/resolve/reject: nada en el sistema hace await
// sobre una solicitud pendiente (el reintento es una llamada nueva y
// explícita vía router.execute, no una continuación de la llamada original
// bloqueada). Una versión anterior sí creaba una Promise por request() y la
// rechazaba en deny()/expiración — como ningún código la esperaba nunca,
// cualquier deny_request generaba un unhandled promise rejection que hacía
// caer el proceso de Node completo (comportamiento default desde Node 15).
// ============================================================================

import crypto from "node:crypto";

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutos para responder
const MAX_PENDING = 50; // evita fugas de memoria si nadie responde nunca

export class ConfirmationStore {
  constructor({ logger, ttlMs = DEFAULT_TTL_MS } = {}) {
    this.logger = logger;
    this.ttlMs = ttlMs;
    this.pending = new Map(); // requestId -> { tool, action, args, required, current, status, createdAt, expiresAt }
  }

  prune() {
    const now = Date.now();
    for (const [id, req] of this.pending) {
      if (req.status === "pending" && req.expiresAt < now) {
        req.status = "expired";
        this.logger?.info("confirmation_expired", { requestId: id, tool: req.tool, action: req.action });
      } else if (req.status !== "pending" && now - req.createdAt > this.ttlMs * 3) {
        // Ya resuelta (approved/denied/expired/consumed) hace rato — se
        // conserva un tiempo corto para que request_status/approve_request
        // aún puedan consultarla, luego se limpia.
        this.pending.delete(id);
      }
    }
    if (this.pending.size > MAX_PENDING) {
      const oldest = [...this.pending.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
      for (const [id] of oldest.slice(0, this.pending.size - MAX_PENDING)) {
        this.pending.delete(id);
      }
    }
  }

  // Crea una solicitud pendiente. No devuelve ninguna promesa: el llamador
  // (router.mjs) responde de inmediato al cliente MCP con el requestId y
  // termina esa llamada ahí; la aprobación/denegación ocurre después, en una
  // llamada MCP completamente aparte (security.approve_request/deny_request).
  request({ tool, action, args, required, current }) {
    this.prune();
    const now = Date.now();

    // Estabilidad de código de confirmación (AFX-FB-U6VQTG Fix):
    // Si ya existe una solicitud pendiente válida para la misma herramienta y acción,
    // reutilizar el código y requestId existente para evitar regeneración dinámica continua.
    for (const [id, existing] of this.pending) {
      if (existing.status === "pending" && existing.tool === tool && existing.action === action && existing.expiresAt > now) {
        existing.expiresAt = now + this.ttlMs;
        existing.args = args;
        existing.required = required;
        existing.current = current;
        return { requestId: existing.requestId, confirmationCode: existing.confirmationCode, entry: existing };
      }
    }

    const requestId = crypto.randomUUID();
    const confirmationCode = crypto.randomBytes(2).toString("hex").toUpperCase();

    const entry = {
      requestId,
      confirmationCode,
      tool,
      action,
      args,
      required,
      current,
      status: "pending",
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };

    this.pending.set(requestId, entry);
    this.logger?.info("confirmation_requested", {
      requestId,
      confirmationCode,
      tool,
      action,
      required,
      current,
      expiresAt: new Date(entry.expiresAt).toISOString(),
    });

    return { requestId, confirmationCode, entry };
  }

  findByCode(code) {
    if (!code) return null;
    this.prune();
    const clean = String(code).trim().toUpperCase();
    const now = Date.now();
    for (const [id, req] of this.pending) {
      if (req.status === "pending" && req.confirmationCode === clean && req.expiresAt > now) {
        return req;
      }
    }
    return null;
  }

  get(requestId) {
    this.prune();
    return this.pending.get(requestId) ?? null;
  }

  approve(requestIdOrCode, options = {}) {
    let req = null;
    if (requestIdOrCode) {
      req = this.get(requestIdOrCode) || this.findByCode(requestIdOrCode);
    }
    const code = options.confirmationCode || options.code;
    if (!req && code) {
      req = this.findByCode(code);
    }
    if (!req) {
      const err = new Error(`confirmation_not_found: No se encontró solicitud pendiente para '${requestIdOrCode || code}'.`);
      err.code = "CONFIRMATION_NOT_FOUND";
      throw err;
    }
    if (req.status !== "pending") {
      const err = new Error(`confirmation_already_${req.status}: ${req.requestId}`);
      err.code = `CONFIRMATION_ALREADY_${req.status.toUpperCase()}`;
      throw err;
    }
    const checkCode = options.confirmationCode || options.code;
    if (checkCode && String(checkCode).trim().toUpperCase() !== req.confirmationCode) {
      const err = new Error(`confirmation_code_mismatch: El código de confirmación no coincide con la solicitud.`);
      err.code = "CONFIRMATION_CODE_MISMATCH";
      throw err;
    }
    req.status = "approved";
    req.grantMinutes = Number(options.grantMinutes || options.durationMinutes || options.minutes || 0);
    this.logger?.info("confirmation_approved", { requestId: req.requestId, confirmationCode: req.confirmationCode, tool: req.tool, action: req.action, grantMinutes: req.grantMinutes });
    return req;
  }

  deny(requestIdOrCode, reason = "denied by user") {
    const req = this.get(requestIdOrCode) || this.findByCode(requestIdOrCode);
    if (!req) throw new Error(`confirmation_not_found: ${requestIdOrCode}`);
    if (req.status !== "pending") {
      throw new Error(`confirmation_already_${req.status}: ${req.requestId}`);
    }
    req.status = "denied";
    req.denyReason = reason;
    this.logger?.info("confirmation_denied", { requestId: req.requestId, confirmationCode: req.confirmationCode, tool: req.tool, action: req.action, reason });
    return req;
  }

  list() {
    this.prune();
    return [...this.pending.values()].map((req) => ({
      requestId: req.requestId,
      confirmationCode: req.confirmationCode,
      tool: req.tool,
      action: req.action,
      required: req.required,
      current: req.current,
      status: req.status,
      createdAt: new Date(req.createdAt).toISOString(),
      expiresAt: new Date(req.expiresAt).toISOString(),
    }));
  }
}
