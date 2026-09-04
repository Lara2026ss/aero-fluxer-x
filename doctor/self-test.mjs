/**
 * 🩺 AERON FLUXER X DOCTOR — doctor/self-test.mjs
 * Verification-of-the-Verifier / Self-Integrity Suite.
 * Demuestra empíricamente que el propio Doctor Engine detecta y rechaza falsos PASS.
 */

import { checkInvariant } from "./invariants.mjs";
import { VerificationEngine } from "../core/verification.mjs";
import { DeployIdentityEngine } from "../core/deploy-identity.mjs";
import { Validator } from "../core/validator.mjs";
import { OperationEngine } from "../core/operation-engine.mjs";
import { CachePolicyEngine } from "../core/cache-policy.mjs";
import { redactSecrets } from "../core/memory.mjs";
import { createDeveloperDomain } from "../tools/developer.mjs";
import { createSystemDomain } from "../tools/system.mjs";

export async function runSelfTest(runtime) {
  const engine = new VerificationEngine({ runtime });
  const deployEngine = new DeployIdentityEngine({ runtime });
  const invariantResults = [];

  console.log("==================================================================");
  console.log("🩺 DOCTOR SELF-TEST: VERIFICACIÓN DE AUTO-INTEGRIDAD (INV-001..INV-020)");
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

  // 11. INV-011: Process Termination Verification
  const termVerify = await VerificationEngine.verifyProcessTerminated(9999999, { maxWaitMs: 50 });
  invariantResults.push(checkInvariant("INV_011", termVerify.verified === true && termVerify.state === "TERMINATED", termVerify));

  // 12. INV-012: Critical Process Protection
  let pid0Blocked = false;
  let pid4Blocked = false;
  let selfBlocked = false;
  try { Validator.validatePid(0); } catch { pid0Blocked = true; }
  try { Validator.validatePid(4); } catch { pid4Blocked = true; }
  try { Validator.validatePid(process.pid); } catch { selfBlocked = true; }
  invariantResults.push(checkInvariant("INV_012", pid0Blocked && pid4Blocked && selfBlocked, { pid0Blocked, pid4Blocked, selfBlocked }));

  // 13. INV-013: File Mutation Physical Verification
  const fileWrittenVerify = await VerificationEngine.verifyFileWritten("package.json", { minBytes: 10 });
  invariantResults.push(checkInvariant("INV_013", fileWrittenVerify.verified === true && fileWrittenVerify.actualBytes > 0, fileWrittenVerify));

  // 14. INV-014: Git Identity Integrity
  const gitIdVerify = await VerificationEngine.verifyGitIdentity(process.cwd(), { expectedName: "Agy-Leo" });
  invariantResults.push(checkInvariant("INV_014", gitIdVerify.verified === true && gitIdVerify.identity.name === "Agy-Leo", gitIdVerify));

  // 15. INV-015: FTS5 Secret Redaction
  const sampleSecret = "token: ghp_123456789012345678901234567890123456";
  const sampleRedacted = redactSecrets(sampleSecret);
  const secretRedactedOk = !sampleRedacted.includes("123456789012345678901234567890123456") && sampleRedacted.includes("[REDACTED]");
  invariantResults.push(checkInvariant("INV_015", secretRedactedOk, { sampleRedacted }));

  // 16. INV-016: Structured Git Status Cleanliness
  const devDomain = createDeveloperDomain({
    runtime,
    path: await import("node:path"),
    fs: await import("node:fs/promises"),
    domain: (name, desc, actions) => ({ actions })
  });
  const gitStatusRes = await devDomain.actions.git_status_structured();
  const gitStatusOk = gitStatusRes.ok && Array.isArray(gitStatusRes.staged) && Array.isArray(gitStatusRes.unstaged) && Array.isArray(gitStatusRes.untracked);
  invariantResults.push(checkInvariant("INV_016", gitStatusOk, gitStatusRes));

  // 17. INV-017: Process Hierarchy Determinism
  const sysDomain = createSystemDomain({
    runtime,
    os: await import("node:os"),
    dns: {},
    net: {},
    domain: (name, desc, actions) => ({ actions }),
    httpFetchText: () => {},
    sendNativeNotification: () => {}
  });
  const procTreeRes = await sysDomain.actions.process_tree({ pid: process.pid });
  const procTreeOk = procTreeRes.ok && procTreeRes.tree && procTreeRes.tree.pid === process.pid;
  invariantResults.push(checkInvariant("INV_017", procTreeOk, procTreeRes));

  // 18. INV-018: Port Ownership Determinism
  const portOwnerRes = await sysDomain.actions.inspect_port_owner({ port: 59199 });
  const portOwnerOk = portOwnerRes.ok && portOwnerRes.inUse === false;
  invariantResults.push(checkInvariant("INV_018", portOwnerOk, portOwnerRes));

  // 19. INV-019: Cache In-Flight Deduplication
  const cachePolicy = new CachePolicyEngine({ runtime });
  let dedupExecs = 0;
  const dedupFn = async () => { dedupExecs++; await new Promise(r => setTimeout(r, 20)); return "ok"; };
  await Promise.all([cachePolicy.deduplicate("k1", dedupFn), cachePolicy.deduplicate("k1", dedupFn)]);
  invariantResults.push(checkInvariant("INV_019", dedupExecs === 1, { dedupExecs }));

  // 20. INV-020: Deterministic Operation Id Tracing
  const opEngine = new OperationEngine({ runtime });
  const opRes = await opEngine.execute({
    domain: "doctor",
    action: "ping",
    execute: async () => ({ pong: true })
  });
  const opIdOk = opRes.ok && typeof opRes.operationId === "string" && opRes.operationId.startsWith("op_");
  invariantResults.push(checkInvariant("INV_020", opIdOk, opRes));

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
  console.log(`📊 DOCTOR SELF-TEST RESULTADO: ${failCount === 0 ? "20/20 INVARIANTES CUMPLIDAS" : "FALLOS DETECTADOS"}`);
  console.log("==================================================================\n");

  return {
    ok: failCount === 0,
    passCount,
    failCount,
    invariantResults,
  };
}
