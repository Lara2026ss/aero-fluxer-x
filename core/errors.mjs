/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 AERON FLUXER X — core/errors.mjs
 * Sistema Centralizado de Errores Estructurados y Códigos Deterministas
 * ══════════════════════════════════════════════════════════════════════════════
 */

export const ERROR_CODES = Object.freeze({
  INVALID_ARGUMENT: "INVALID_ARGUMENT",
  NOT_FOUND: "NOT_FOUND",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  CONFLICT: "CONFLICT",
  TIMEOUT: "TIMEOUT",
  PROCESS_FAILED: "PROCESS_FAILED",
  VERIFICATION_FAILED: "VERIFICATION_FAILED",
  DEPENDENCY_ERROR: "DEPENDENCY_ERROR",
  SECURITY_BLOCKED: "SECURITY_BLOCKED",
  INTERNAL_ERROR: "INTERNAL_ERROR",

  // Capability Leases Error Codes
  LEASE_REQUIRED: "LEASE_REQUIRED",
  LEASE_NOT_FOUND: "LEASE_NOT_FOUND",
  LEASE_REVOKED: "LEASE_REVOKED",
  LEASE_EXPIRED: "LEASE_EXPIRED",
  LEASE_SCOPE_DENIED: "LEASE_SCOPE_DENIED",
  LEASE_BUDGET_EXHAUSTED: "LEASE_BUDGET_EXHAUSTED",
  PATH_OUTSIDE_LEASE: "PATH_OUTSIDE_LEASE",
  LEASE_TASK_MISMATCH: "LEASE_TASK_MISMATCH",
  LEASE_RUN_MISMATCH: "LEASE_RUN_MISMATCH",

  // DAG & Checkpoints Error Codes
  RUN_NOT_FOUND: "RUN_NOT_FOUND",
  RUN_NOT_RESUMABLE: "RUN_NOT_RESUMABLE",
  RUN_ALREADY_RESUMING: "RUN_ALREADY_RESUMING",
  CHECKPOINT_CONFLICT: "CHECKPOINT_CONFLICT",
});

export class FluxerError extends Error {
  constructor(message, { code = ERROR_CODES.INTERNAL_ERROR, operationId = null, retryable = false, details = {}, suggestion = null } = {}) {
    super(message);
    this.name = "FluxerError";
    this.code = code;
    this.operationId = operationId;
    this.retryable = retryable;
    this.details = details;
    this.suggestion = suggestion || this._defaultSuggestion(code);
  }

  _defaultSuggestion(code) {
    switch (code) {
      case ERROR_CODES.INVALID_ARGUMENT:
        return "Verifique los parámetros requeridos y los tipos de datos enviados a la subherramienta.";
      case ERROR_CODES.NOT_FOUND:
        return "Confirme que la ruta, recurso o identificador exista y sea accesible.";
      case ERROR_CODES.PERMISSION_DENIED:
        return "Solicite elevación de privilegios invocando 'security.start_workflow'.";
      case ERROR_CODES.SECURITY_BLOCKED:
        return "La acción solicitada viola una política de seguridad activa o afecta un recurso protegido del sistema.";
      case ERROR_CODES.TIMEOUT:
        return "Aumente el tiempo de espera o ejecute la operación en bloques más pequeños.";
      case ERROR_CODES.VERIFICATION_FAILED:
        return "La operación terminó pero el estado resultante no coincide con el objetivo esperado en disco/OS.";
      default:
        return "Consulte los detalles del error para diagnosticar la causa raíz.";
    }
  }

  toJSON() {
    return {
      ok: false,
      error: {
        code: this.code,
        message: this.message,
        operationId: this.operationId,
        retryable: this.retryable,
        suggestion: this.suggestion,
        details: this.details,
      },
    };
  }
}

/**
 * Normaliza cualquier error desconocido en un FluxerError estándar.
 */
