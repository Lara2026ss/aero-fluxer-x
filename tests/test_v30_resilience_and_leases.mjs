/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚡ FLUXER XZ — tests/test_v30_resilience_and_leases.mjs
 * Rigorous Verification Suite for Resilient DAG Checkpoints & Capability Leases
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { strict as assert } from "node:assert";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { MemoryStore } from "../core/memory.mjs";
import { WorkflowEngine } from "../core/workflow-engine.mjs";
import { PermissionEngine, isPathInsideAllowed, isScopeMatching } from "../core/permissions.mjs";
import { ERROR_CODES } from "../core/errors.mjs";

console.log("==================================================================");
console.log("⚡ FLUXER XZ: Resilience & Capability Leases Verification Suite");
console.log("==================================================================\n");

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  🟢 PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  🔴 FAIL: ${name}`);
    console.error(`     Error: ${err.message}\n${err.stack}`);
  }
}

async function runTests() {
  const tempDir = path.join(os.tmpdir(), `fluxer_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
  await fs.mkdir(tempDir, { recursive: true });
  const dbFile = path.join(tempDir, "test_memory.sqlite");

  const memory = new MemoryStore({ file: dbFile });
  await memory.load();

  const permissions = new PermissionEngine({ memory });

  // Mock router for controlled testing
  const mockCalls = [];
  const mockRouter = {
    execute: async (req) => {
      mockCalls.push(req);
      const cap = req.capability || req.tool;
      const op = req.operation || req.action;
      const opts = req.options || req.args || {};

      if (opts.shouldFail === true || String(opts.shouldFail) === "true") {
        throw new Error(`Intentional failure in ${req.taskId || "task"}`);
      }

      return {
        ok: true,
        data: {
          handled: `${cap}.${op}`,
          taskId: req.taskId,
          receivedTarget: req.target || opts.target,
        },
      };
    },
  };

  const mockRuntime = {
    memory,
    permissions,
    router: mockRouter,
  };

  const engine = new WorkflowEngine({
    runtime: mockRuntime,
    router: mockRouter,
  });

  // ── TEST 1: Checkpoint creation per step in SQLite ─────────────────────────
  await test("Test 1: Checkpoint creation per step in SQLite", async () => {
    const runId = `test_run_${Date.now()}_1`;
    const tasks = [
      { id: "step1", capability: "system", operation: "snapshot", options: { compact: true } },
      { id: "step2", capability: "files", operation: "read", dependsOn: ["step1"], options: { path: "test.txt" } },
      { id: "step3", capability: "media", operation: "desktop", dependsOn: ["step2"], options: {} },
    ];

    const res = await engine.run({
      runId,
      tasks,
      input: { env: "test" },
      checkpoint: true,
    });

    assert.equal(res.ok, true);
    assert.equal(res.completed, 3);

    // Verify SQLite records
    const runRecord = memory.getDagRun(runId);
    assert.ok(runRecord);
    assert.equal(runRecord.status, "completed");
    assert.equal(runRecord.taskCount, 3);
    assert.equal(runRecord.input.env, "test");

    const checkpoints = memory.getCheckpoints(runId);
    assert.equal(checkpoints.length, 3);
    assert.equal(checkpoints[0].taskId, "step1");
    assert.equal(checkpoints[0].status, "completed");
    assert.ok(checkpoints[0].data);
    assert.equal(checkpoints[1].taskId, "step2");
    assert.equal(checkpoints[1].status, "completed");
    assert.equal(checkpoints[2].taskId, "step3");
    assert.equal(checkpoints[2].status, "completed");
  });

  // ── TEST 2: Surgical resume (does not re-execute completed nodes) ───────────
  await test("Test 2: Surgical resume skips completed nodes and finishes DAG", async () => {
    const runId = `test_run_${Date.now()}_2`;
    mockCalls.length = 0; // reset tracker

    const tasks = [
      { id: "task_a", capability: "system", operation: "snapshot" },
      { id: "task_b", capability: "files", operation: "read", dependsOn: ["task_a"], options: { shouldFail: "{{input.fail_b}}" } },
      { id: "task_c", capability: "print", operation: "print_pdf", dependsOn: ["task_b"] },
    ];

    // First execution fails at task_b because fail_b is true
    const res1 = await engine.run({
      runId,
      tasks,
      input: { fail_b: true },
      checkpoint: true,
    });

    assert.equal(res1.ok, false);
    assert.equal(res1.failed, 1);
    assert.equal(res1.completed, 1); // task_a completed
    assert.equal(mockCalls.filter((c) => c.taskId === "task_a").length, 1);
    assert.equal(mockCalls.filter((c) => c.taskId === "task_b").length, 1);
    assert.equal(mockCalls.filter((c) => c.taskId === "task_c").length, 0);

    // Verify run status is 'failed'
    const failedRun = memory.getDagRun(runId);
    assert.equal(failedRun.status, "failed");

    // Now resume, patching fail_b to false so it succeeds
    mockCalls.length = 0; // reset
    const res2 = await engine.resume({
      runId,
      patchInput: { fail_b: false },
    });

    assert.equal(res2.ok, true);
    assert.equal(res2.resumed, true);
    assert.equal(res2.reusedTaskCount, 1); // task_a was reused!
    assert.deepEqual(res2.reusedTasks, ["task_a"]);

    // Critical assertion: task_a was NEVER called again during resume!
    assert.equal(mockCalls.filter((c) => c.taskId === "task_a").length, 0);
    assert.equal(mockCalls.filter((c) => c.taskId === "task_b").length, 1);
    assert.equal(mockCalls.filter((c) => c.taskId === "task_c").length, 1);

    // Final status in DB is completed
    const completedRun = memory.getDagRun(runId);
    assert.equal(completedRun.status, "completed");
  });

  // ── TEST 3: Capability lease call quota (No TTL) ───────────────────────────
  await test("Test 3: Capability lease call quota exhausts atomically", async () => {
    const lease = permissions.grantLease({
      scope: "files.write",
      budget: { max_calls: 2 },
      autoRevoke: true,
    });

    assert.equal(lease.remainingCalls, 2);
    assert.equal(lease.status, "active");

    // Call 1
    const allowed1 = permissions.assertAllowed(
      { tool: "files", action: "write" },
      { permissions: { write: "standard" } },
      "default",
      { leaseId: lease.leaseId }
    );
    assert.equal(allowed1, true);
    assert.equal(permissions.getLease(lease.leaseId).remainingCalls, 1);

    // Call 2
    const allowed2 = permissions.assertAllowed(
      { tool: "files", action: "write" },
      { permissions: { write: "standard" } },
      "default",
      { leaseId: lease.leaseId }
    );
    assert.equal(allowed2, true);
    const leaseAfter2 = permissions.getLease(lease.leaseId);
    assert.equal(leaseAfter2.remainingCalls, 0);
    assert.equal(leaseAfter2.status, "exhausted");

    // Call 3: Must be rejected with LEASE_BUDGET_EXHAUSTED
    let threw = false;
    try {
      permissions.assertAllowed(
        { tool: "files", action: "write" },
        { permissions: { write: "standard" } },
        "default",
        { leaseId: lease.leaseId }
      );
    } catch (err) {
      threw = true;
      assert.equal(err.code, ERROR_CODES.LEASE_BUDGET_EXHAUSTED);
    }
    assert.equal(threw, true, "Call 3 should fail with LEASE_BUDGET_EXHAUSTED");
  });

  // ── TEST 4: Path restriction in capability lease ───────────────────────────
  await test("Test 4: Capability lease path boundary enforcement", async () => {
    const safeFolder = path.join(tempDir, "allowed_workspace");
    await fs.mkdir(safeFolder, { recursive: true });

    const lease = permissions.grantLease({
      scope: "files.write",
      budget: { max_calls: 5 },
      allowedPaths: [safeFolder],
    });

    // Valid path inside allowed folder
    const validFile = path.join(safeFolder, "document.pdf");
    const allowed = permissions.assertAllowed(
      { tool: "files", action: "write", target: validFile },
      { permissions: { write: "standard" } },
      "default",
      { leaseId: lease.leaseId, path: validFile }
    );
    assert.equal(allowed, true);

    // Invalid path outside allowed folder
    const evilFile = path.join(tempDir, "forbidden.sys");
    let blocked = false;
    try {
      permissions.assertAllowed(
        { tool: "files", action: "write", target: evilFile },
        { permissions: { write: "standard" } },
        "default",
        { leaseId: lease.leaseId, path: evilFile }
      );
    } catch (err) {
      blocked = true;
      assert.equal(err.code, ERROR_CODES.PATH_OUTSIDE_LEASE);
    }
    assert.equal(blocked, true, "Path outside lease should be rejected with PATH_OUTSIDE_LEASE");
  });

  // ── TEST 5: Auto-revocation of lease upon DAG completion ────────────────────
  await test("Test 5: Lease auto-revokes upon workflow completion", async () => {
    const runId = `test_run_${Date.now()}_5`;
    const lease = permissions.grantLease({
      runId,
      scope: "print.print_pdf",
      budget: { max_calls: 5 },
      autoRevoke: true,
    });

    assert.equal(permissions.getLease(lease.leaseId).status, "active");

    const tasks = [
      { id: "p1", capability: "print", operation: "print_pdf" },
    ];

    await engine.run({
      runId,
      tasks,
      checkpoint: true,
    });

    const leaseAfterRun = permissions.getLease(lease.leaseId);
    assert.equal(leaseAfterRun.status, "revoked");
    assert.equal(leaseAfterRun.revokeReason, "workflow_completed");
  });

  // ── TEST 6: Concurrent quota race condition (Atomic SQL check) ─────────────
  await test("Test 6: Concurrent quota race strictly prevents double-consumption", async () => {
    const lease = permissions.grantLease({
      scope: "files.edit",
      budget: { max_calls: 1 }, // Only 1 call allowed!
      autoRevoke: true,
    });

    // Launch two concurrent consumes simultaneously
    const results = await Promise.allSettled([
      Promise.resolve().then(() => memory.consumeLeaseQuota(lease.leaseId, 1)),
      Promise.resolve().then(() => memory.consumeLeaseQuota(lease.leaseId, 1)),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.equal(fulfilled.length, 1, "Exactly 1 call must succeed");
    assert.equal(rejected.length, 1, "Exactly 1 call must be rejected");
    assert.equal(rejected[0].reason.code, ERROR_CODES.LEASE_BUDGET_EXHAUSTED);
  });

  // ── TEST 7: Duplicate checkpoint idempotency ───────────────────────────────
  await test("Test 7: Checkpoint saving is strictly idempotent and preserves completed status", async () => {
    const runId = `test_run_${Date.now()}_7`;

    // 1. Save completed checkpoint
    memory.saveCheckpoint({
      runId,
      taskId: "node_x",
      status: "completed",
      data: { score: 100 },
      durationMs: 50,
    });

    // 2. Late retry attempts to save 'running' or 'failed'
    memory.saveCheckpoint({
      runId,
      taskId: "node_x",
      status: "running",
      data: { score: 0 },
      durationMs: 10,
    });

    // Status MUST remain 'completed' and score MUST remain 100!
    const checkpoints = memory.getCheckpoints(runId);
    assert.equal(checkpoints.length, 1);
    assert.equal(checkpoints[0].status, "completed");
    assert.equal(checkpoints[0].data.score, 100);
  });

  // ── TEST 8: Double resume race protection (Atomic lock) ─────────────────────
  await test("Test 8: Double resume is blocked with RUN_ALREADY_RESUMING", async () => {
    const runId = `test_run_${Date.now()}_8`;

    memory.saveDagRun({
      runId,
      status: "failed",
      taskCount: 2,
      tasks: [{ id: "t1" }, { id: "t2" }],
    });

    // First acquire succeeds
    const lock1 = memory.acquireResumeLock(runId);
    assert.equal(lock1.ok, true);

    // Second acquire immediately fails because status is now 'resuming'
    let blocked = false;
    try {
      memory.acquireResumeLock(runId);
    } catch (err) {
      blocked = true;
      assert.equal(err.code, ERROR_CODES.RUN_ALREADY_RESUMING);
    }
    assert.equal(blocked, true, "Second resume must throw RUN_ALREADY_RESUMING");
  });

  // ── TEST 9: Resume after simulated process crash ───────────────────────────
  await test("Test 9: Resume after process crash starts at first uncompleted node", async () => {
    const runId = `test_run_${Date.now()}_9`;
    mockCalls.length = 0;

    const tasks = [
      { id: "crawl", capability: "web", operation: "search" },
      { id: "download", capability: "web", operation: "download", dependsOn: ["crawl"] },
      { id: "convert", capability: "files", operation: "write", dependsOn: ["download"] },
    ];

    // Simulate process crash: DB has crawl and download completed, but convert never started
    memory.saveDagRun({
      runId,
      status: "failed",
      taskCount: 3,
      tasks,
    });
    memory.saveCheckpoint({
      runId,
      taskId: "crawl",
      status: "completed",
      data: { urls: ["http://img1"] },
    });
    memory.saveCheckpoint({
      runId,
      taskId: "download",
      status: "completed",
      data: { file: "c:\\temp\\img1.png" },
    });

    // Resume from crash state
    const res = await engine.resume({ runId });
    assert.equal(res.ok, true);
    assert.equal(res.reusedTaskCount, 2);
    assert.deepEqual(res.reusedTasks.sort(), ["crawl", "download"]);

    // Only 'convert' was executed!
    assert.equal(mockCalls.length, 1);
    assert.equal(mockCalls[0].taskId, "convert");
  });

  // ── TEST 10: Lease Run/Task isolation ──────────────────────────────────────
  await test("Test 10: Capability lease enforces run and task isolation", async () => {
    const lease = permissions.grantLease({
      runId: "wf_alpha",
      taskId: "task_alpha",
      scope: "system.processes",
      budget: { max_calls: 5 },
    });

    // Attempt to use with wrong runId
    let runMismatch = false;
    try {
      permissions.assertAllowed(
        { tool: "system", action: "processes" },
        { permissions: { processes: "standard" } },
        "default",
        { leaseId: lease.leaseId, runId: "wf_beta", taskId: "task_alpha" }
      );
    } catch (err) {
      runMismatch = true;
      assert.equal(err.code, ERROR_CODES.LEASE_RUN_MISMATCH);
    }
    assert.equal(runMismatch, true);

    // Attempt to use with wrong taskId
    let taskMismatch = false;
    try {
      permissions.assertAllowed(
        { tool: "system", action: "processes" },
        { permissions: { processes: "standard" } },
        "default",
        { leaseId: lease.leaseId, runId: "wf_alpha", taskId: "task_beta" }
      );
    } catch (err) {
      taskMismatch = true;
      assert.equal(err.code, ERROR_CODES.LEASE_TASK_MISMATCH);
    }
    assert.equal(taskMismatch, true);
  });

  // ── TEST 11: Anti-traversal, prefix boundary, and Windows case safety ──────
  await test("Test 11: Path validation rejects traversal, prefix attack, and respects boundaries", async () => {
    const baseDir = "C:\\allowed\\directory";

    // Subpath is allowed
    assert.equal(isPathInsideAllowed("C:\\allowed\\directory\\sub\\file.txt", [baseDir]), true);
    // Case variation on Windows is allowed
    assert.equal(isPathInsideAllowed("c:\\ALLOWED\\DIRECTORY\\file.txt", [baseDir]), true);

    // Path traversal with '..' outside boundary is BLOCKED
    assert.equal(isPathInsideAllowed("C:\\allowed\\directory\\..\\secret.sys", [baseDir]), false);
    assert.equal(isPathInsideAllowed("C:\\allowed\\directory\\sub\\..\\..\\evil.exe", [baseDir]), false);

    // Prefix collision attack (e.g. C:\allowed\directory-evil) is strictly BLOCKED!
    assert.equal(isPathInsideAllowed("C:\\allowed\\directory-evil\\hack.exe", [baseDir]), false);
    assert.equal(isPathInsideAllowed("C:\\allowed\\directory_evil", [baseDir]), false);
  });

  // Clean up
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {}

  console.log("\n==================================================================");
  console.log(`📊 RESILIENCE & LEASES SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log("==================================================================");

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
