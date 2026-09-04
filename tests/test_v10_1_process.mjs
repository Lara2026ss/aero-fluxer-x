import assert from "node:assert";
import { createSystemDomain } from "../tools/system.mjs";
import { Validator } from "../core/validator.mjs";
import { VerificationEngine } from "../core/verification.mjs";

async function runTests() {
  console.log("=== Test Suite: v10.1 Process & Port Tooling ===");

  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  const fakeRuntime = {
    root: process.cwd(),
    run: async (cmd) => {
      try {
        const { stdout, stderr } = await execAsync(cmd, { windowsHide: true });
        return { ok: true, stdout, stderr };
      } catch (e) {
        return { ok: false, stdout: e.stdout || "", stderr: e.stderr || e.message };
      }
    }
  };

  const sysDomain = createSystemDomain({
    runtime: fakeRuntime,
    os: await import("node:os"),
    dns: {},
    net: {},
    domain: (name, desc, actions, permissions) => ({ name, actions, permissions }),
    httpFetchText: () => {},
    sendNativeNotification: () => {}
  });

  // 1. inspect_port_owner
  console.log("-> 1. inspect_port_owner on free port 59199...");
  const portRes = await sysDomain.actions.inspect_port_owner({ port: 59199 });
  assert.strictEqual(portRes.ok, true);
  assert.strictEqual(portRes.inUse, false);

  // 2. process_tree
  console.log("-> 2. process_tree for current node process...");
  const treeRes = await sysDomain.actions.process_tree({ pid: process.pid });
  assert.strictEqual(treeRes.ok, true);
  assert.ok(treeRes.tree);
  assert.strictEqual(treeRes.tree.pid, process.pid);

  // 3. kill_process_tree security block
  console.log("-> 3. kill_process_tree security guards (PID 0, 4, self)...");
  const res0 = await sysDomain.actions.kill_process_tree({ pid: 0 });
  assert.strictEqual(res0.ok, false);
  assert.match(res0.error, /proceso crítico/);

  const res4 = await sysDomain.actions.kill_process_tree({ pid: 4 });
  assert.strictEqual(res4.ok, false);
  assert.match(res4.error, /proceso crítico/);

  const resSelf = await sysDomain.actions.kill_process_tree({ pid: process.pid });
  assert.strictEqual(resSelf.ok, false);
  assert.match(resSelf.error, /No se permite terminar el propio proceso/);

  console.log("=== PASS: v10.1 Process & Port Tooling ===");
}

runTests().catch(err => {
  console.error("Test falló:", err);
  process.exit(1);
});
