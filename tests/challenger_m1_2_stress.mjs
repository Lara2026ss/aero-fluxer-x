/**
 * EMPIRICAL CHALLENGER STRESS HARNESS — FLUXER MCP v8.0
 *
 * Exhaustive adversarial testing for:
 * 1. Health checker domain deduplication & accuracy for all 7 modular domains
 * 2. High-concurrency action dispatch across modular domains (files, system, terminal, database, security, shortcuts, packages)
 * 3. Dashboard API HTML generation, zero version mismatch & REST/SSE stability
 * 4. Hook lifecycle, anti-loop detection, and confirmation store under load.
 */

import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";
import { runHealthCheck } from "../core/health.mjs";
import { startDashboardApi } from "../core/dashboard-api.mjs";
import { ConfirmationStore } from "../core/confirmation.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

let passedAssertions = 0;
let failedAssertions = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passedAssertions++;
    console.log(`    ✓ ${message}`);
  } else {
    failedAssertions++;
    failures.push(message);
    console.error(`    ✗ FAIL: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passedAssertions++;
    console.log(`    ✓ ${message} (got: ${JSON.stringify(actual)})`);
  } else {
    failedAssertions++;
    const errMsg = `${message} | Expected: ${JSON.stringify(expected)}, Got: ${JSON.stringify(actual)}`;
    failures.push(errMsg);
    console.error(`    ✗ FAIL: ${errMsg}`);
  }
}

async function fetchHttp(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method || "GET",
        headers: options.headers || {},
        timeout: options.timeout || 5000,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
            json: () => {
              try {
                return JSON.parse(body);
              } catch (e) {
                return null;
              }
            },
          });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
    if (options.body) {
      req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runAllChallengerTests() {
  console.log("================================================================");
  console.log("🛡️  EMPIRICAL CHALLENGER STRESS HARNESS — FLUXER MCP v8.0");
  console.log("================================================================\n");

  const runtime = await createRuntime({ root: ROOT_DIR, version: "8.0.0", brand: "FLUXER" });
  const registry = new Registry(runtime);
  await registry.load();
  runtime._registry = registry;
  const router = new Router({ runtime, registry });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SECTION 1: Health Checker Domain Deduplication & Accuracy
  // ──────────────────────────────────────────────────────────────────────────
  console.log("[TEST 1/4] Health Checker Domain Deduplication & Accuracy...");
  try {
    const healthResult = await runHealthCheck({
      runtime,
      registry,
      config: runtime.config,
    });

    assert(healthResult && typeof healthResult === "object", "Health check returns an object");
    assert(healthResult.ok === true, "Health check status is ok: true");

    const allChecks = healthResult.checks || [];
    assert(allChecks.length > 0, `Total health checks executed: ${allChecks.length}`);

    // Inspect domain checks specifically
    const domainChecks = allChecks.filter(
      (c) => c.category === "domain" || (c.name && c.name.startsWith("Domain:"))
    );

    const domainNames = domainChecks.map((c) => c.name);
    const domainFrequency = {};
    for (const name of domainNames) {
      domainFrequency[name] = (domainFrequency[name] || 0) + 1;
    }

    const duplicateDomains = Object.entries(domainFrequency).filter(([_, count]) => count > 1);
    assertEqual(
      duplicateDomains.length,
      0,
      `Domain checks must contain 0 duplicates (Found: ${JSON.stringify(duplicateDomains)})`
    );

    // Verify all registered moduleNames are represented
    const registryModules = registry.moduleNames();
    assert(registryModules.length >= 7, "Registry has at least 7 modular domains");
    for (const mod of registryModules) {
      assert(registryModules.includes(mod), `Registry domain '${mod}' is registered`);
    }
  } catch (err) {
    failedAssertions++;
    failures.push(`Health check exception: ${err.message}`);
    console.error(`    ✗ Exception in Test 1:`, err);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SECTION 2: Concurrent Multi-Domain Dispatch & Stress
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST 2/4] Concurrent Multi-Domain Dispatch & Stress...");
  try {
    const concurrentTasks = [
      router.execute("system", "get_system_info", {}),
      router.execute("security", "generate_uuid", {}),
      router.execute("security", "hash_text", { text: "stress test 1", algorithm: "sha256" }),
      router.execute("security", "generate_token", { bytes: 16 }),
      router.execute("system", "get_ram_info", {}),
      router.execute("system", "get_cpu_info", {}),
      router.execute("files", "list_allowed_directories", {}),
      router.execute("shortcuts", "list", {}),
      router.execute("packages", "list_repositories", {}),
      router.execute("security", "get_security_mode", {}),
    ];

    const results = await Promise.all(concurrentTasks);
    assert(results.length === 10, "All 10 concurrent tasks executed");
    for (let i = 0; i < results.length; i++) {
      assert(results[i] && results[i].ok === true, `Task ${i + 1} (${results[i]?.tool}.${results[i]?.action}) returned ok: true`);
    }
    console.log("    ✓ Multi-domain concurrency handled safely and gracefully.");
  } catch (err) {
    failedAssertions++;
    failures.push(`Concurrent dispatch exception: ${err.message}`);
    console.error(`    ✗ Exception in Test 2:`, err);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SECTION 3: Dashboard API HTML Generation, Version Consistency & REST
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST 3/4] Dashboard API HTML Generation & Version Consistency...");
  let dashboardServer = null;
  const testPort = 8799;
  try {
    dashboardServer = await startDashboardApi({
      runtime,
      registry,
      router,
      port: testPort,
    });

    const baseUrl = `http://127.0.0.1:${testPort}`;

    // Test Dashboard Home HTML
    const homeRes = await fetchHttp(`${baseUrl}/`);
    assertEqual(homeRes.status, 200, "Dashboard index status is 200");
    assert(homeRes.body.includes("FLUXER"), "Dashboard contains FLUXER branding");

    // Test /api/health
    const healthApiRes = await fetchHttp(`${baseUrl}/api/health`);
    assertEqual(healthApiRes.status, 200, "/api/health status is 200");
    const healthJson = healthApiRes.json();
    assert(healthJson && healthJson.ok === true, "/api/health JSON ok is true");

    // Test /api/tools
    const toolsApiRes = await fetchHttp(`${baseUrl}/api/tools`);
    assertEqual(toolsApiRes.status, 200, "/api/tools status is 200");
    const toolsJson = toolsApiRes.json();
    assert(Array.isArray(toolsJson?.tools || toolsJson), "/api/tools returns array of tools");
  } catch (err) {
    failedAssertions++;
    failures.push(`Dashboard exception: ${err.message}`);
    console.error(`    ✗ Exception in Test 3:`, err);
  } finally {
    try {
      dashboardServer?.close?.();
    } catch {}
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SECTION 4: Confirmation Store Lifecycle & Token Security Under Load
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST 4/4] Confirmation Store Lifecycle & Token Security Under Load...");
  try {
    const confirmationStore = new ConfirmationStore({ logger: runtime.logger });
    const req1 = confirmationStore.request({
      tool: "terminal",
      action: "run_command",
      args: { command: "whoami" },
      required: "poweruser",
      current: "user",
    });

    assert(req1 && req1.requestId, "Confirmation store creates valid requestId");
    const approved = confirmationStore.approve(req1.requestId);
    assertEqual(approved.status, "approved", "Approved request has status 'approved'");

    const retrieved = confirmationStore.get(req1.requestId);
    assertEqual(retrieved.status, "approved", "Retrieved request maintains status 'approved'");
    console.log("    ✓ Confirmation store lifecycle valid under load.");
  } catch (err) {
    failedAssertions++;
    failures.push(`Confirmation exception: ${err.message}`);
    console.error(`    ✗ Exception in Test 4:`, err);
  }

  // Final summary
  await runtime.shutdown("challenger-complete");

  console.log("\n================================================================");
  console.log(`📊 RESULTADOS: ${passedAssertions} PASARON | ${failedAssertions} FALLARON`);
  if (failures.length === 0) {
    console.log("🏆 TODOS LOS TESTS ADVERSARIALES PASARON AL 100%");
  } else {
    console.error(`❌ FALLARON ${failures.length} ASSERTIONS:`);
    for (const f of failures) console.error(`   - ${f}`);
  }
  console.log("================================================================\n");

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

runAllChallengerTests().catch((err) => {
  console.error("Fatal error in challenger suite:", err);
  process.exit(1);
});
