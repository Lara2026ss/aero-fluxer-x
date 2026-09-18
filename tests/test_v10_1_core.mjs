import assert from "node:assert";
import path from "node:path";
import { Validator } from "../core/validator.mjs";
import { OperationEngine } from "../core/operation-engine.mjs";
import { VerificationEngine } from "../core/verification.mjs";
import { ProcessLifecycleManager } from "../core/process-lifecycle.mjs";
import { CachePolicy } from "../core/cache-policy.mjs";
import { FluxerError, ERROR_CODES } from "../core/errors.mjs";

async function runTests() {
  console.log("=== Test Suite: v10.1 Core & Operation Engine ===");

  // 1. Validator
  console.log("-> 1. Validator.validatePath...");
  assert.throws(() => Validator.validatePath(""), /requerido/);
  const normPath = Validator.validatePath("tools/system.mjs", { baseDir: process.cwd() });
  assert.ok(path.isAbsolute(normPath));

  console.log("-> 2. Validator.validatePort...");
  assert.strictEqual(Validator.validatePort("8080"), 8080);
  assert.strictEqual(Validator.validatePort(3000), 3000);
  assert.throws(() => Validator.validatePort(0), /Puerto/);
  assert.throws(() => Validator.validatePort(70000), /Puerto/);
  assert.throws(() => Validator.validatePort("abc"), /Puerto/);

  console.log("-> 3. Validator.validatePid...");
  assert.strictEqual(Validator.validatePid("1234"), 1234);
  assert.throws(() => Validator.validatePid(0), /proceso crítico/);
  assert.throws(() => Validator.validatePid(4), /proceso crítico/);
  assert.throws(() => Validator.validatePid(process.pid), /No se permite terminar el propio proceso/);

  console.log("-> 4. Validator.validateEnum...");
  assert.strictEqual(Validator.validateEnum("png", ["png", "jpg"], "format"), "png");
  assert.throws(() => Validator.validateEnum("exe", ["png", "jpg"], "format"), /Valor inválido/);

  // 2. OperationEngine
  console.log("-> 5. OperationEngine 5-Stage Pipeline...");
  const fakeRuntime = {
    permissions: {
      hasPermission: () => true
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {}
    }
  };
  const engine = new OperationEngine({ runtime: fakeRuntime });

  const result = await engine.execute({
    domain: "test",
    action: "echo",
    principal: "test_user",
    validate: (params) => {
      Validator.validateNonEmptyString(params.msg, "msg");
    },
    execute: async (params) => {
      return { echoed: params.msg };
    },
    verify: async (output) => {
      return { verified: output.echoed === "hola" };
    },
    params: { msg: "hola" }
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.data.echoed, "hola");
  assert.ok(result.operationId.startsWith("op_") || result.operationId.startsWith("op-"));
  assert.strictEqual(result.verification.verified, true);

  // 3. ProcessLifecycleManager
  console.log("-> 6. ProcessLifecycleManager...");
  const plm = new ProcessLifecycleManager({ logger: { warn: () => {} } });
  let timerFired = false;
  const tid = plm.registerTimer(() => { timerFired = true; }, 50);
  assert.ok(tid);
  await new Promise(r => setTimeout(r, 80));
  assert.strictEqual(timerFired, true);

  const cmdRes = await plm.runManagedCommand('Write-Output "fluxer-live"', { timeoutMs: 5000 });
  assert.strictEqual(cmdRes.ok, true);
  assert.strictEqual(cmdRes.stdout, "fluxer-live");

  // 4. CachePolicy Deduplication
  console.log("-> 7. CachePolicy in-flight deduplication...");
  const cachePolicy = new CachePolicy();
  let callCount = 0;
  const slowFn = async () => {
    callCount++;
    await new Promise(r => setTimeout(r, 60));
    return "computed-val";
  };

  const [v1, v2, v3] = await Promise.all([
    cachePolicy.deduplicate("test-key", slowFn),
    cachePolicy.deduplicate("test-key", slowFn),
    cachePolicy.deduplicate("test-key", slowFn)
  ]);

  assert.strictEqual(v1, "computed-val");
  assert.strictEqual(v2, "computed-val");
  assert.strictEqual(v3, "computed-val");
  assert.strictEqual(callCount, 1);

  console.log("=== PASS: v10.1 Core & Operation Engine ===");
}

runTests().catch(err => {
  console.error("Test falló:", err);
  process.exit(1);
});
