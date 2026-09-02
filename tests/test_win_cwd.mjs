import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";
import path from "node:path";
import fs from "node:fs/promises";

console.log("=== SUITE 4: VALIDACIÓN ESTRICTA DE CWD Y WORKSPACE (BUG 3) ===");

const runtime = await createRuntime({ root: ".", version: "9.0.0", brand: "Aeron Fluxer X" });
const registry = new Registry(runtime);
await registry.load();
const router = new Router({ runtime, registry });

const testCwdDir = path.resolve("storage/cache/test_cwd_sandbox");
await fs.mkdir(testCwdDir, { recursive: true });

let passed = 0;
let failed = 0;

// Test 1: CWD absoluto válido
const res1 = await router.execute({
  tool: "terminal",
  action: "run_command",
  args: { command: "Get-Location | Select-Object -ExpandProperty Path", cwd: testCwdDir }
});
if (res1.ok && res1.effectiveCwd.toLowerCase() === testCwdDir.toLowerCase()) {
  console.log("  ✓ Test 1: CWD absoluto respetado y reportado en effectiveCwd.");
  passed++;
} else {
  console.error("  ✗ Test 1 falló:", res1);
  failed++;
}

// Test 2: CWD relativo resuelto correctamente contra root
const relPath = "storage/cache/test_cwd_sandbox";
const res2 = await router.execute({
  tool: "terminal",
  action: "run_command",
  args: { command: "Write-Output 'rel_ok'", cwd: relPath }
});
if (res2.ok && res2.effectiveCwd.toLowerCase() === testCwdDir.toLowerCase()) {
  console.log("  ✓ Test 2: CWD relativo resuelto canónicamente contra la raíz del proyecto.");
  passed++;
} else {
  console.error("  ✗ Test 2 falló:", res2);
  failed++;
}

// Test 3: CWD inexistente rechazado con error claro inmediato
const invalidCwd = "C:\\Directorio_Que_No_Existe_12345_XYZ";
const res3 = await router.execute({
  tool: "terminal",
  action: "run_command",
  args: { command: "Write-Output 'should_not_run'", cwd: invalidCwd }
});
if (!res3.ok && res3.error && res3.error.includes("no existe") && res3.code === "CWD_NOT_FOUND") {
  console.log("  ✓ Test 3: CWD inexistente rechazado tempranamente con código CWD_NOT_FOUND:");
  console.log(`    ℹ Error: "${res3.error}"`);
  passed++;
} else {
  console.error("  ✗ Test 3 falló:", res3);
  failed++;
}

// Test 4: Nueva subherramienta files.validate_workspace
const wsValid = await router.execute({
  tool: "files",
  action: "validate_workspace",
  args: { path: "." }
});
if (wsValid.ok && wsValid.exists && wsValid.isDirectory && wsValid.workspaceRoot) {
  console.log("  ✓ Test 4: files.validate_workspace valida exitosamente el workspace root.");
  passed++;
} else {
  console.error("  ✗ Test 4 falló:", wsValid);
  failed++;
}

console.log(`\nResultado Suite 4: ${failed === 0 ? `PASS (${passed}/${passed})` : `FAIL (${passed} pass, ${failed} fail)`}`);
if (failed > 0) process.exit(1);
