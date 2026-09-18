import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

console.log("🔥 [FLUXER BREAKAGE & ADVERSARIAL TEST SUITE]");

const runtime = await createRuntime({ root: rootDir });
const registry = new Registry(runtime);
await registry.load();
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

// 1. Path Sanitization
await test("1. Path Sanitization (Quotes, File URLs, Null bytes)", async () => {
  const hpNull = runtime.hp("storage/cache/test\0_null.txt");
  assert.ok(!hpNull.includes("\0"), "Null bytes must be stripped");

  const hpQuotes = runtime.hp('\"storage/cache/test_quotes.txt\"');
  assert.ok(!hpQuotes.includes('"'), "Surrounding quotes must be stripped");

  const fileUrl = "file:///" + path.resolve(rootDir, "fluxer.config.json").replace(/\\/g, "/");
  const hpFileUrl = runtime.hp(fileUrl);
  assert.ok(!hpFileUrl.startsWith("file:"), "file:// prefix must be resolved");
  assert.ok(hpFileUrl.includes("fluxer.config.json"), "Path must contain filename");
});

// 2. files.file_exists
await test("2. files.file_exists returns clean boolean", async () => {
  const present = await router.execute({ tool: "files", action: "file_exists", args: { path: "fluxer.config.json" } });
  assert.equal(present.ok, true);
  assert.equal(present.exists, true);
  assert.equal(present.isFile, true);

  const absent = await router.execute({ tool: "files", action: "file_exists", args: { path: "storage/cache/non_existent_99.xyz" } });
  assert.equal(absent.ok, true);
  assert.equal(absent.exists, false);
});

// 3. Range Normalization
await test("3. Inverted range slicing normalization", async () => {
  const res = await router.execute({
    tool: "files",
    action: "read_file_range",
    args: { path: "fluxer.config.json", startLine: 10, endLine: 2 },
  });
  assert.equal(res.ok, true);
  assert.ok(res.linesReturned > 0, "Lines should be returned");
  assert.equal(res.startLine, 2);
  assert.equal(res.endLine, 10);
});

// 4. packages.check_manager
await test("4. packages.check_manager probes availability", async () => {
  const npmCheck = await router.execute({ tool: "packages", action: "check_manager", args: { manager: "npm" } });
  assert.equal(npmCheck.ok, true);
  assert.equal(npmCheck.manager, "npm");
  assert.equal(typeof npmCheck.available, "boolean");

  const fakeCheck = await router.execute({ tool: "packages", action: "check_manager", args: { manager: "fake_mgr_123" } });
  assert.equal(fakeCheck.ok, true);
  assert.equal(fakeCheck.available, false);
});

// 5. Terminal Session Environment Variables
await test("5. Terminal Session Environment Variables", async () => {
  const sid = "test_sid_" + Date.now();
  await router.execute({ tool: "terminal", action: "create_session", args: { sessionId: sid } });

  await router.execute({
    tool: "terminal",
    action: "run_session_command",
    args: { sessionId: sid, command: "set TEST_FLUX_VAR_ADV=HELLO_WORLD" },
  });

  const sessionObj = runtime._termSessions?.get(sid);
  assert.ok(sessionObj, "Session must exist");
  assert.equal(sessionObj.env.TEST_FLUX_VAR_ADV, "HELLO_WORLD");

  await router.execute({ tool: "terminal", action: "close_session", args: { sessionId: sid } });
});

// 6. Concurrency Stress (20 calls)
await test("6. Concurrency Stress: 20 simultaneous tool calls", async () => {
  const calls = [];
  for (let i = 0; i < 5; i++) {
    calls.push(router.execute({ tool: "system", action: "get_cpu_info" }));
    calls.push(router.execute({ tool: "files", action: "file_exists", args: { path: "fluxer.config.json" } }));
    calls.push(router.execute({ tool: "security", action: "generate_uuid" }));
    calls.push(router.execute({ tool: "security", action: "hash_text", args: { text: "adv_test_" + i } }));
  }

  const results = await Promise.all(calls);
  assert.equal(results.length, 20);
  for (const r of results) {
    assert.equal(r.ok, true);
  }
});

console.log("\n=======================================");
console.log(`Results: ${passed} PASSED, ${failed} FAILEE`);
console.log("========================================\n");

await runtime.shutdown();
process.exit(failed > 0 ? 1 : 0);