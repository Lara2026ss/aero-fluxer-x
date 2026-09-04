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
