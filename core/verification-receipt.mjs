/**
 * 🪟 AERON FLUXER X — core/verification-receipt.mjs
 * Generador de Recibos de Verificación inmutables y firmados lógicamente.
 */

import crypto from "node:crypto";

export function createVerificationReceipt({
  operationId,
  requestId,
  correlationId,
  serviceId = null,
  environmentId = null,
  deployId = null,
  commitId = null,
  source = "live",
  cacheBypassed = true,
  expected = {},
  actual = {},
  checks = [],
  evidence = [],
  verificationStatus = "VERIFIED",
  tool = "unknown",
  domain = "unknown",
} = {}) {
  const verifiedAt = new Date().toISOString();
  const opId = operationId || `op_${crypto.randomUUID().slice(0, 8)}`;
  const reqId = requestId || `req_${crypto.randomUUID().slice(0, 8)}`;
  const corrId = correlationId || `corr_${opId}_${reqId}`;

  const payload = {
    result: verificationStatus === "VERIFIED" ? "PASS" : verificationStatus,
    verificationStatus,
    tool,
    domain,
    operationId: opId,
    requestId: reqId,
    correlationId: corrId,
    serviceId,
    environmentId,
    deployId,
    commitId,
    source,
    cacheBypassed: Boolean(cacheBypassed),
    expected,
    actual,
    checks: Array.isArray(checks) ? checks : [],
    evidence: Array.isArray(evidence) ? evidence : [],
    verifiedAt,
  };

  // Firma inmutable del recibo
  const rawString = JSON.stringify(payload);
  const verificationHash = crypto.createHash("sha256").update(rawString).digest("hex").slice(0, 16);

  return Object.freeze({
    ...payload,
    verificationHash,
  });
}
