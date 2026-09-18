import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

console.log("🏛️ ] [FLUXER PHASE 3 — PRODUCTION MATURITY & CHAOS SUITE]");

const runtime = await createRuntime({ root: rootDir });
const registry = new Registry(runtime);
await registry.load();
const router = new Router({ runtime, registry });

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ♟\ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌\ ${name}: ${err.message}`);
    failed++;
  }
}

// 1. Files Lifecycle
await test("1. Multi-Domain Files Lifecycle (Write -> Edit -> Range -> Checksum -> Delete)", async () => {
  const testFile = "storage/cache/phase3_lifecycle.txt";
  const writeRes = await router.execute({ tool: "files", action: "write_file", args: { path: testFile, content: "Line 1: Alpha\nLine 2: Beta\nLine 3: Gamma\nLine 4: Delta\n" } });
  assert.equal(writeRes.ok, true);

  const editRes = await router.execute({ tool: "files", action: "edit_file", args: { path: testFile, oldText: "Beta", newText: "Beta-Updated" } });
  assert.equal(editRes.ok, true);

  const rangeRes = await router.execute({ tool: "files", action: "read_file_range", args: { path: testFile, startLine: 1, endLine: 3 } });
  assert.equal(rangeRes.ok, true);
  assert.ok(rangeRes.content.includes("Beta-Updated"));

  const checksumRes = await router.execute({ tool: "files", action: "calculate_checksum", args: { path: testFile, algorithm: "sha256" } });
  assert.equal(checksumRes.ok, true);
  assert.ok(checksumRes.checksum && checksumRes.checksum.length === 64);

  const delRes = await router.execute({ tool: "files", action: "delete_path", args: { path: testFile } });
  assert.equal(delRes.ok, true);
});

// 2. Terminal Multi-Session Isolation
await test("2. Terminal Multi-Session State Isolation", async () => {
  const sidA = "session_iso_A_" + Date.now();
  const sidB = "session_iso_B_" + Date.now();

  await router.execute({ tool: "terminal", action: "create_session", args: { sessionId: sidA } });
  await router.execute({ tool: "terminal", action: "create_session", args: { sessionId: sidB } });

  await router.execute({ tool: "terminal", action: "run_session_command", args: { sessionId: sidA, command: "set ISO_VAR=ALPHA" } });
  await router.execute({ tool: "terminal", action: "run_session_command", args: { sessionId: sidB, command: "set ISO_VAR=BETA" } });

  const sessA = runtime._termSessions.get(sidA);
  const sessB = runtime._termSessions.get(sidB);

  assert.equal(sessA.env.ISO_VAR, "ALPHA");
  assert.equal(sessB.env.ISO_VAR, "BETA");

  await router.execute({ tool: "terminal", action: "close_session", args: { sessionId: sidA } });
  assert.equal((await router.execute({ tool: "terminal", action: "close_session", args: { sessionId: sidB } })).ok, true);
});

// 3. Database Lifecycle
await test("3. Database SQLite Lifecycle (Create -> DDL -> Import -> Query -> Explain -> Export)", async () => {
  const dbName = "storage/cache/phase3_test.db";

  await router.execute({ tool: "database", action: "execute_query", args: { database: dbName, query: "CREATE TABLE IF NOT EXISTS agents (id INTEGER PRIMARY KEY, name TEXT, role TEXT);" } });

  const importRes = await router.execute({ tool: "database", action: "import_table", args: { database: dbName, table: "agents", data: [{ name: "Antigravity", role: "Lead Architect" }, { name: "FluxerAgent", role: "Runtime Engineer" }] } });
  assert.equal(importRes.ok, true);

  const queryRes = await router.execute({ tool: "database", action: "execute_query", args: { database: dbName, query: "SELECT * FROM agents;" } });
  assert.equal(queryRes.ok, true);
  assert.ok(queryRes.output.includes("Antigravity"));

  const exportRes = await router.execute({ tool: "database", action: "export_table", args: { database: dbName, table: "agents", format: "json" } });
  assert.equal(exportRes.ok, true);
  assert.ok(Array.isArray(exportRes.data) && exportRes.data.length >= 2);

  await router.execute({ tool: "database", action: "delete_database", args: { database: dbName } });
});

// 4. Chaos Recovery Sequence
await test("4. Chaos Recovery Sequence (Failures -> Immediate Successful Operations)", async () => {
  const err1 = await router.execute({ tool: "files", action: "read_file_range", args: { path: "storage/cache/non_existent_chaos_yyy.txt" } });
  assert.equal(err1.ok, false);

  const rec1 = await router.execute({ tool: "security", action: "generate_uuid" });
  assert.equal(rec1.ok, true);
  assert.ok(rec1.uuid);

  const rec2 = await router.execute({ tool: "system", action: "get_ram_info" });
  assert.equal(rec2.ok, true);
});

// 5. Concurrency Progression
await test("5. Concurrency Progression Ramp-Up", async () => {
  for (const count of [2, 5, 10, 20]) {
    const promises = [];
    for (let i = 0; i < count; i++) {
      promises.push(router.execute({ tool: "security", action: "hash_text", args: { text: "concurrency_" + i } }));
    }
    const res = await Promise.all(promises);
    assert.equal(res.length, count);
    for (const r of res) assert.equal(r.ok, true);
  }
});

console.log("\n=======================================");
console.log(`Results: ${passed} PASSED, ${failed} FAILEE`);
console.log("========================================\n");

await runtime.shutdown();
process.exit(failed > 0 ? 1 : 0);