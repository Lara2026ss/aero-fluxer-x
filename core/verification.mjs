/**
 * 🪟 AERON FLUXER X — core/verification.mjs
 * Motor Central de Verificación de Estado Real y Pipeline Estricto.
 */

import { createVerificationReceipt } from "./verification-receipt.mjs";

export const VERIFICATION_STATUS = Object.freeze({
  REQUESTED: "REQUESTED",
  REQUEST_ACCEPTED: "REQUEST_ACCEPTED",
  IN_PROGRESS: "IN_PROGRESS",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  TIMED_OUT: "TIMED_OUT",
  VERIFICATION_PENDING: "VERIFICATION_PENDING",
  VERIFIED: "VERIFIED",
  VERIFICATION_FAILED: "VERIFICATION_FAILED",
  STALE_DATA_DETECTED: "STALE_DATA_DETECTED",
  STALE_DEPLOY_DETECTED: "STALE_DEPLOY_DETECTED",
  DEPLOY_IDENTITY_UNCERTAIN: "DEPLOY_IDENTITY_UNCERTAIN",
  CACHE_BYPASSED: "CACHE_BYPASSED",
  CACHE_INVALIDATED: "CACHE_INVALIDATED",
  CONFIGURATION_VERIFICATION_FAILED: "CONFIGURATION_VERIFICATION_FAILED",
  LOG_VERIFICATION_FAILED: "LOG_VERIFICATION_FAILED",
  COMMIT_VERIFICATION_FAILED: "COMMIT_VERIFICATION_FAILED",
  SERVICE_VERIFICATION_FAILED: "SERVICE_VERIFICATION_FAILED",
  VERIFICATION_BYPASS_DETECTED: "VERIFICATION_BYPASS_DETECTED",
  MUTATION_PIPELINE_BYPASS: "MUTATION_PIPELINE_BYPASS",
  EVIDENCE_MISSING: "EVIDENCE_MISSING",
});

export class VerificationEngine {
  constructor({ runtime }) {
    this.runtime = runtime;
  }

  /**
   * Evalúa la regla de integridad global para determinar si un estado es genuinamente VERIFIED
   */
  evaluateIntegrity({
    operationAccepted = false,
    expectedStateKnown = false,
    actualStateFetched = false,
    stateMatches = false,
    identityVerified = true,
    cacheBypassed = true,
    terminalState = true,
    evidence = [],
  } = {}) {
    const checks = [];

    if (operationAccepted) checks.push("operationAccepted");
    if (expectedStateKnown) checks.push("expectedStateKnown");
    if (actualStateFetched) checks.push("actualStateFetched");
    if (stateMatches) checks.push("stateMatches");
    if (identityVerified) checks.push("identityVerified");
    if (cacheBypassed) checks.push("cacheBypassed");
    if (terminalState) checks.push("terminalState");

    if (!Array.isArray(evidence) || evidence.length === 0) {
      return {
        status: VERIFICATION_STATUS.EVIDENCE_MISSING,
        ok: false,
        reason: "No se proporcionó objeto de evidencia independiente.",
        checks,
      };
    }

    if (!identityVerified) {
      return {
        status: VERIFICATION_STATUS.DEPLOY_IDENTITY_UNCERTAIN,
        ok: false,
        reason: "La identidad del recurso/deploy no pudo ser verificada con certeza.",
        checks,
      };
    }

    if (!cacheBypassed) {
      return {
        status: VERIFICATION_STATUS.STALE_DATA_DETECTED,
        ok: false,
        reason: "La verificación proviene de caché sin haber ejecutado bypass directo a la API viva.",
        checks,
      };
    }

    const allConditionsPassed =
      operationAccepted &&
      expectedStateKnown &&
      actualStateFetched &&
      stateMatches &&
      identityVerified &&
      cacheBypassed &&
      terminalState;

    if (allConditionsPassed) {
      return {
        status: VERIFICATION_STATUS.VERIFIED,
        ok: true,
        reason: "Operación verificada con evidencia independiente completa.",
        checks,
      };
    }

    return {
      status: VERIFICATION_STATUS.VERIFICATION_FAILED,
      ok: false,
      reason: "Las condiciones de verificación no coinciden entre el estado esperado y el estado real.",
      checks,
    };
  }

  createReceipt(opts) {
    const evalResult = this.evaluateIntegrity(opts);
    return createVerificationReceipt({
      ...opts,
      verificationStatus: evalResult.status,
    });
  }

  /**
   * Verifica físicamente en disco que un archivo fue escrito correctamente.
   */
  static async verifyFileWritten(targetPath, { minBytes = 0 } = {}) {
    const fs = await import("node:fs/promises");
    try {
      const stat = await fs.stat(targetPath);
      if (stat.size < minBytes) {
        return {
          verified: false,
          reason: `El archivo existe pero su tamaño (${stat.size}B) es menor al esperado (${minBytes}B).`,
          actualBytes: stat.size,
        };
      }
      return {
        verified: true,
        actualBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    } catch (e) {
      return {
        verified: false,
        reason: `El archivo no se encuentra físicamente en el disco tras la escritura: ${e.message}`,
      };
    }
  }

  /**
   * Verifica físicamente que un archivo fue eliminado y ya no existe.
   */
  static async verifyFileDeleted(targetPath) {
    const fs = await import("node:fs/promises");
    try {
      await fs.access(targetPath);
      return {
        verified: false,
        reason: `El archivo aún existe en disco después de la orden de eliminación.`,
      };
    } catch {
      return { verified: true, state: "ABSENT" };
    }
  }

  /**
   * Verifica físicamente que un proceso de Windows ha terminado.
   */
  static async verifyProcessTerminated(pid, { maxWaitMs = 1500 } = {}) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        process.kill(pid, 0); // Lanza excepción si el PID ya no existe
        await new Promise((r) => setTimeout(r, 100));
      } catch {
        return { verified: true, pid, state: "TERMINATED" };
      }
    }
    return {
      verified: false,
      pid,
      reason: `El proceso con PID ${pid} sigue activo tras la orden de terminación.`,
    };
  }

  /**
   * Verifica la identidad local activa en un repositorio Git.
   */
  static async verifyGitIdentity(repoDir, { expectedName, expectedEmail } = {}) {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);

    try {
      const { stdout: actualName } = await execAsync("git config --local user.name", { cwd: repoDir });
      const { stdout: actualEmail } = await execAsync("git config --local user.email", { cwd: repoDir });

      const name = actualName.trim();
      const email = actualEmail.trim();

      const nameMatches = expectedName ? name === expectedName : true;
      const emailMatches = expectedEmail ? email === expectedEmail : true;

      if (!nameMatches || !emailMatches) {
        return {
          verified: false,
          reason: `La identidad Git no coincide. Esperado: ${expectedName} <${expectedEmail}>, Actual: ${name} <${email}>`,
          actual: { name, email },
        };
      }

      return {
        verified: true,
        identity: { name, email },
      };
    } catch (e) {
      return {
        verified: false,
        reason: `No se pudo verificar la identidad Git en ${repoDir}: ${e.message}`,
      };
    }
  }
}

