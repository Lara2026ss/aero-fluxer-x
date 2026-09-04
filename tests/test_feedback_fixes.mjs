import assert from "node:assert";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";

async function runFeedbackTests() {
  console.log("=== Test Suite: Feedbacks Verification ===");

  const root = process.cwd();
  const runtime = await createRuntime({ root });
  const registry = new Registry(runtime);
  await registry.load();
  runtime._registry = registry;
  const router = new Router({ runtime, registry });
  runtime.router = router;

  // 1. AFX-FB-6AMC6M: write_file checksumSha256 length is strictly 64 hex characters
  console.log("-> 1. AFX-FB-6AMC6M: write_file checksumSha256 strictly 64 hex chars...");
  const testFile = path.join(runtime.dirs.documents, "_test_checksum_len.txt");
  const writeRes = await runtime.router.execute({
    tool: "files",
    action: "write_file",
    args: { path: testFile, content: "Test content for SHA256 length verification" }
  });
  assert.strictEqual(writeRes.ok, true, "write_file should succeed");
  assert.strictEqual(typeof writeRes.checksumSha256, "string", "checksumSha256 should be a string");
  assert.strictEqual(writeRes.checksumSha256.length, 64, `checksumSha256 must be exactly 64 chars, got ${writeRes.checksumSha256.length}`);
  await fs.unlink(testFile).catch(() => {});

  // 2. AFX-FB-3URAVL: diagnostics.benchmark capping reporting
  console.log("-> 2. AFX-FB-3URAVL: diagnostics.benchmark explicit loops capping...");
  const benchRes = await runtime.router.execute({
    tool: "diagnostics",
    action: "benchmark",
    args: { loops: 100000 }
  });
  assert.strictEqual(benchRes.ok, true, "benchmark should succeed");
  assert.strictEqual(benchRes.requested_loops, 100000, "benchmark must report requested_loops");
  assert.strictEqual(benchRes.capped, true, "benchmark must report capped: true");
  assert.strictEqual(benchRes.capped_to, 5000, "benchmark must report capped_to: 5000");

  // 3. AFX-FB-UTCWKS: diagnostics.resolve_toolchain version & winget/npm consistency
  console.log("-> 3. AFX-FB-UTCWKS: diagnostics.resolve_toolchain consistency...");
  const tcRes = await runtime.router.execute({
    tool: "diagnostics",
    action: "resolve_toolchain",
    args: {}
  });
  assert.strictEqual(tcRes.ok, true, "resolve_toolchain should succeed");
  assert.ok(tcRes.engine.includes("v10."), `engine version should be v10.x, got: ${tcRes.engine}`);

  // 4. AFX-FB-S36535: system.wait and shortcuts.wait sleptMs & duration
  console.log("-> 4. AFX-FB-S36535: system.wait sleptMs returned...");
  const waitRes = await runtime.router.execute({
    tool: "system",
    action: "wait",
    args: { ms: 10 }
  });
  assert.strictEqual(waitRes.ok, true, "system.wait should succeed");
  assert.strictEqual(waitRes.sleptMs, 10, "sleptMs should be reported as 10");

  // 5. AFX-FB-F9SWJ8: database.execute_query SQLite created warning
  console.log("-> 5. AFX-FB-F9SWJ8: database.execute_query SQLite db_created warning...");
  const nonExistentDb = path.join(runtime.dirs.documents, "_fb_nonexistent_test.db");
  await fs.unlink(nonExistentDb).catch(() => {});
  const dbRes = await runtime.router.execute({
    tool: "database",
    action: "execute_query",
    args: { database: nonExistentDb, query: "CREATE TABLE test (id INT);" }
  });
  assert.strictEqual(dbRes.ok, true, "execute_query should succeed");
  assert.strictEqual(dbRes.db_created, true, "db_created should be true for newly created db");
  assert.ok(dbRes.warning && dbRes.warning.includes("no existía"), "warning must be present");
  await fs.unlink(nonExistentDb).catch(() => {});

  // 6. AFX-FB-3WVGDU: Escalation from poweruser to admintotaluser requires confirmation
  console.log("-> 6. AFX-FB-3WVGDU: Escalating workflow to admintotaluser requires CONFIRMATION_REQUIRED...");
  runtime.permissions.startWorkflow({ level: "poweruser", durationMinutes: 5, principal: "default" });
  assert.strictEqual(runtime.permissions.currentLevel(), "poweruser", "Should be at poweruser");

  const silentEscalateRes = await runtime.router.execute({
    tool: "security",
    action: "start_workflow",
    args: { level: "admintotaluser", durationMinutes: 10 }
  });
  assert.strictEqual(silentEscalateRes.ok, false, "Silent escalation should NOT succeed immediately");
  assert.strictEqual(silentEscalateRes.code, "CONFIRMATION_REQUIRED", "Must return CONFIRMATION_REQUIRED");
  assert.ok(silentEscalateRes.requestId, "Must return a valid requestId for confirmation");
  runtime.permissions.revokeWorkflow({ principal: "default" });

  // 7. AFX-FB-BGXWJ7 & AFX-FB-XHPWWM: Files sandbox enforcement and dynamic add/remove
  console.log("-> 7. AFX-FB-BGXWJ7 & AFX-FB-XHPWWM: Sandbox enforcement and dynamic allowed directories...");
  const unauthorizedSystemFile = "C:\\Windows\\win.ini";
  const readOutsideRes = await runtime.router.execute({
    tool: "files",
    action: "read_text_file",
    args: { path: unauthorizedSystemFile }
  });
  assert.strictEqual(readOutsideRes.ok, false, "Reading outside sandbox must fail");
  assert.strictEqual(readOutsideRes.code, "PERMISSION_DENIED", "Must return PERMISSION_DENIED");

  const tempSandboxFolder = path.join(os.tmpdir(), "fluxer_sandbox_allowed_test");
  await fs.mkdir(tempSandboxFolder, { recursive: true });

  // Elevamos a poweruser para poder gestionar allowed directories
  runtime.permissions.startWorkflow({ level: "poweruser", durationMinutes: 5, principal: "default" });

  const addRes = await runtime.router.execute({
    tool: "files",
    action: "add_allowed_directory",
    args: { path: tempSandboxFolder, label: "temp_test", persistent: false }
  });
  assert.strictEqual(addRes.ok, true, "add_allowed_directory should succeed");

  const sandboxAllowedFile = path.join(tempSandboxFolder, "test.txt");
  const writeAllowedRes = await runtime.router.execute({
    tool: "files",
    action: "write_file",
    args: { path: sandboxAllowedFile, content: "Sandbox test OK" }
  });
  assert.strictEqual(writeAllowedRes.ok, true, "Writing inside newly allowed directory must succeed");

  const removeRes = await runtime.router.execute({
    tool: "files",
    action: "remove_allowed_directory",
    args: { path: tempSandboxFolder }
  });
  assert.strictEqual(removeRes.ok, true, "remove_allowed_directory should succeed");

  // Revocamos workflow para volver al nivel base
  runtime.permissions.revokeWorkflow({ principal: "default" });

  const readAfterRemoveRes = await runtime.router.execute({
    tool: "files",
    action: "read_text_file",
    args: { path: sandboxAllowedFile }
  });
  assert.strictEqual(readAfterRemoveRes.ok, false, "Reading after directory removed from whitelist must fail");
  assert.strictEqual(readAfterRemoveRes.code, "PERMISSION_DENIED", "Must return PERMISSION_DENIED");

  await fs.unlink(sandboxAllowedFile).catch(() => {});
  await fs.rmdir(tempSandboxFolder).catch(() => {});

  // 8. AFX-FB-7CZ3C7: system.ping UTF-8 encoding on OEM Windows consoles
  console.log("-> 8. AFX-FB-7CZ3C7: system.ping clean UTF-8 encoding without replacement chars...");
  const pingRes = await runtime.router.execute({
    tool: "system",
    action: "ping",
    args: { host: "127.0.0.1", count: 1 }
  });
  assert.strictEqual(pingRes.ok, true, "system.ping should succeed");
  assert.strictEqual(pingRes.output.includes("\uFFFD"), false, "system.ping output must not contain Unicode replacement characters");

  // 9. AFX-FB-6BEYX8: Diagnostics host anonymization & Dashboard auth protection
  console.log("-> 9. AFX-FB-6BEYX8: Diagnostics host anonymization in public mode...");
  const anonRes = await runtime.router.execute({
    tool: "diagnostics",
    action: "health_check",
    args: { anonymize: true }
  });
  assert.strictEqual(anonRes.ok, true, "diagnostics.health_check with anonymize should succeed");
  assert.match(anonRes.hostname, /^host-[a-f0-9]{8}$/, "hostname must be anonymized hash");
  assert.strictEqual(anonRes.workspaceRoot, undefined, "workspaceRoot must not be exposed when anonymized");

  console.log("=== PASS: All Feedback Tests Passed 100% ===");
}

runFeedbackTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
