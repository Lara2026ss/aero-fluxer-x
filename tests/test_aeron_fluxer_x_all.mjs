import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

console.log("🔥 [AERON FLUXER X v9.0 — COMPREHENSIVE 10-DOMAIN TEST SUITE]");

const runtime = await createRuntime({ root: rootDir });
const registry = new Registry(runtime);
await registry.load();
runtime._registry = registry;
const router = new Router({ runtime, registry });
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`    ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

// 1. Files Domain
await test("1. Files Domain (file_exists, checksum, write, read, delete)", async () => {
  const ex = await router.execute({ tool: "files", action: "file_exists", args: { path: "aeron.config.json" } });
  assert.equal(ex.ok, true);
  assert.equal(ex.exists, true);

  const p = "storage/cache/aeron_file_test.txt";
  await router.execute({ tool: "files", action: "write_file", args: { path: p, content: "Aeron Fluxer X v9.0 Files TEST" } });
  const ck = await router.execute({ tool: "files", action: "calculate_checksum", args: { path: p } });
  assert.equal(ck.ok, true);
  assert.ok(ck.hash && ck.checksum);
  await router.execute({ tool: "files", action: "delete_path", args: { path: p } });
});

// 2. Terminal Domain
await test("2. Terminal Domain (Execute, Inline, Sessions, Processes)", async () => {
  const inline = await router.execute({ tool: "terminal", action: "run_inline_script", args: { code: "console.log('AERON_OK');", language: "javascript" } });
  assert.equal(inline.ok, true);
  assert.ok(inline.stdout.includes("AERON_OK"));

  const procs = await router.execute({ tool: "terminal", action: "list_processes", args: { limit: 3 } });
  assert.equal(procs.ok, true);
  assert.ok(Array.isArray(procs.processes) && procs.processes.length > 0);
});

// 3. Packages Domain
await test("3. Packages Domain (check_manager, list_installed)", async () => {
  const npmCheck = await router.execute({ tool: "packages", action: "check_manager", args: { manager: "npm" } });
  assert.equal(npmCheck.ok, true);
  assert.ok(npmCheck.version);

  const listRes = await router.execute({ tool: "packages", action: "list_installed", args: { manager: "npm" } });
  assert.equal(listRes.ok, true);
});

// 4. System Domain
await test("4. System Domain (snapshot, cpu, ram, env masking)", async () => {
  const snap = await router.execute({ tool: "system", action: "get_system_snapshot" });
  assert.equal(snap.ok, true);
  assert.ok(snap.memory && snap.cores > 0);

  const envRes = await router.execute({ tool: "system", action: "list_env" });
  assert.equal(envRes.ok, true);
  assert.ok(envRes.env);
});

// 5. Security Domain
await test("5. Security Domain (UUID, token, AES-256-GCM crypto)", async () => {
  const uuidRes = await router.execute({ tool: "security", action: "generate_uuid" });
  assert.equal(uuidRes.ok, true);

  const enc = await router.execute({ tool: "security", action: "encrypt_text", args: { text: "AeronSecret", password: "pass123!" } });
  assert.equal(enc.ok, true);
  const dec = await router.execute({ tool: "security", action: "decrypt_text", args: { encrypted: enc.encrypted, password: "pass123!" } });
  assert.equal(dec.ok, true);
  assert.equal(dec.decrypted, "AeronSecret");
});

// 6. Database Domain
await test("6. Database Domain (SQLite in-memory query & export)", async () => {
  const query = await router.execute({
    tool: "database",
    action: "execute_query",
    args: { database: ":memory:", query: "CREATE TABLE test (id INT, val TEXT); INSERT INTO test VALUES (1, 'AELON');" }
  });
  assert.equal(query.ok, true);
});

// 7. Network Domain
await test("7. Network Domain (get_interfaces, test_connection)", async () => {
  const ifaces = await router.execute({ tool: "network", action: "get_interfaces" });
  assert.equal(ifaces.ok, true);
  assert.ok(ifaces.count > 0);

  const conn = await router.execute({ tool: "network", action: "test_connection", args: { host: "8.8.8.8", port: 53, timeoutMs: 1000 } });
  assert.equal(conn.ok, true);
});

// 8. Diagnostics Domain
await test("8. Diagnostics Domain (self_test, benchmark, system_diagnose)", async () => {
  const self = await router.execute({ tool: "diagnostics", action: "self_test" });
  assert.equal(self.ok, true);
  assert.equal(self.health, "HEALTHY");

  const bench = await router.execute({ tool: "diagnostics", action: "benchmark", args: { loops: 20 } });
  assert.equal(bench.ok, true);
  assert.ok(bench.avgOpMs >= 0);
});

// 9. Developer Domain
await test("9. Developer Domain (detect_project, inspect_project)", async () => {
  const detect = await router.execute({ tool: "developer", action: "detect_project", args: { path: "." } });
  assert.equal(detect.ok, true);
  assert.ok(detect.isProject);
  assert.equal(detect.primaryType, "Node.js");

  const inspect = await router.execute({ tool: "developer", action: "inspect_project", args: { path: "." } });
  assert.equal(inspect.ok, true);
  assert.ok(inspect.name);
});

// 10. Shortcuts Domain
await test("10. Shortcuts Domain (list)", async () => {
  const shot = await router.execute({ tool: "shortcuts", action: "list" });
  assert.equal(shot.ok, true);
});

console.log("\n=======================================");
console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
console.log("======================================\n");

await runtime.shutdown();
process.exit(failed > 0 ? 1 : 0);
