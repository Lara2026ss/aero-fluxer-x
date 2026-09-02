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
}
