/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🛡️ AERON FLUXER X — core/validator.mjs
 * Validador Centralizado Determinista para Argumentos y Entradas
 * ══════════════════════════════════════════════════════════════════════════════
 */

import path from "node:path";
import os from "node:os";
import { FluxerError, ERROR_CODES } from "./errors.mjs";

export class Validator {
  /**
   * Valida y normaliza una ruta de archivo o directorio.
   */
  static validatePath(rawPath, { required = true, fieldName = "path", allowRelative = true, baseDir = process.cwd() } = {}) {
    if (rawPath === undefined || rawPath === null || rawPath === "") {
      if (required) {
        throw new FluxerError(`El parámetro '${fieldName}' es requerido y no puede estar vacío.`, {
          code: ERROR_CODES.INVALID_ARGUMENT,
          details: { field: fieldName }
        });
      }
      return null;
    }

    if (typeof rawPath !== "string") {
      throw new FluxerError(`El parámetro '${fieldName}' debe ser una cadena de texto.`, {
        code: ERROR_CODES.INVALID_ARGUMENT,
        details: { field: fieldName, type: typeof rawPath }
      });
    }

    let normalized = rawPath.trim();
    if (normalized.startsWith("~")) {
      normalized = path.join(os.homedir(), normalized.slice(1));
    }

    if (!path.isAbsolute(normalized)) {
      if (!allowRelative) {
        throw new FluxerError(`El parámetro '${fieldName}' debe ser una ruta absoluta.`, {
          code: ERROR_CODES.INVALID_ARGUMENT,
          details: { path: rawPath }
        });
      }
      normalized = path.resolve(baseDir, normalized);
    }

    return path.normalize(normalized);
  }

  /**
   * Valida un puerto de red (1 - 65535).
   */
  static validatePort(rawPort, { fieldName = "port", required = true } = {}) {
    if (rawPort === undefined || rawPort === null || rawPort === "") {
      if (required) {
        throw new FluxerError(`El parámetro '${fieldName}' es requerido.`, {
          code: ERROR_CODES.INVALID_ARGUMENT,
          details: { field: fieldName }
        });
      }
      return null;
    }

    const port = Number(rawPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new FluxerError(`Puerto inválido '${rawPort}'. Debe ser un entero entre 1 y 65535.`, {
        code: ERROR_CODES.INVALID_ARGUMENT,
        details: { field: fieldName, value: rawPort }
      });
    }

    return port;
  }

  /**
   * Valida un Process ID (PID) protegiendo PIDs reservados y del sistema.
   */
  static validatePid(rawPid, { fieldName = "pid", required = true, protectSystemPids = true, protectSelf = true } = {}) {
    if (rawPid === undefined || rawPid === null || rawPid === "") {
      if (required) {
        throw new FluxerError(`El parámetro '${fieldName}' es requerido.`, {
          code: ERROR_CODES.INVALID_ARGUMENT,
          details: { field: fieldName }
        });
      }
      return null;
    }

    const pid = Number(rawPid);
    if (!Number.isInteger(pid) || pid < 0) {
      throw new FluxerError(`PID inválido '${rawPid}'. Debe ser un número entero positivo.`, {
        code: ERROR_CODES.INVALID_ARGUMENT,
        details: { field: fieldName, value: rawPid }
      });
    }

    if (protectSystemPids && (pid === 0 || pid === 4)) {
      throw new FluxerError(`Operación denegada: El PID ${pid} corresponde a un proceso crítico del núcleo de Windows (System/Idle).`, {
        code: ERROR_CODES.SECURITY_BLOCKED,
        details: { pid }
      });
    }

    if (protectSelf && pid === process.pid) {
      throw new FluxerError(`Operación denegada: No se permite terminar el propio proceso de Aeron Fluxer X (PID ${pid}).`, {
        code: ERROR_CODES.SECURITY_BLOCKED,
        details: { pid }
      });
    }

    return pid;
  }

  /**
   * Valida que un valor pertenezca a un enum permitido.
   */
  static validateEnum(value, allowedValues, fieldName = "parameter") {
    const list = Array.isArray(allowedValues) ? allowedValues : Array.from(allowedValues);
    if (!list.includes(value)) {
      throw new FluxerError(`Valor inválido '${value}' para '${fieldName}'. Opciones permitidas: ${list.join(", ")}`, {
        code: ERROR_CODES.INVALID_ARGUMENT,
        details: { field: fieldName, value, allowed: list }
      });
    }
    return value;
  }

  /**
   * Valida una cadena de texto no vacía.
   */
  static validateNonEmptyString(value, fieldName = "parameter") {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new FluxerError(`El parámetro '${fieldName}' debe ser una cadena de texto no vacía.`, {
        code: ERROR_CODES.INVALID_ARGUMENT,
        details: { field: fieldName, value }
      });
    }
    return value.trim();
  }

  /**
   * Valida un número dentro de límites opcionales.
   */
  static validateNumber(value, { fieldName = "number", min, max, required = true } = {}) {
    if (value === undefined || value === null) {
      if (required) {
        throw new FluxerError(`El parámetro '${fieldName}' es requerido.`, {
          code: ERROR_CODES.INVALID_ARGUMENT,
          details: { field: fieldName }
        });
      }
      return null;
    }

    const n = Number(value);
    if (isNaN(n) || !isFinite(n)) {
      throw new FluxerError(`El parámetro '${fieldName}' debe ser un número válido.`, {
        code: ERROR_CODES.INVALID_ARGUMENT,
        details: { field: fieldName, value }
      });
    }

    if (min !== undefined && n < min) {
      throw new FluxerError(`El parámetro '${fieldName}' debe ser mayor o igual a ${min}.`, {
        code: ERROR_CODES.INVALID_ARGUMENT,
        details: { field: fieldName, value: n, min }
      });
    }

    if (max !== undefined && n > max) {
      throw new FluxerError(`El parámetro '${fieldName}' no puede exceder ${max}.`, {
        code: ERROR_CODES.INVALID_ARGUMENT,
        details: { field: fieldName, value: n, max }
      });
    }

    return n;
  }
}
