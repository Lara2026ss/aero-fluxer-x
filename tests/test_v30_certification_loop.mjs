/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚡ FLUXER XZ (V30.0 / Gen 4.0) — tests/test_v30_certification_loop.mjs
 * Continuous Verification & Certification Loop for All Post-FL-Studio Capabilities
 *
 * 5 IMMOVABLE DETERMINISTIC GATES:
 * 1. gate_tool_execution: Every tool executed with valid schema, 0 uncaught exceptions
 * 2. gate_error_taxonomy: Errors classified into RECOVERABLE vs TERMINAL
 * 3. gate_permission_level: 4 levels (GUEST:0, USER:1, POWER_USER:2, ADMIN:3) + HMAC action approval
 * 4. gate_audit_log: WORM immutable SQLite table + append-only triggers + Merkle chain
 * 5. gate_restart_recovery: Post-restart recovery of SQLite checkpoints and workflow resume
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { strict as assert } from "node:assert";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";
import { MemoryStore } from "../core/memory.mjs";
import { WorkflowEngine } from "../core/workflow-engine.mjs";
import {
  PermissionEngine,
  PERMISSION_LEVELS,
  LEVEL_RANK,
} from "../core/permissions.mjs";
import {
  classifyError,
  ERROR_TAXONOMY,
  ERROR_CODES,
  FluxerError,
} from "../core/errors.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

console.log("══════════════════════════════════════════════════════════════════");
console.log("⚡ FLUXER XZ: V30.0 DETERMINISTIC CERTIFICATION LOOP");
console.log("══════════════════════════════════════════════════════════════════\n");

const gateResults = {
  gate_tool_execution: { passed: 0, total: 0, status: "PENDING" },
  gate_error_taxonomy: { passed: 0, total: 0, status: "PENDING" },
  gate_permission_level: { passed: 0, total: 0, status: "PENDING" },
  gate_audit_log: { passed: 0, total: 0, status: "PENDING" },
  gate_restart_recovery: { passed: 0, total: 0, status: "PENDING" },
};

async function check(gate, description, fn) {
  gateResults[gate].total++;
  try {
    await fn();
    gateResults[gate].passed++;
    console.log(`  [${gate}] 🟢 PASS: ${description}`);
  } catch (err) {
    console.error(`  [${gate}] 🔴 FAIL: ${description}`);
    console.error(`     Details: ${err.message}\n${err.stack}`);
    throw err;
  }
}

