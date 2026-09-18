import { checkUpdateEligibility, parseSemVer, compareSemVer } from "../core/version.mjs";
import { PermissionEngine } from "../core/permissions.mjs";
import assert from "node:assert";

async function runTests() {
  console.log("=== Corriendo tests para v10.0.0 (Project Z) ===");
  
  // 1. SemVer
  console.log("-> Testeando SemVer parser y hotfixes...");
  assert.strictEqual(compareSemVer("9.2.6-1", "9.2.6"), 1);
  assert.strictEqual(compareSemVer("9.2.6", "9.2.6-1"), -1);
  assert.strictEqual(parseSemVer("9.2.6-2").hotfixNum, 2);
  const elig = checkUpdateEligibility("9.2.5", "9.2.5-1");
  assert.strictEqual(elig.eligible, true);
  assert.strictEqual(elig.diffType, "hotfix");

  // 2. Permissions & Workflow
  console.log("-> Testeando Permissions & Workflow...");
  const fakeMemory = {
    perms: [],
    activePermissions() { return this.perms; },
    grantPermission(opts) { this.perms.push(opts); return opts; },
    revokeWorkflow(id) { this.perms = this.perms.filter(p => p.workflowId !== id); }
  };
  const permEngine = new PermissionEngine({ memory: fakeMemory, logger: { info: () => {}, warn: () => {} } });
  
  const wf = permEngine.startWorkflow({ level: "poweruser", durationMinutes: 1, reason: "test", principal: "test_default" });
  assert.strictEqual(wf.level, "poweruser");
  const activeWf = permEngine.getWorkflow("test_default");
  assert.strictEqual(activeWf.status, "active");
  
  permEngine.revokeWorkflow({ principal: "test_default" });
  const inactiveWf = permEngine.getWorkflow("test_default");
  assert.strictEqual(inactiveWf, null);

  console.log("=== TODOS LOS TESTS PASARON EXITOSAMENTE ===");
}

runTests().catch(e => {
  console.error("Test Fallo:", e);
  process.exit(1);
});
