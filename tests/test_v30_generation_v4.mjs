/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚡ FLUXER XZ (V4.0 Architecture) — tests/test_v30_generation_v4.mjs
 * Comprehensive Verification Suite for Release v30.0.0 (Generation V4.0)
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { strict as assert } from "node:assert";
import { CURRENT_VERSION, GENERATION, BRAND_NAME, getVersionInfo } from "../core/version.mjs";
import { CapabilityRegistry, CAPABILITY_NAMES } from "../core/capability-registry.mjs";
import { WorkflowEngine, resolveTemplate } from "../core/workflow-engine.mjs";
import { compileMusicIntent, parseChord, noteToMidi } from "../core/flstudio/music_compiler.mjs";
import { parsePageRange } from "../tools/printcenter.mjs";
import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";

console.log("==================================================================");
console.log(`⚡ FLUXER XZ — Generation V4.0 (v${CURRENT_VERSION}) Test Suite`);
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

async function runAllTests() {
  // ── 1. Version and Product Identity ─────────────────────────────────────────
  await test("Version & Product Identity invariants", () => {
    assert.equal(CURRENT_VERSION, "30.0.2");
    assert.equal(GENERATION, "4.0");
    assert.equal(BRAND_NAME, "FLUXER XZ");
    const vInfo = getVersionInfo();
    assert.equal(vInfo.generation, "4.0");
    assert.equal(vInfo.version, "30.0.2");
  });

  // ── 2. Capability Registry ──────────────────────────────────────────────────
  await test("Capability Registry defines exactly 15 capabilities", () => {
    const reg = new CapabilityRegistry();
    assert.equal(reg.getAll().length, 15);
    for (const name of CAPABILITY_NAMES) {
      const cap = reg.get(name);
      assert.ok(cap, `Capability '${name}' must be registered`);
      assert.ok(cap.operations.length > 0, `Capability '${name}' must have operations`);
    }
  });

  await test("Capability Registry generates clean MCP tool schemas", () => {
    const reg = new CapabilityRegistry();
    const mcpTools = reg.toMcpTools({ compact: true });
    assert.equal(mcpTools.length, 15);
    for (const tool of mcpTools) {
      assert.ok(tool.name);
      assert.ok(tool.description);
      assert.ok(tool.inputSchema.properties.operation);
      assert.ok(tool.inputSchema.required.includes("operation"));
    }
  });

  await test("Capability Registry normalization handles canonical & legacy calls", () => {
    const reg = new CapabilityRegistry();
    // Canonical format
    const n1 = reg.normalizeCall({ capability: "files", operation: "read", options: { path: "test.txt" } });
    assert.equal(n1.capability, "files");
    assert.equal(n1.operation, "read");
    assert.equal(n1.target, "test.txt");

    // Legacy format
    const n2 = reg.normalizeCall({ tool: "screenshot", action: "capture_screen" });
    assert.equal(n2.capability, "media");
    assert.equal(n2.operation, "capture_screen");

    // Flat format
    const n3 = reg.normalizeCall({ tool: "fl_studio", subaction: "status" });
    assert.equal(n3.capability, "flstudio");
    assert.equal(n3.operation, "status");
  });

  // ── 3. DAG Workflow Engine ──────────────────────────────────────────────────
  await test("Workflow Engine validates DAG and detects cycles", () => {
    const engine = new WorkflowEngine();
    // Valid DAG
    const validDag = [
      { id: "a", capability: "system", operation: "snapshot" },
      { id: "b", capability: "network", operation: "test_connection", dependsOn: ["a"] },
      { id: "c", capability: "security", operation: "status", dependsOn: ["b"] },
    ];
    const resValid = engine.validate(validDag);
    assert.equal(resValid.ok, true);
    assert.deepEqual(resValid.executionOrder, ["a", "b", "c"]);

    // Cyclic DAG (a -> b -> a)
    const cyclicDag = [
      { id: "a", capability: "system", operation: "snapshot", dependsOn: ["b"] },
      { id: "b", capability: "network", operation: "test_connection", dependsOn: ["a"] },
    ];
    const resCyclic = engine.validate(cyclicDag);
    assert.equal(resCyclic.ok, false);
    assert.ok(resCyclic.error.includes("cycle"));
  });

  await test("Workflow Engine resolves variable templates accurately", () => {
    const ctx = {
      tasks: {
        step1: { data: { outputPath: "C:/out.txt", count: 42 } },
      },
      input: { mode: "prod" },
    };
    assert.equal(resolveTemplate("{{tasks.step1.data.outputPath}}", ctx), "C:/out.txt");
    assert.equal(resolveTemplate("{{tasks.step1.data.count}}", ctx), 42);
    assert.equal(resolveTemplate("Path is {{tasks.step1.data.outputPath}} in {{input.mode}}", ctx), "Path is C:/out.txt in prod");
  });

  // ── 4. FL Studio Music Compiler ─────────────────────────────────────────────
  await test("FL Studio Music Compiler produces complete 1-shot composition", () => {
    const compiled = compileMusicIntent({
      style: "trap",
      bpm: 140,
      root: "C#",
      scale: "minor",
      chords: ["C#m", "A", "F#m", "G#"],
      autoPlay: true,
    });
    assert.equal(compiled.ok, true);
    assert.equal(compiled.bpm, 140);
    assert.equal(compiled.root, "C#");
    assert.equal(compiled.chords.length, 4);
    assert.equal(compiled.drumChannels.length, 4);
    assert.equal(compiled.bridgePayload.action, "program_beat");
    assert.equal(compiled.bridgePayload.channels.length, 4);
  });

  await test("FL Studio Chord Parser handles various chords and scales", () => {
    const cMaj = parseChord("Cmaj", 4);
    assert.deepEqual(cMaj, [60, 64, 67]); // C4, E4, G4

    const aMin = parseChord("Am", 4);
    assert.deepEqual(aMin, [69, 72, 76]); // A4, C5, E5

    assert.equal(noteToMidi("A4"), 69);
    assert.equal(noteToMidi("C4"), 60);
  });

  // ── 5. Print Page Range Parser ──────────────────────────────────────────────
  await test("Print Page Range Parser supports continuous, ranges, and arrays", () => {
    // Array
    assert.deepEqual(parsePageRange([1, 5, 7], 10), [1, 5, 7]);

    // Discrete string
    assert.deepEqual(parsePageRange("1, 3, 5", 10), [1, 3, 5]);

    // Range string
    assert.deepEqual(parsePageRange("1-4", 10), [1, 2, 3, 4]);

    // Continuous keyword
    assert.deepEqual(parsePageRange("continuous", 5), [1, 2, 3, 4, 5]);
    assert.deepEqual(parsePageRange("all", 4), [1, 2, 3, 4]);
  });

  // ── 6. Full Runtime, Registry & Router Integration ──────────────────────────
  await test("Full Registry loads all 15 domains and executes via Router", async () => {
    const runtime = await createRuntime({ root: process.cwd(), version: CURRENT_VERSION, brand: BRAND_NAME });
    const registry = new Registry(runtime);
    await registry.load();
    const router = new Router({ runtime, registry });

    // Verify all 15 capabilities exist in registry
    for (const name of CAPABILITY_NAMES) {
      assert.ok(registry.modules.has(name), `Registry must have domain for capability '${name}'`);
    }

    // Call guide.overview via router
    const guideRes = await router.execute({
      capability: "guide",
      operation: "overview",
      options: { mode: "compact" },
    });
    assert.equal(guideRes.ok, true);
    assert.equal(guideRes.capability, "guide");
    assert.equal(guideRes.operation, "overview");
    assert.ok(guideRes.totalCapabilities >= 15);

    // Call system.snapshot via router
    const sysRes = await router.execute({
      capability: "system",
      operation: "snapshot",
      options: { compact: true },
    });
    assert.equal(sysRes.ok, true);
    assert.equal(sysRes.capability, "system");

    // Call flstudio.detect via router
    const flRes = await router.execute({
      capability: "flstudio",
      operation: "detect",
    });
    assert.equal(flRes.ok, true);
    assert.equal(flRes.capability, "flstudio");
    assert.ok(flRes.installed !== undefined);

    // Call upd.check via router
    const updRes = await router.execute({
      capability: "upd",
      operation: "check",
    });
    assert.equal(updRes.ok, true);
    assert.equal(updRes.capability, "upd");

    // Call upd.apply without confirm -> verify safety confirmation required
    const applyRes = await router.execute({
      capability: "upd",
      operation: "apply",
      options: { confirm: false },
    });
    assert.equal(applyRes.ok, false);
    assert.equal(applyRes.code, "CONFIRMATION_REQUIRED");

    // Call workflow.run with 2 steps in parallel
    const wfRes = await router.execute({
      capability: "workflow",
      operation: "run",
      options: {
        tasks: [
          { id: "task_sys", capability: "system", operation: "snapshot" },
          { id: "task_guide", capability: "guide", operation: "overview", dependsOn: ["task_sys"] },
        ],
      },
    });
    assert.equal(wfRes.ok, true);
    assert.equal(wfRes.completed, 2);
    assert.equal(wfRes.failed, 0);

    // Call web.images -> verify compact response format
    const imgRes = await router.execute({
      capability: "web",
      operation: "images",
      options: { query: "flowers", limit: 9, compact: true },
    });
    assert.equal(imgRes.ok, true);
    assert.equal(imgRes.capability, "web");

    // Verify unified response envelope structure
    assert.ok(imgRes.summary);
    assert.ok(imgRes.operationId);
  });

  console.log("\n==================================================================");
  console.log(`📊 TEST SUITE SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log("==================================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runAllTests();
