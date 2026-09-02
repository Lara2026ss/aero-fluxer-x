/**
 * 🩺 AERON FLUXER X DOCTOR — doctor/adversarial.mjs
 * Motor Verificador Adversarial con Aislamiento de Sandbox para Pruebas Destructivas.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { VerificationEngine } from "../core/verification.mjs";
import { DeployIdentityEngine } from "../core/deploy-identity.mjs";

export const TEST_RISK_LEVEL = Object.freeze({
  READ_ONLY: "READ-ONLY TEST",
  SAFE_LIVE: "SAFE LIVE TEST",
  CONTROLLED_MUTATION: "CONTROLLED MUTATION",
  DESTRUCTIVE: "DESTRUCTIVE TEST",
});

export async function runAdversarialSuite(router, runtime) {
  const verifier = new VerificationEngine({ runtime });
  const deployEngine = new DeployIdentityEngine({ runtime });
  const adversarialResults = [];

  const sandboxDir = path.join(process.cwd(), "storage", "cache", "adversarial_sandbox");
  await fs.mkdir(sandboxDir, { recursive: true });

  const recordTest = (name, risk, expectedStatus, actualStatus, passCond) => {
    adversarialResults.push({
      testName: name,
      riskLevel: risk,
      expectedStatus,
      actualStatus,
      passed: Boolean(passCond),
    });
  };

  // Test A — HTTP 200 Falso (Respuesta HTTP 200 pero contenido devuelto corrupto/incompleto)
  try {
    const fakeRes = await verifier.evaluateIntegrity({
      operationAccepted: true,
      expectedStateKnown: true,
      actualStateFetched: true,
      stateMatches: false, // Fake 200
      identityVerified: true,
      cacheBypassed: true,
      terminalState: true,
      evidence: [{ httpStatus: 200, match: false }],
    });
    recordTest(
      "HTTP 200 Falso con discrepancia remota",
      TEST_RISK_LEVEL.READ_ONLY,
      "VERIFICATION_FAILED",
      fakeRes.status,
      fakeRes.status === "VERIFICATION_FAILED" && fakeRes.ok === false
    );
  } catch (e) {
    recordTest("HTTP 200 Falso con discrepancia remota", TEST_RISK_LEVEL.READ_ONLY, "VERIFICATION_FAILED", "ERROR", false);
  }

  // Test B — Cache Stale (Verificación leyendo de caché local tras mutación)
  try {
    const staleRes = await verifier.evaluateIntegrity({
      operationAccepted: true,
      expectedStateKnown: true,
      actualStateFetched: true,
      stateMatches: true,
      identityVerified: true,
      cacheBypassed: false, // Stale cache
      terminalState: true,
      evidence: [{ fromCache: true }],
    });
    recordTest(
      "Rechazo de verificación desde Caché Stale",
      TEST_RISK_LEVEL.READ_ONLY,
      "STALE_DATA_DETECTED",
      staleRes.status,
      staleRes.status === "STALE_DATA_DETECTED" && staleRes.ok === false
    );
  } catch (e) {
    recordTest("Rechazo de verificación desde Caché Stale", TEST_RISK_LEVEL.READ_ONLY, "STALE_DATA_DETECTED", "ERROR", false);
  }

  // Test C — Deploy y Commit Equivocado
  try {
    const wrongDeployRes = deployEngine.verifyDeployIdentity({
      expectedCommit: "commit_abc_expected",
      actualCommit: "commit_xyz_different",
    });
    recordTest(
      "Detección de Deploy/Commit Erróneo (Stale Deploy)",
      TEST_RISK_LEVEL.READ_ONLY,
      "STALE_DEPLOY_DETECTED",
      wrongDeployRes.identityStatus,
      wrongDeployRes.identityStatus === "STALE_DEPLOY_DETECTED" && wrongDeployRes.ok === false
    );
  } catch (e) {
    recordTest("Detección de Deploy/Commit Erróneo", TEST_RISK_LEVEL.READ_ONLY, "STALE_DEPLOY_DETECTED", "ERROR", false);
  }

  // Test D — Pruebas de Mutación Controlada en Sandbox (Escritura y Eliminación segura)
  try {
    const sandboxFile = path.join(sandboxDir, "sandbox_test.txt");
    await fs.writeFile(sandboxFile, "Sandbox content test", "utf8");
    const exists = await fs.access(sandboxFile).then(() => true).catch(() => false);
    await fs.unlink(sandboxFile).catch(() => {});
    const deleted = !(await fs.access(sandboxFile).then(() => true).catch(() => false));

    recordTest(
      "Mutación Controlada y Eliminación en Sandbox Aislado",
      TEST_RISK_LEVEL.CONTROLLED_MUTATION,
      "VERIFIED",
      exists && deleted ? "VERIFIED" : "FAILED",
      exists && deleted
    );
  } catch (e) {
    recordTest("Mutación Controlada en Sandbox", TEST_RISK_LEVEL.CONTROLLED_MUTATION, "VERIFIED", "ERROR", false);
  }

  // Limpiar sandbox
  await fs.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});

  const passCount = adversarialResults.filter(r => r.passed).length;
  const failCount = adversarialResults.length - passCount;

  return {
    ok: failCount === 0,
    totalTests: adversarialResults.length,
    passCount,
    failCount,
    results: adversarialResults,
  };
}
