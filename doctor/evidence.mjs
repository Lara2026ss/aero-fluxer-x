/**
 * 🩺 AERON FLUXER X DOCTOR — doctor/evidence.mjs
 * Motor de Ensamblado y Validación de Objetos de Evidencia Estructurada.
 */

export function buildEvidenceRecord({
  tool,
  domain,
  operationId,
  correlationId,
  expected,
  actual,
  checks = [],
  rawOutput = null,
} = {}) {
  return {
    timestamp: new Date().toISOString(),
    tool,
    domain,
    operationId: operationId || null,
    correlationId: correlationId || null,
    expectedState: expected || {},
    actualState: actual || {},
    verificationChecks: Array.isArray(checks) ? checks : [],
    rawOutputSample: rawOutput ? String(rawOutput).slice(0, 500) : null,
  };
}

export function validateEvidenceSufficiency(evidence) {
  if (!evidence) return false;
  if (Array.isArray(evidence)) return evidence.length > 0;
  if (typeof evidence === "object") return Object.keys(evidence).length > 0;
  return false;
}
