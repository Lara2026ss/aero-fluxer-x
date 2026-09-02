import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";

const runtime = await createRuntime({ root: ".", version: "9.0.0", brand: "Aeron Fluxer X" });
const registry = new Registry(runtime);
await registry.load();
const router = new Router({ runtime, registry });

console.log("=== TEST 1: node -v ===");
const res1 = await router.execute({
  tool: "terminal",
  action: "run_command",
  args: { command: "node -v" }
});
console.log("res1:", JSON.stringify(res1, null, 2));

console.log("=== TEST 2: & 'C:\\Program Files\\nodejs\\node.exe' -v ===");
const res2 = await router.execute({
  tool: "terminal",
  action: "run_command",
  args: { command: "& \"C:\\Program Files\\nodejs\\node.exe\" -v" }
});
console.log("res2:", JSON.stringify(res2, null, 2));

console.log("=== TEST 3: npm -v ===");
const res3 = await router.execute({
  tool: "terminal",
  action: "run_command",
  args: { command: "npm -v" }
});
console.log("res3:", JSON.stringify(res3, null, 2));

console.log("=== TEST 4: check_manager npm ===");
const res4 = await router.execute({
  tool: "packages",
  action: "check_manager",
  args: { manager: "npm" }
});
console.log("res4:", JSON.stringify(res4, null, 2));

console.log("=== TEST 5: CLIXML spanish error ===");
const res5 = await router.execute({
  tool: "terminal",
  action: "run_command",
  args: { command: "Get-Process non_existent_proc_xyz" }
});
console.log("res5 stderr:", JSON.stringify(res5.stderr, null, 2));