export function normalizeError(err, { tool, action, operationId } = {}) {
  if (err instanceof FluxerError) {
    if (!err.operationId && operationId) err.operationId = operationId;
    return err;
  }

  const msg = String(err?.message || err || "Error desconocido");
  const lower = msg.toLowerCase();

  let code = ERROR_CODES.INTERNAL_ERROR;
  let retryable = false;

  if (lower.includes("required") || lower.includes("invalid") || lower.includes("inválid") || lower.includes("se requiere")) {
    code = ERROR_CODES.INVALID_ARGUMENT;
  } else if (lower.includes("not found") || lower.includes("enoent") || lower.includes("no existe") || lower.includes("no encontrado")) {
    code = ERROR_CODES.NOT_FOUND;
  } else if (lower.includes("permission") || lower.includes("denied") || lower.includes("permiso") || lower.includes("unauthorized")) {
    code = ERROR_CODES.PERMISSION_DENIED;
  } else if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("tiempo de espera")) {
    code = ERROR_CODES.TIMEOUT;
    retryable = true;
  } else if (lower.includes("already exists") || lower.includes("ya existe") || lower.includes("eexist")) {
    code = ERROR_CODES.ALREADY_EXISTS;
  } else if (lower.includes("conflict") || lower.includes("bloquead") || lower.includes("locked")) {
    code = ERROR_CODES.CONFLICT;
    retryable = true;
  } else if (lower.includes("security") || lower.includes("blocked") || lower.includes("prohibid")) {
    code = ERROR_CODES.SECURITY_BLOCKED;
  } else {
    code = ERROR_CODES.PROCESS_FAILED;
  }

  return new FluxerError(msg, {
    code,
    operationId,
    retryable,
    details: { tool, action, originalCode: err?.code },
  });
}

export const ERROR_TAXONOMY = Object.freeze({
  RECOVERABLE: "RECOVERABLE",
  TERMINAL: "TERMINAL",
});

/**
 * Gate 2: Deterministic Error Classifier
 * Classifies any error into RECOVERABLE or TERMINAL.
 * EBUSY, timeouts, locked resources and transient network failures are RECOVERABLE.
 * Schema violations, invalid arguments, permission denials, and exhausted leases are TERMINAL.
 */
export function classifyError(err) {
  if (!err) {
    return {
      taxonomy: ERROR_TAXONOMY.TERMINAL,
      retryable: false,
      code: "TERMINAL_ERROR",
      message: "No error provided",
      toString() { return ERROR_TAXONOMY.TERMINAL; },
      [Symbol.toPrimitive]() { return ERROR_TAXONOMY.TERMINAL; },
    };
  }

  const code = String(err.code || "").toUpperCase();
  const msg = String(err.message || err || "").toLowerCase();

  // 1. Definite recoverable codes
  const RECOVERABLE_CODES = new Set([
    "EBUSY",
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "TIMEOUT",
    "CONFLICT",
    "LOCKED",
    "RATE_LIMITED",
    "NETWORK_ERROR",
  ]);

  let isRecoverable = false;

  if (RECOVERABLE_CODES.has(code)) {
    isRecoverable = true;
  } else if (
    msg.includes("ebusy") ||
    msg.includes("resource busy") ||
    msg.includes("file is being used") ||
    msg.includes("archivo en uso") ||
    msg.includes("locked") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up") ||
    msg.includes("temporarily unavailable")
  ) {
    isRecoverable = true;
  } else if (err.retryable === true) {
    isRecoverable = true;
  }

  const taxonomy = isRecoverable ? ERROR_TAXONOMY.RECOVERABLE : ERROR_TAXONOMY.TERMINAL;
  return {
    taxonomy,
    retryable: isRecoverable,
    code: err.code || (isRecoverable ? "RECOVERABLE_ERROR" : "TERMINAL_ERROR"),
    message: err.message || String(err),
    toString() { return taxonomy; },
    [Symbol.toPrimitive]() { return taxonomy; },
  };
}
