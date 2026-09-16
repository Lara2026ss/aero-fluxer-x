import path from "node:path";
import { fileURLToPath } from "node:url";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";
import { createRuntime } from "../core/runtime.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let total = 0;
let passed = 0;

function assert(cond, msg) {
  total++;
  if (!cond) {
    console.error(`  ✗ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
  passed++;
}

async function run() {
  console.log("==================================================");
  console.log("🧪 RUNNING ELEVATION & CONFIRMATION CODE HOTFIX TEST");
  console.log("==================================================");

  const runtime = await createRuntime({ root: ROOT });
  const registry = new Registry(runtime);
  await registry.load();
  const router = new Router({ registry, runtime });

  // 1. Initial state: standard level (clean up any previous runs first)
  runtime.permissions.revokeElevation();
  runtime.permissions.revoke({ scope: "*" });
  assert(runtime.permissions.currentLevel() === "standard", "Initial permission level is standard");

  // 2. Call grant_elevation without confirmation -> CONFIRMATION_REQUIRED
  const res1 = await router.execute({ tool: "security", action: "grant_elevation", args: {} });
  assert(res1.ok === false, "grant_elevation returns ok: false");
  assert(res1.code === "CONFIRMATION_REQUIRED", "grant_elevation returns CONFIRMATION_REQUIRED");
  const code1 = res1.confirmationCode;
  const reqId1 = res1.requestId;
  assert(typeof code1 === "string" && code1.length === 4, `confirmationCode generated (${code1})`);

  // 3. Call grant_elevation a SECOND time -> MUST REUSE THE SAME CODE (fix AFX-FB-U6VQTG)
  const res2 = await router.execute({ tool: "security", action: "grant_elevation", args: {} });
  assert(res2.ok === false, "Second call returns ok: false");
  assert(res2.code === "CONFIRMATION_REQUIRED", "Second call returns CONFIRMATION_REQUIRED");
  assert(res2.confirmationCode === code1, `confirmationCode is STABLE: ${res2.confirmationCode} === ${code1} (does not regenerate)`);
  assert(res2.requestId === reqId1, `requestId is STABLE: ${res2.requestId} === ${reqId1}`);

  // 4. Call grant_elevation providing the confirmationCode inline -> MUST APPROVE AND ACTIVATE
  const res3 = await router.execute({ tool: "security", action: "grant_elevation", args: { confirmationCode: code1, durationMinutes: 10 } });
  assert(res3.ok === true, "grant_elevation with confirmationCode executes successfully");
  assert(runtime.permissions.isElevationActive() === true, "Elevation is now ACTIVE");
  assert(runtime.permissions.currentLevel() === "maintainer" || runtime.permissions.currentLevel() === "advanced", `Current level is elevated (${runtime.permissions.currentLevel()})`);

  // 5. Revoke elevation to test approve_request without requestId
  runtime.permissions.revokeElevation();
  assert(runtime.permissions.isElevationActive() === false, "Elevation revoked for next test");

  // 6. Call grant_elevation to get a new code
  const res4 = await router.execute({ tool: "security", action: "grant_elevation", args: {} });
  assert(res4.ok === false, "grant_elevation again returns CONFIRMATION_REQUIRED");
  const code2 = res4.confirmationCode;

  // 7. Call approve_request with ONLY confirmationCode (no requestId!)
  const res5 = await router.execute({ tool: "security", action: "approve_request", args: { confirmationCode: code2, grantMinutes: 15 } });
  assert(res5.ok === true, "approve_request with ONLY confirmationCode approved successfully");
  assert(runtime.permissions.isElevationActive() === true, "Elevation is now active via approve_request code-only");

  // 8. Clean up
  runtime.permissions.revokeElevation();

  console.log("==================================================");
  console.log(`🎉 ALL ${passed}/${total} ELEVATION HOTFIX TESTS PASSED!`);
  console.log("==================================================");
}

run().catch(e => {
  console.error("FATAL ERROR IN TEST:", e);
  process.exit(1);
});
