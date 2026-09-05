import assert from "node:assert";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";
import { CURRENT_VERSION } from "../core/version.mjs";
import { normalizeLevel, LEVEL_RANK } from "../core/permissions.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function runV10_3_Tests() {
  console.log("=== Corriendo Suite de Pruebas Oficial v10.3.0 ===");

  const runtime = await createRuntime({ root: ROOT, version: CURRENT_VERSION });
  const registry = new Registry(runtime);
  await registry.load();
  runtime._registry = registry;
  const router = new Router({ runtime, registry });
  runtime.router = router;

  // 1. Versioning
  console.log("-> 1. Versión del core...");
  assert.strictEqual(CURRENT_VERSION, "10.3.0", "CURRENT_VERSION must be 10.3.0");

  // 2. Canonical permissions hierarchy & Aliases
  console.log("-> 2. Jerarquía canónica y normalización de alias...");
  assert.strictEqual(normalizeLevel("guest"), "visitor");
  assert.strictEqual(normalizeLevel("visitor"), "visitor");
  assert.strictEqual(normalizeLevel("user"), "standard");
  assert.strictEqual(normalizeLevel("standard"), "standard");
  assert.strictEqual(normalizeLevel("poweruser"), "advanced");
  assert.strictEqual(normalizeLevel("advanced"), "advanced");
  assert.strictEqual(normalizeLevel("admin"), "maintainer");
  assert.strictEqual(normalizeLevel("maintainer"), "maintainer");
  assert.strictEqual(normalizeLevel("admintotaluser"), "system_root");
  assert.strictEqual(normalizeLevel("system_root"), "system_root");

  assert.ok(LEVEL_RANK["standard"] > LEVEL_RANK["visitor"]);
  assert.ok(LEVEL_RANK["advanced"] > LEVEL_RANK["standard"]);
  assert.ok(LEVEL_RANK["maintainer"] > LEVEL_RANK["advanced"]);
  assert.ok(LEVEL_RANK["developer"] > LEVEL_RANK["maintainer"]);
  assert.ok(LEVEL_RANK["system_root"] > LEVEL_RANK["developer"]);

  // 3. packages.check_manager does NOT require poweruser/advanced
  console.log("-> 3. packages.check_manager en nivel standard...");
  const pkgCheckRes = await runtime.router.execute({
    tool: "packages",
    action: "check_manager",
    args: { manager: "npm" }
  });
  assert.strictEqual(pkgCheckRes.ok, true, "check_manager should succeed at default level");
  assert.notStrictEqual(pkgCheckRes.code, "PERMISSION_DENIED");
  assert.notStrictEqual(pkgCheckRes.code, "CONFIRMATION_REQUIRED");

  // 4. upd check / upd_check inspects repository and respects revealPath
  console.log("-> 4. upd_check e inspección de repo con path privacy...");
  const updCheckPrivate = await runtime.router.execute({
    tool: "developer",
    action: "upd_check",
    args: { checkRepo: true, force: true, revealPath: false }
  });
  assert.strictEqual(updCheckPrivate.ok, true, "upd_check must succeed");
  assert.strictEqual(updCheckPrivate.repo_checked, true);
  assert.ok(updCheckPrivate.git_repo !== undefined, "git_repo must be present");

  const username = os.userInfo?.()?.username || process.env.USERNAME || "";
  if (username) {
    const rawDump = JSON.stringify(updCheckPrivate.git_repo);
    assert.strictEqual(rawDump.toLowerCase().includes(username.toLowerCase()), false, "Private upd_check must not leak username");
  }

  // With revealPath: true, it allows unmasked path
  const updCheckRevealed = await runtime.router.execute({
    tool: "developer",
    action: "upd_check",
    args: { checkRepo: true, force: true, revealPath: true }
  });
  assert.strictEqual(updCheckRevealed.ok, true);
  assert.ok(updCheckRevealed.path_privacy.includes("Ruta visible"));

  // git_status_structured with path privacy
  const gitStatusPrivate = await runtime.router.execute({
    tool: "developer",
    action: "git_status_structured",
    args: { path: ".", revealPath: false }
  });
  assert.strictEqual(gitStatusPrivate.ok, true);
  if (username) {
    assert.strictEqual(gitStatusPrivate.repoRoot.toLowerCase().includes(username.toLowerCase()), false, "git_status_structured repoRoot must mask username");
  }

  const gitStatusRevealed = await runtime.router.execute({
    tool: "developer",
    action: "git_status_structured",
    args: { path: ".", revealPath: true }
  });
  assert.strictEqual(gitStatusRevealed.ok, true);
  assert.ok(gitStatusRevealed.path_privacy.includes("Ruta visible"));

  // 5. Dynamic Timed Lease Approvals with Confirmation Code
  console.log("-> 5. Aprobación dinámica con código y ventana temporal (grantMinutes)...");
  runtime.permissions.revokeWorkflow({ principal: "default" });
  const unconfirmedCmd = await runtime.router.execute({
    tool: "terminal",
    action: "run_command",
    args: { command: "echo dynamic_lease_test" }
  });
  assert.strictEqual(unconfirmedCmd.code, "CONFIRMATION_REQUIRED");
  assert.ok(unconfirmedCmd.requestId, "Must have requestId");
  assert.ok(unconfirmedCmd.confirmationCode, "Must have confirmationCode");
  assert.strictEqual(unconfirmedCmd.confirmationCode.length, 4, "Confirmation code must be 4 chars");

  // Wrong confirmation code fails
  const wrongCodeRes = await runtime.router.execute({
    tool: "security",
    action: "approve_request",
    args: {
      requestId: unconfirmedCmd.requestId,
      confirmationCode: "ZZZZ",
      grantMinutes: 5
    }
  });
  assert.strictEqual(wrongCodeRes.ok, false);
  assert.strictEqual(wrongCodeRes.code, "CONFIRMATION_CODE_MISMATCH");

  // Correct confirmation code with grantMinutes: 5 succeeds
  const approveRes = await runtime.router.execute({
    tool: "security",
    action: "approve_request",
    args: {
      requestId: unconfirmedCmd.requestId,
      confirmationCode: unconfirmedCmd.confirmationCode,
      grantMinutes: 5
    }
  });
  assert.strictEqual(approveRes.ok, true, "approve_request should succeed");
  assert.strictEqual(approveRes.workflow_granted, true, "Workflow should be granted");
  assert.strictEqual(approveRes.grantMinutes, 5);

  // Workflow is active
  const wf = runtime.permissions.getWorkflow("default");
  assert.ok(wf, "Workflow should be active");
  assert.strictEqual(wf.status, "active");

  // Subsequent command in the same level succeeds WITHOUT confirmation!
  const secondCmd = await runtime.router.execute({
    tool: "terminal",
    action: "run_command",
    args: { command: "echo second_cmd_allowed" }
  });
  assert.strictEqual(secondCmd.ok, true, "Command within granted lease should execute directly");
  assert.notStrictEqual(secondCmd.code, "CONFIRMATION_REQUIRED");

  // Higher-level action is STILL blocked (Principle of Least Privilege)
  const systemRootAction = await runtime.router.execute({
    tool: "security",
    action: "start_workflow",
    args: { level: "system_root", durationMinutes: 10 }
  });
  assert.strictEqual(systemRootAction.code, "CONFIRMATION_REQUIRED", "Higher level MUST still require separate confirmation");

  // Clean up workflow
  runtime.permissions.revokeWorkflow({ principal: "default" });

  // 6. Guide Domain checks
  console.log("-> 6. Guide domain permissions_info...");
  const guideInfo = await runtime.router.execute({
    tool: "guide",
    action: "permissions_info",
    args: {}
  });
  assert.strictEqual(guideInfo.ok, true);
  assert.ok(guideInfo.levels.some(l => l.name === "visitor"));
  assert.ok(guideInfo.levels.some(l => l.name === "standard"));
  assert.ok(guideInfo.levels.some(l => l.name === "advanced"));
  assert.ok(guideInfo.levels.some(l => l.name === "maintainer"));
  assert.ok(guideInfo.levels.some(l => l.name === "system_root"));
  assert.ok(guideInfo.path_privacy, "Path privacy should be documented in guide");

  // 7. Visual Capture system & Privacy consent (capture_screen, capture_window, capture_region)
  console.log("-> 7. Sistema de Capturas Visuales y Consentimiento 'visual_capture_grant'...");
  runtime.permissions.revokeVisualCapture({ principal: "default" });

  const unauthCapture = await runtime.router.execute({
    tool: "system",
    action: "capture_screen",
    args: {}
  });
  assert.strictEqual(unauthCapture.code, "CONFIRMATION_REQUIRED", "Visual capture MUST require confirmation");
  assert.strictEqual(unauthCapture.required, "visual_capture_grant", "Required permission must be visual_capture_grant");
  assert.ok(unauthCapture.message.includes("visual"), "Message must explain visual privacy");

  // Grant visual capture permission
  const grantRes = await runtime.router.execute({
    tool: "security",
    action: "grant_visual_capture",
    args: { durationMinutes: 5 }
  });
  assert.strictEqual(grantRes.ok, true);

  // Now capture_screen succeeds
  const fullScreenRes = await runtime.router.execute({
    tool: "system",
    action: "capture_screen",
    args: {}
  });
  assert.strictEqual(fullScreenRes.ok, true, "capture_screen should succeed with grant");
  assert.ok(fullScreenRes.capture_id, "Must have capture_id");
  assert.ok(fullScreenRes.evidence_ref, "Must have evidence_ref");
  assert.ok(fullScreenRes.file_path, "Must have file_path");

  // capture_window succeeds
  const windowRes = await runtime.router.execute({
    tool: "system",
    action: "capture_window",
    args: { windowTitle: "explorer" }
  });
  assert.strictEqual(windowRes.ok, true, "capture_window should succeed");
  assert.strictEqual(windowRes.mode, "window");

  // capture_region succeeds
  const regionRes = await runtime.router.execute({
    tool: "system",
    action: "capture_region",
    args: { x: 100, y: 100, width: 400, height: 300 }
  });
  assert.strictEqual(regionRes.ok, true, "capture_region should succeed");
  assert.strictEqual(regionRes.mode, "region");

  // 8. Screenshot Evidence integration with developer.submit_feedback
  console.log("-> 8. Integración de evidencia visual con submit_feedback...");
  const feedbackRes = await runtime.router.execute({
    tool: "developer",
    action: "submit_feedback",
    args: {
      title: "Prueba de integración visual",
      description: "Test de adjunto de screenshot",
      screenshot: fullScreenRes.file_path,
    }
  });
  // Since remote gateway might be reachable or offline, the validation of input/payload should not fail on INVALID_INPUT
  assert.notStrictEqual(feedbackRes.code, "INVALID_INPUT", "submit_feedback should accept screenshot path");

  // 9. AFX-FB-WF3EQH: security.list_granted_permissions
  console.log("-> 9. AFX-FB-WF3EQH: list_granted_permissions...");
  const listPermsRes = await runtime.router.execute({
    tool: "security",
    action: "list_granted_permissions",
    args: {}
  });
  assert.strictEqual(listPermsRes.ok, true);
  assert.strictEqual(listPermsRes.visual_capture_grant_active, true);
  assert.ok(Array.isArray(listPermsRes.current_permissions));

  // 10. AFX-FB-SRCWRM: upd_info version isolation
  console.log("-> 10. AFX-FB-SRCWRM: upd_info version isolation...");
  const updInfoRes = await runtime.router.execute({
    tool: "developer",
    action: "upd_info",
    args: { version: "10.3.0" }
  });
  assert.strictEqual(updInfoRes.ok, true);
  assert.strictEqual(updInfoRes.version, "10.3.0");
  assert.strictEqual(updInfoRes.is_isolated_version, true);
  assert.ok(updInfoRes.changelog, "Must have isolated changelog");
  // Isolated changelog should not contain older version headers
  assert.strictEqual(updInfoRes.changelog.includes("## [v10.1.5]"), false, "Isolated changelog must not drag previous version header");

  // 11. AFX-FB-HTXL25: permission_expires_in_seconds in tool responses
  console.log("-> 11. AFX-FB-HTXL25: permission_expires_in_seconds en respuestas...");
  runtime.permissions.startWorkflow({ level: "advanced", durationMinutes: 1 });
  const toolWithExpiry = await runtime.router.execute({
    tool: "terminal",
    action: "run_command",
    args: { command: "echo test_expiry" }
  });
  assert.strictEqual(toolWithExpiry.ok, true);
  assert.ok(typeof toolWithExpiry.permission_expires_in_seconds === "number", "permission_expires_in_seconds must be a number");
  assert.ok(toolWithExpiry.permission_expires_in_seconds > 0, "permission_expires_in_seconds must be > 0");
  runtime.permissions.revokeWorkflow({ principal: "default" });

  // 12. AFX-FB-MHYVV3: Fresh remote check metadata in upd_check
  console.log("-> 12. AFX-FB-MHYVV3: Metadata de consulta fresca en upd_check...");
  const freshUpdCheck = await runtime.router.execute({
    tool: "developer",
    action: "upd_check",
    args: { force: true, checkRepo: true }
  });
  assert.strictEqual(freshUpdCheck.ok, true);
  assert.ok(freshUpdCheck.last_real_check_at, "last_real_check_at must be present");
  assert.strictEqual(freshUpdCheck.source_confirmed, true, "source_confirmed must be true");
  assert.strictEqual(freshUpdCheck.check_source, "github_api_fresh", "check_source must be github_api_fresh");

  // 13. Subtool: security.list_permission_levels
  console.log("-> 13. Subherramienta: security.list_permission_levels...");
  const permLevelsRes = await runtime.router.execute({
    tool: "security",
    action: "list_permission_levels",
    args: {}
  });
  assert.strictEqual(permLevelsRes.ok, true);
  assert.strictEqual(permLevelsRes.total_levels, 6);
  assert.ok(Array.isArray(permLevelsRes.canonical_levels));
  assert.strictEqual(permLevelsRes.alias_mapping.user, "standard");
  assert.strictEqual(permLevelsRes.alias_mapping.admintotaluser, "system_root");

  // 14. Subtool: files.sandbox_status & path privacy
  console.log("-> 14. Subherramienta: files.sandbox_status & list_allowed_directories...");
  const sandboxStatus = await runtime.router.execute({
    tool: "files",
    action: "sandbox_status",
    args: { revealPath: false }
  });
  assert.strictEqual(sandboxStatus.ok, true);
  assert.strictEqual(sandboxStatus.path_masking_active, true);
  const user = os.userInfo().username.toLowerCase();
  const sandboxJson = JSON.stringify(sandboxStatus.allowed_roots).toLowerCase();
  assert.strictEqual(sandboxJson.includes(`users\\${user}`), false, "sandbox_status must mask username when revealPath is false");

  const allowedDirs = await runtime.router.execute({
    tool: "files",
    action: "list_allowed_directories",
    args: { revealPath: false }
  });
  assert.strictEqual(allowedDirs.ok, true);
  assert.strictEqual(JSON.stringify(allowedDirs.directories).toLowerCase().includes(`users\\${user}`), false);

  // 15. Subtool: upd con dry_run: true
  console.log("-> 15. Subherramienta: upd con dry_run: true...");
  const dryRunRes = await runtime.router.execute({
    tool: "developer",
    action: "upd",
    args: { dry_run: true }
  });
  assert.strictEqual(dryRunRes.ok, true);
  assert.strictEqual(dryRunRes.dry_run, true);
  assert.strictEqual(dryRunRes.verified, true);
  assert.ok(dryRunRes.message.includes("[DRY-RUN]"));

  // 16. Subtool: upd_rollback y upd_backups
  console.log("-> 16. Subherramienta: upd_rollback y upd_backups...");
  const backupsRes = await runtime.router.execute({
    tool: "developer",
    action: "upd_backups",
    args: {}
  });
  assert.strictEqual(backupsRes.ok, true);
  assert.ok(typeof backupsRes.count === "number");

  const rollbackNoConfirm = await runtime.router.execute({
    tool: "developer",
    action: "upd_rollback",
    args: { confirm: false }
  });
  assert.strictEqual(rollbackNoConfirm.ok, false);
  assert.strictEqual(rollbackNoConfirm.status, "AWAITING_USER_CONFIRMATION");
  assert.strictEqual(rollbackNoConfirm.requires_user_confirmation, true);

  // 17. Feedback Outbox Privacy (AFX-FB-D3RAUV)
  console.log("-> 17. Feedback Outbox Privacy (feedback_outbox_status)...");
  const outboxRes = await runtime.router.execute({
    tool: "developer",
    action: "feedback_outbox_status",
    args: {}
  });
  assert.strictEqual(outboxRes.ok, true);
  assert.ok(typeof outboxRes.pending_count === "number");
  assert.ok(outboxRes.privacy_mode.includes("Strict Abstract"));
  assert.strictEqual(JSON.stringify(outboxRes).toLowerCase().includes(`users\\${user}`), false);

  // 18. Subtool: packages.audit_vulnerabilities
  console.log("-> 18. Subherramienta: packages.audit_vulnerabilities...");
  const auditRes = await runtime.router.execute({
    tool: "packages",
    action: "audit_vulnerabilities",
    args: { manager: "npm" }
  });
  assert.strictEqual(auditRes.ok, true);
  assert.strictEqual(auditRes.manager, "npm");
  assert.strictEqual(auditRes.privacy_sanitized, true);

  console.log("=== TODOS LOS TESTS DE v10.3.0 PASARON 100% ===");
  await runtime.shutdown();
  process.exit(0);
}

runV10_3_Tests().catch(err => {
  console.error("Test v10.3.0 fallo:", err);
  process.exit(1);
});
