import assert from "node:assert";
import path from "node:path";
import { createDeveloperDomain } from "../tools/developer.mjs";
import { VerificationEngine } from "../core/verification.mjs";

async function runTests() {
  console.log("=== Test Suite: v10.1 Structured Git Tooling ===");

  const fakeRuntime = {
    root: process.cwd(),
    hp: (p) => path.resolve(process.cwd(), p),
    permissions: { isElevationActive: () => true },
    config: {},
    run: async () => ({ ok: true, stdout: "" })
  };

  const devDomain = createDeveloperDomain({
    runtime: fakeRuntime,
    path,
    fs: await import("node:fs/promises"),
    domain: (name, desc, actions, permissions) => ({ name, actions, permissions })
  });

  // 1. git_status_structured
  console.log("-> 1. git_status_structured...");
  const statusRes = await devDomain.actions.git_status_structured();
  assert.strictEqual(statusRes.ok, true);
  assert.ok(typeof statusRes.branch === "string");
  assert.ok(Array.isArray(statusRes.staged));
  assert.ok(Array.isArray(statusRes.unstaged));
  assert.ok(Array.isArray(statusRes.untracked));
  assert.ok(typeof statusRes.summary === "string");

  // 2. git_diff_summary
  console.log("-> 2. git_diff_summary...");
  const diffRes = await devDomain.actions.git_diff_summary({ staged: false });
  assert.strictEqual(diffRes.ok, true);
  assert.ok(typeof diffRes.totalInsertions === "number");
  assert.ok(typeof diffRes.totalDeletions === "number");
  assert.ok(Array.isArray(diffRes.files));

  // 3. git_log_compact
  console.log("-> 3. git_log_compact...");
  const logRes = await devDomain.actions.git_log_compact({ maxCount: 3 });
  assert.strictEqual(logRes.ok, true);
  assert.ok(Array.isArray(logRes.commits));
  assert.ok(logRes.commits.length > 0);
  assert.ok(logRes.commits[0].hash);
  assert.ok(logRes.commits[0].author);

  // 4. verifyGitIdentity
  console.log("-> 4. VerificationEngine.verifyGitIdentity...");
  const gitVerification = await VerificationEngine.verifyGitIdentity(process.cwd(), {
    expectedName: "Agy-Leo"
  });
  assert.strictEqual(gitVerification.verified, true);
  assert.strictEqual(gitVerification.identity.name, "Agy-Leo");

  console.log("=== PASS: v10.1 Structured Git Tooling ===");
}

runTests().catch(err => {
  console.error("Test falló:", err);
  process.exit(1);
});