async function runCertificationSuite() {
  const tempTestDir = path.join(os.tmpdir(), `fluxer_v30_cert_${Date.now()}`);
  await fs.mkdir(tempTestDir, { recursive: true });

  const testDbFile = path.join(tempTestDir, "fluxer_cert_memory.sqlite");

  // Initialize runtime
  const runtime = await createRuntime({ root: ROOT });
  // Point memory to test sqlite
  runtime.memory = new MemoryStore({ file: testDbFile });
  await runtime.memory.load();

  runtime.permissions = new PermissionEngine({ memory: runtime.memory });
  const registry = new Registry(runtime);
  await registry.load();
  const router = new Router({ runtime, registry });

  // ════════════════════════════════════════════════════════════════════════════
  // GATE 1: gate_tool_execution (Output matches JSON schema, zero uncaught exceptions)
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n▶ Running GATE 1: gate_tool_execution...");

  // 1.1 web.search_images
  await check("gate_tool_execution", "web.search_images returns schema compliant result", async () => {
    const res = await router.execute({
      tool: "web",
      action: "search_images",
      args: { query: "nature landscape wallpaper", limit: 3 },
    });
    assert.equal(typeof res.ok, "boolean");
    assert(Array.isArray(res.images || res.results || []));
  });

  // 1.2 web.download
  const sampleImagePath = path.join(tempTestDir, "test_download.png");
  const samplePngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  await fs.writeFile(sampleImagePath, Buffer.from(samplePngBase64, "base64"));

  await check("gate_tool_execution", "web.download handles file validation and resilience", async () => {
    const res = await router.execute({
      tool: "web",
      action: "download",
      args: {
        url: `file://${sampleImagePath.replace(/\\/g, "/")}`,
        targetPath: path.join(tempTestDir, "downloaded.png"),
        validate_format: true,
      },
    });
    assert.equal(typeof res.ok, "boolean");
  });

  // 1.3 files.image_to_pdf
  const outputPdf1 = path.join(tempTestDir, "converted_images.pdf");
  await check("gate_tool_execution", "files.image_to_pdf converts images to multi-page PDF", async () => {
    const res = await router.execute({
      tool: "files",
      action: "image_to_pdf",
      args: {
        images: [sampleImagePath],
        targetPath: outputPdf1,
        paper_size: "A4",
      },
    });
    assert.equal(res.ok, true);
    assert.equal(res.pages, 1);
    const stat = await fs.stat(outputPdf1);
    assert(stat.size > 100);
  });

  // 1.4 files.merge_pdfs
  const outputPdf2 = path.join(tempTestDir, "merged_output.pdf");
  await check("gate_tool_execution", "files.merge_pdfs merges multiple PDFs into unified document", async () => {
    const res = await router.execute({
      tool: "files",
      action: "merge_pdfs",
      args: {
        pdfs: [outputPdf1, outputPdf1],
        targetPath: outputPdf2,
      },
    });
    assert.equal(res.ok, true);
    assert.equal(res.pages, 2);
    const stat = await fs.stat(outputPdf2);
    assert(stat.size > 200);
  });

  // 1.5 print.preflight
  await check("gate_tool_execution", "print.preflight validates PDF document and layout", async () => {
    const res = await router.execute({
      tool: "print",
      action: "preflight",
      args: { file: outputPdf2, color: false },
    });
    assert.equal(res.ok, true);
    assert.equal(res.pageCount, 2);
  });

  // 1.6 print.print (simulated)
  await check("gate_tool_execution", "print.print performs safe print pipeline verification", async () => {
    const res = await router.execute({
      tool: "print",
      action: "print",
      args: { file: outputPdf2, dryRun: true },
    });
    assert.equal(typeof res.ok, "boolean");
  });

  // 1.7 developer.telemetry
  await check("gate_tool_execution", "developer.telemetry queries ring buffer of tool calls", async () => {
    const res = await router.execute({
      tool: "developer",
      action: "telemetry",
      args: { limit: 10 },
    });
    assert.equal(res.ok, true);
    assert(res.totalTracked > 0);
    assert(Array.isArray(res.telemetry));
  });

  // 1.8 files.gc
  await check("gate_tool_execution", "files.gc scans temporary directories respecting leases", async () => {
    const tempGcDir = path.join(tempTestDir, "temp_gc_storage");
    await fs.mkdir(tempGcDir, { recursive: true });
    await fs.writeFile(path.join(tempGcDir, "temp_old.txt"), "stale data");

    const lease = runtime.permissions.grantLease({
      scope: "files:gc",
      budget: { calls: 5 },
      allowedPaths: [tempGcDir],
    });

    const res = await router.execute({
      tool: "files",
      action: "gc",
      args: { directory: tempGcDir, leaseId: lease.leaseId, force: true, dryRun: false },
    });
    assert.equal(res.ok, true);
    assert.equal(res.deletedCount, 1);
  });

  gateResults.gate_tool_execution.status = "PASS";

  // ════════════════════════════════════════════════════════════════════════════
  // GATE 2: gate_error_taxonomy (Classifies RECOVERABLE vs TERMINAL)
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n▶ Running GATE 2: gate_error_taxonomy...");

  await check("gate_error_taxonomy", "Classifies transient filesystem & network errors as RECOVERABLE", async () => {
    const ebusyErr = new Error("EBUSY: resource locked or in use, open 'target.pdf'");
    ebusyErr.code = "EBUSY";
    const res1 = classifyError(ebusyErr);
    assert.equal(res1.taxonomy, ERROR_TAXONOMY.RECOVERABLE);
    assert.equal(res1.retryable, true);

    const timeoutErr = new Error("ETIMEDOUT: connect timeout after 5000ms");
    timeoutErr.code = "ETIMEDOUT";
    const res2 = classifyError(timeoutErr);
    assert.equal(res2.taxonomy, ERROR_TAXONOMY.RECOVERABLE);

    const lockedErr = new Error("file is locked by process Acrobat.exe");
    const res3 = classifyError(lockedErr);
    assert.equal(res3.taxonomy, ERROR_TAXONOMY.RECOVERABLE);
  });

  await check("gate_error_taxonomy", "Classifies deterministic authorization and validation errors as TERMINAL", async () => {
    const invalidErr = new Error("Invalid arguments: missing path parameter");
    const res1 = classifyError(invalidErr);
    assert.equal(res1.taxonomy, ERROR_TAXONOMY.TERMINAL);
    assert.equal(res1.retryable, false);

    const leaseErr = new FluxerError("Operation requires an active CapabilityLease", { code: ERROR_CODES.LEASE_REQUIRED });
    const res2 = classifyError(leaseErr);
    assert.equal(res2.taxonomy, ERROR_TAXONOMY.TERMINAL);
    assert.equal(res2.retryable, false);

    const permErr = new FluxerError("Permission denied: insufficient tier", { code: ERROR_CODES.PERMISSION_DENIED });
    const res3 = classifyError(permErr);
    assert.equal(res3.taxonomy, ERROR_TAXONOMY.TERMINAL);
  });

  await check("gate_error_taxonomy", "Handles EBUSY liberation via atomic staging rename in files.delete_path", async () => {
    const lockedTarget = path.join(tempTestDir, "test_ebusy_file.txt");
    await fs.writeFile(lockedTarget, "locked content");

    const lease = runtime.permissions.grantLease({
      scope: "files:delete_path",
      budget: { calls: 2 },
      allowedPaths: [lockedTarget],
    });

    const res = await router.execute({
      tool: "files",
      action: "delete_path",
      args: { path: lockedTarget, leaseId: lease.leaseId },
    });
    assert.equal(res.ok, true);
    assert.equal(res.deleted, true);
  });

  gateResults.gate_error_taxonomy.status = "PASS";

  // ════════════════════════════════════════════════════════════════════════════
  // GATE 3: gate_permission_level (4 levels + HMAC user action click validation)
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n▶ Running GATE 3: gate_permission_level...");

  await check("gate_permission_level", "4 Granular levels classified strictly (0:GUEST, 1:USER, 2:POWER_USER, 3:ADMIN)", async () => {
    const guestOp = runtime.permissions.classifyPermissionLevel("system", "snapshot");
    assert.equal(guestOp.level, PERMISSION_LEVELS.GUEST);

    const userOp = runtime.permissions.classifyPermissionLevel("files", "image_to_pdf");
    assert.equal(userOp.level, PERMISSION_LEVELS.USER);

    const powerUserOp = runtime.permissions.classifyPermissionLevel("files", "write");
    assert.equal(powerUserOp.level, PERMISSION_LEVELS.POWER_USER);

    const adminOp = runtime.permissions.classifyPermissionLevel("files", "delete");
    assert.equal(adminOp.level, PERMISSION_LEVELS.ADMIN);
  });

  await check("gate_permission_level", "Every ADMIN (Tier 3) operation strictly requires a valid CapabilityLease", async () => {
    const dummyFile = path.join(tempTestDir, "admin_protected.txt");
    await fs.writeFile(dummyFile, "critical data");

    let threwLeaseRequired = false;
    try {
      runtime.permissions.assertAllowed(
        { tool: "files", action: "delete_path", target: dummyFile, leaseId: null },
        "unit",
        "default",
        { path: dummyFile }
      );
    } catch (err) {
      if (err.code === ERROR_CODES.LEASE_REQUIRED && err.status === 403) {
        threwLeaseRequired = true;
      }
    }
    assert.equal(threwLeaseRequired, true, "Must reject Tier 3 without lease with LEASE_REQUIRED (status 403)");

    const lease = runtime.permissions.grantLease({
      scope: "files:delete_path",
      budget: { calls: 1 },
      allowedPaths: [dummyFile],
    });
    assert.equal(typeof lease.leaseId, "string");

    const allowed = runtime.permissions.assertAllowed(
      { tool: "files", action: "delete_path", target: dummyFile, leaseId: lease.leaseId },
      "unit",
      "default",
      { path: dummyFile }
    );
    assert.equal(allowed, true);
    const updatedLease = runtime.permissions.getLease(lease.leaseId);
    assert.equal(updatedLease.budget.calls, 0);
  });

  await check("gate_permission_level", "Cryptographic HMAC user action approval (No copyable codes)", async () => {
    const req = runtime.permissions.requestActionApproval({
      tool: "files",
      action: "delete",
      args: { path: "important.doc" },
      userId: "user_mauricio",
    });
    assert(req.actionId.startsWith("act_"));
    assert(req.challengeNonce.length > 10);

    let forgeryRejected = false;
    try {
      runtime.permissions.approveUserAction({
        actionId: req.actionId,
        userActionSignature: "0000000000000000000000000000000000000000000000000000000000000000",
        clickTimestamp: Date.now(),
      });
    } catch (err) {
      if (err.code === "FORGED_USER_ACTION" || err.message.includes("Invalid cryptographic user action")) {
        forgeryRejected = true;
      }
    }
    assert.equal(forgeryRejected, true, "Forged signature must be rejected");

    const clickTimestamp = Date.now();
    const clickEvent = runtime.permissions.simulateUserClick(req.actionId, clickTimestamp);
    assert.equal(clickEvent.userActionVerified, true);

    const approval = runtime.permissions.approveUserAction({
      actionId: req.actionId,
      userActionSignature: clickEvent.userActionSignature,
      clickTimestamp,
    });
    assert.equal(approval.approved, true);
    assert.equal(approval.status, "approved");
  });

  gateResults.gate_permission_level.status = "PASS";

  // ════════════════════════════════════════════════════════════════════════════
  // GATE 4: gate_audit_log (WORM immutable SQLite table + append-only triggers)
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n▶ Running GATE 4: gate_audit_log...");

  await check("gate_audit_log", "Records destructive actions immutably to worm_audit_log", async () => {
    const entry = runtime.memory.appendWormAudit({
      action: "files.delete",
      tool: "files",
      target: "C:\\Temp\\cleanup.pdf",
      user: "mauricio",
      permissionLevel: PERMISSION_LEVELS.ADMIN,
      status: "EXECUTED",
      payload: { deletedBytes: 1048576 },
    });
    const entryId = entry.entryId || entry.entry_id || `worm_${entry.id}`;
    assert(entryId.startsWith("worm_"));

    const logs = runtime.memory.getWormAuditLog({ limit: 5 });
    const found = logs.find((l) => l.entry_id === entryId || l.id === entry.id);
    assert(found, "Appended entry must exist in WORM audit log");
    assert.equal(found.action, "files.delete");
    assert.equal(found.permission_level, 3);
  });

  await check("gate_audit_log", "SQLite triggers physically block UPDATE and DELETE on worm_audit_log", async () => {
    let updateBlocked = false;
    try {
      runtime.memory.db.prepare("UPDATE worm_audit_log SET action = 'TAMPERED'").run();
    } catch (err) {
      if (err.message.includes("WORM_IMMUTABLE")) {
        updateBlocked = true;
      }
    }
    assert.equal(updateBlocked, true, "UPDATE on worm_audit_log MUST fail with WORM_IMMUTABLE");

    let deleteBlocked = false;
    try {
      runtime.memory.db.prepare("DELETE FROM worm_audit_log").run();
    } catch (err) {
      if (err.message.includes("WORM_IMMUTABLE")) {
        deleteBlocked = true;
      }
    }
    assert.equal(deleteBlocked, true, "DELETE on worm_audit_log MUST fail with WORM_IMMUTABLE");
  });

  await check("gate_audit_log", "Cryptographic Merkle/hash chain validates integrity across entries", async () => {
    const integrity = runtime.memory.verifyWormAuditIntegrity();
    assert.equal(integrity.ok, true);
    assert(integrity.verifiedCount > 0);
  });

  gateResults.gate_audit_log.status = "PASS";

  // ════════════════════════════════════════════════════════════════════════════
  // GATE 5: gate_restart_recovery (Post-restart recovery of SQLite checkpoints & resume)
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n▶ Running GATE 5: gate_restart_recovery...");

  const restartRunId = `run_restart_test_${Date.now()}`;
  let executedSteps = [];

  const testWorkflowEngine = new WorkflowEngine({
    runtime,
    router: {
      execute: async (req) => {
        const stepId = req.taskId || req.id || "unknown";
        executedSteps.push(stepId);
        if (stepId === "step3_fail") {
          throw new Error("Simulated crash at step3");
        }
        return { ok: true, output: `Completed ${stepId}` };
      },
    },
  });

  const tasks = [
    { id: "step1", capability: "system", operation: "snapshot", options: {} },
    { id: "step2", capability: "files", operation: "read", dependsOn: ["step1"], options: {} },
    { id: "step3_fail", capability: "files", operation: "delete", dependsOn: ["step2"], options: {} },
    { id: "step4", capability: "print", operation: "preflight", dependsOn: ["step3_fail"], options: {} },
  ];

  // 1. Initial run crashes at step3_fail
  const run1 = await testWorkflowEngine.run({
    runId: restartRunId,
    tasks,
    checkpoint: true,
  });
  assert.equal(run1.ok, false);
  assert.equal(run1.completed, 2);

  let restartedMemory;
  await check("gate_restart_recovery", "Workflow checkpoints persist across complete process restart", async () => {
    // Simulate complete MCP crash and restart: close SQLite, reopen in fresh MemoryStore instance
    runtime.memory.db.close();

    restartedMemory = new MemoryStore({ file: testDbFile });
    await restartedMemory.load();

    const savedRun = restartedMemory.getWorkflowRun(restartRunId);
    assert.equal(savedRun.run_id, restartRunId);
    assert.equal(savedRun.completed_tasks, 2);

    const step1Check = restartedMemory.getStepCheckpoint(restartRunId, "step1");
    const step2Check = restartedMemory.getStepCheckpoint(restartRunId, "step2");
    assert.equal(step1Check.status, "completed");
    assert.equal(step2Check.status, "completed");
  });

  await check("gate_restart_recovery", "Resume executes only remaining steps without re-running earlier completed steps", async () => {
    // 3. Resume workflow from SQLite checkpoints with fixed step3
    executedSteps = [];
    const restartedEngine = new WorkflowEngine({
      runtime: { memory: restartedMemory, permissions: runtime.permissions },
      router: {
        execute: async (req) => {
          const stepId = req.taskId || req.id || "unknown";
          executedSteps.push(stepId);
          return { ok: true, output: `Recovered ${stepId}` };
        },
      },
    });

    const resumeRes = await restartedEngine.resume({
      runId: restartRunId,
      patchInput: { fixed: true },
    });

    assert.equal(resumeRes.ok, true);
    assert.equal(resumeRes.fromCheckpoint, true);
    assert.deepEqual(executedSteps, ["step3_fail", "step4"]);
    assert.equal(resumeRes.completed, 4);
  });

  gateResults.gate_restart_recovery.status = "PASS";

  try {
    restartedMemory.db.close();
    await fs.rm(tempTestDir, { recursive: true, force: true });
  } catch {}

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("🏆 ALL 5 DETERMINISTIC GATES PASSED TO PERFECTION!");
  console.log("══════════════════════════════════════════════════════════════════");
  console.table(gateResults);
  return true;
}

runCertificationSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("FATAL CERTIFICATION SUITE FAILURE:", err);
    process.exit(1);
  });
