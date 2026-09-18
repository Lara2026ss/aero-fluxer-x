/**
 * 🪟 AERON FLUXER X — core/deploy-identity.mjs
 * Motor de Identidad de Deploy y Commit (Deploy Identity Engine).
 * Vincula inequívocamente commit esperado vs commit desplegado.
 */

export class DeployIdentityEngine {
  constructor({ runtime }) {
    this.runtime = runtime;
  }

  verifyDeployIdentity({
    expectedCommit = null,
    actualCommit = null,
    expectedDeployId = null,
    actualDeployId = null,
    expectedServiceId = null,
    actualServiceId = null,
  } = {}) {
    // Si no se puede identificar ni commit ni deploy -> Incertidumbre
    if (!actualCommit && !actualDeployId) {
      return {
        identityStatus: "DEPLOY_IDENTITY_UNCERTAIN",
        ok: false,
        confidence: 0,
        reason: "No fue posible identificar con certeza el commit o el ID del deploy ejecutado.",
      };
    }

    const commitMatches = expectedCommit && actualCommit
      ? (expectedCommit.toLowerCase().startsWith(actualCommit.toLowerCase()) || actualCommit.toLowerCase().startsWith(expectedCommit.toLowerCase()))
      : true;

    const deployMatches = expectedDeployId && actualDeployId
      ? (expectedDeployId === actualDeployId)
      : true;

    const serviceMatches = expectedServiceId && actualServiceId
      ? (expectedServiceId === actualServiceId)
      : true;

    if (!serviceMatches) {
      return {
        identityStatus: "WRONG_SERVICE_LOGS",
        ok: false,
        confidence: 0,
        reason: `El servicio actual (${actualServiceId}) no coincide con el solicitado (${expectedServiceId}).`,
      };
    }

    if (!commitMatches) {
      return {
        identityStatus: "STALE_DEPLOY_DETECTED",
        ok: false,
        confidence: 0.2,
        reason: `El commit desplegado en vivo (${actualCommit}) no coincide con el commit solicitado (${expectedCommit}).`,
      };
    }

    if (!deployMatches) {
      return {
        identityStatus: "STALE_DEPLOY_DETECTED",
        ok: false,
        confidence: 0.3,
        reason: `El deploy ID activo (${actualDeployId}) no coincide con el deploy ID solicitado (${expectedDeployId}).`,
      };
    }

    return {
      identityStatus: "VERIFIED",
      ok: true,
      confidence: 1.0,
      reason: "La identidad del deploy y commit coincide unívocamente.",
    };
  }
}
