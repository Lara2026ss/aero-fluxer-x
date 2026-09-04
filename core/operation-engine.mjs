/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚙️ AERON FLUXER X — core/operation-engine.mjs
 * Orquestador Central de Operaciones: Validate → Authorize → Execute → Verify → Return
 * ══════════════════════════════════════════════════════════════════════════════
 */

import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { FluxerError, ERROR_CODES, normalizeError } from "./errors.mjs";

export class OperationEngine {
  constructor({ runtime }) {
    this.runtime = runtime;
    this.activeOperations = new Map();
    this.operationHistory = [];
    this.maxHistory = 100;
  }

  /**
   * Genera un ID determinista y único para la operación.
   */
  generateOperationId() {
    return `op_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
  }

  /**
   * Ejecuta una operación a través del ciclo riguroso de 5 etapas:
   * 1. Validate
   * 2. Authorize
   * 3. Execute
   * 4. Verify
   * 5. Return
   */
  async execute(opts = {}) {
    return this.run({
      tool: opts.tool || opts.domain,
      action: opts.action,
      args: opts.args || opts.params || {},
      validate: opts.validate,
      authorize: opts.authorize,
      execute: opts.execute,
      verify: opts.verify,
      timeoutMs: opts.timeoutMs,
      signal: opts.signal
    });
  }

  async run({
    tool,
    action,
    args = {},
    validate = null,
    authorize = null,
    execute,
    verify = null,
    timeoutMs = 60000,
    signal = null,
  }) {
    const operationId = this.generateOperationId();
    const startedAt = new Date().toISOString();
    const startPerf = performance.now();

    const opRecord = {
      operationId,
      tool,
      action,
      startedAt,
      status: "running",
    };

    this.activeOperations.set(operationId, opRecord);

    const abortController = new AbortController();
    const combinedSignal = signal || abortController.signal;

    let timeoutId = null;
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        abortController.abort(new FluxerError(`Operación '${tool}.${action}' excedió el tiempo límite de ${timeoutMs}ms.`, {
          code: ERROR_CODES.TIMEOUT,
          operationId,
          retryable: true
        }));
      }, timeoutMs);
      timeoutId.unref?.();
    }

    try {
      // ── ETAPA 1: VALIDATE ──
      if (typeof validate === "function") {
        await validate(args, { operationId });
      }

      // ── ETAPA 2: AUTHORIZE ──
      if (typeof authorize === "function") {
        await authorize(args, { operationId, runtime: this.runtime });
      } else if (this.runtime?.permissions) {
        // Validación por defecto contra PermissionEngine
        const required = this.runtime.permissions.requiredFor?.({ tool, action });
        if (required && this.runtime.permissions.check) {
          this.runtime.permissions.check({ tool, action, required });
        }
      }

      // ── ETAPA 3: EXECUTE ──
      if (typeof execute !== "function") {
        throw new FluxerError(`No se especificó la función de ejecución para '${tool}.${action}'.`, {
          code: ERROR_CODES.INTERNAL_ERROR,
          operationId
        });
      }

      const executionResult = await execute(args, {
        operationId,
        runtime: this.runtime,
        signal: combinedSignal
      });

      // ── ETAPA 4: VERIFY ──
      let verificationResult = { verified: true };
      if (typeof verify === "function") {
        verificationResult = await verify(executionResult, args, {
          operationId,
          runtime: this.runtime
        });

        if (verificationResult && verificationResult.verified === false) {
          throw new FluxerError(
            verificationResult.reason || `La verificación física posterior falló para '${tool}.${action}'.`,
            {
              code: ERROR_CODES.VERIFICATION_FAILED,
              operationId,
              details: verificationResult
            }
          );
        }
      }

      // ── ETAPA 5: RETURN ──
      const durationMs = Math.round(performance.now() - startPerf);
      const finishedAt = new Date().toISOString();

      opRecord.status = "verified";
      opRecord.finishedAt = finishedAt;
      opRecord.durationMs = durationMs;

      const finalResponse = {
        ok: true,
        operationId,
        tool,
        action,
        durationMs,
        data: executionResult,
        verification: verificationResult,
        _verification: verificationResult,
        ...(typeof executionResult === "object" && executionResult !== null ? executionResult : { result: executionResult }),
      };

      this._recordCompletion(opRecord);
      return finalResponse;

    } catch (err) {
      const durationMs = Math.round(performance.now() - startPerf);
      const normalized = normalizeError(err, { tool, action, operationId });

      opRecord.status = "failed";
      opRecord.error = normalized.message;
      opRecord.code = normalized.code;
      opRecord.durationMs = durationMs;

      this._recordCompletion(opRecord);
      throw normalized;

    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      this.activeOperations.delete(operationId);
    }
  }

  _recordCompletion(record) {
    this.operationHistory.unshift({ ...record });
    if (this.operationHistory.length > this.maxHistory) {
      this.operationHistory.pop();
    }
  }

  getSnapshot() {
    return {
      activeCount: this.activeOperations.size,
      active: Array.from(this.activeOperations.values()),
      recentHistory: this.operationHistory.slice(0, 20),
    };
  }
}
