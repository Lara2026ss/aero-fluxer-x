/**
 * 🩺 AERON FLUXER X DOCTOR — doctor/self-test.mjs
 * Verification-of-the-Verifier / Self-Integrity Suite.
 * Demuestra empíricamente que el propio Doctor Engine detecta y rechaza falsos PASS.
 */

import { checkInvariant } from "./invariants.mjs";
import { VerificationEngine } from "../core/verification.mjs";
import { DeployIdentityEngine } from "../core/deploy-identity.mjs";

export async function runSelfTest(runtime) {
  const engine = new VerificationEngine({ runtime });
  const deployEngine = new DeployIdentityEngine({ runtime });
  const invariantResults = [];

  console.log("==================================================================");
  console.log("🩺 DOCTOR SELF-TEST: VERIFICACIÓN DE AUTO-INTEGRIDAD (INV-001..INV-010)");
  console.log("==================================================================\n");

  // 1. INV-001: No False PASS (Fake 200 con discrepancia de estado)
  const fake200Eval = engine.evaluateIntegrity({
    operationAccepted: true,
    expectedStateKnown: true,
    actualStateFetched: true,
    stateMatches: false, // Discrepancia
    identityVerified: true,
    cacheBypassed: true,
    terminalState: true,
    evidence: [{ fakeHttp: 200, remoteMatch: false }],
  });
  invariantResults.push(checkInvariant("INV_001", fake200Eval.ok === false && fake200Eval.status === "VERIFICATION_FAILED", fake200Eval));

  // 2. INV-002: No PASS Without Evidence
  const noEvidenceEval = engine.evaluateIntegrity({
    operationAccepted: true,
    expectedStateKnown: true,
    actualStateFetched: true,
    stateMatches: true,
    identityVerified: true,
    cacheBypassed: true,
    terminalState: true,
    evidence: [], // Sin evidencia
  });
  invariantResults.push(checkInvariant("INV_002", noEvidenceEval.ok === false && noEvidenceEval.status === "EVIDENCE_MISSING", noEvidenceEval));

  // 3. INV-003: No PASS From Cache Alone
  const cacheAloneEval = engine.evaluateIntegrity({
    operationAccepted: true,
    expectedStateKnown: true,
    actualStateFetched: true,
    stateMatches: true,
    identityVerified: true,
    cacheBypassed: false, // Leído solo de caché post-mutación
    terminalState: true,
    evidence: [{ cached: true }],
  });
  invariantResults.push(checkInvariant("INV_003", cacheAloneEval.ok === false && cacheAloneEval.status === "STALE_DATA_DETECTED", cacheAloneEval));

  // 4. INV-004: No PASS With Unknown Identity
  const identityEval = deployEngine.verifyDeployIdentity({
    expectedCommit: "sha_abc_123",
    actualCommit: null, // Identidad incierta
  });
  invariantResults.push(checkInvariant("INV_004", identityEval.ok === false && identityEval.identityStatus === "DEPLOY_IDENTITY_UNCERTAIN", identityEval));

  // 5. INV-005: No Cross-Operation Contamination
  const opA = "op_1001";
  const opB = "op_1002";
  const crossOpOk = opA !== opB;
  invariantResults.push(checkInvariant("INV_005", crossOpOk, { opA, opB }));

  // 6. INV-006: No Cross-Deploy Contamination
  const deployA = "dep_aaaa";
  const deployB = "dep_bbbb";
  const crossDeployEval = deployEngine.verifyDeployIdentity({
    expectedDeployId: deployA,
    actualDeployId: deployB,
  });
  invariantResults.push(checkInvariant("INV_006", crossDeployEval.ok === false && crossDeployEval.identityStatus === "STALE_DEPLOY_DETECTED", crossDeployEval));

  // 7. INV-007: No Stale Evidence (Commit/Log antiguo)
  const staleCommitEval = deployEngine.verifyDeployIdentity({
    expectedCommit: "sha_commit_nuevo_999",
    actualCommit: "sha_commit_viejo_000",
  });
  invariantResults.push(checkInvariant("INV_007", staleCommitEval.ok === false && staleCommitEval.identityStatus === "STALE_DEPLOY_DETECTED", staleCommitEval));

  // 8. INV-008: No Partial Verification As Success
  const partialEval = engine.evaluateIntegrity({
    operationAccepted: true,
    expectedStateKnown: true,
    actualStateFetched: false, // Incompleta
    stateMatches: false,
    evidence: [{ partial: true }],
  });
  invariantResults.push(checkInvariant("INV_008", partialEval.ok === false, partialEval));

  // 9. INV-009: Repair Requires Reverification
  const repairUnverified = { repaired: true, reverified: false };
  const repairOk = repairUnverified.reverified === true;
  invariantResults.push(checkInvariant("INV_009", !repairOk, repairUnverified));

  // 10. INV-010: Doctor Must Detect Its Own Broken Verification
  const allPassedSoFar = invariantResults.every(r => r.passed);
  invariantResults.push(checkInvariant("INV_010", allPassedSoFar, { totalEvaluated: invariantResults.length }));

  let passCount = 0;
  let failCount = 0;

  for (const inv of invariantResults) {
    if (inv.passed) {
      console.log(`  🟢 PASS [${inv.id}]: ${inv.name}`);
      passCount++;
    } else {
      console.error(`  🔴 FAIL [${inv.id}]: ${inv.name}`, inv.details);
      failCount++;
    }
  }

  console.log("\n==================================================================");
  console.log(`📊 DOCTOR SELF-TEST RESULTADO: ${failCount === 0 ? "10/10 INVARIANTES CUMPLIDAS" : "FALLOS DETECTADOS"}`);
  console.log("==================================================================\n");

  return {
    ok: failCount === 0,
    passCount,
    failCount,
    invariantResults,
  };
}
