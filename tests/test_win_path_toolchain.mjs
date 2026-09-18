import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";
import { normalizeWindowsPath, getToolchainSnapshot, resolveBinary } from "../core/toolchain.mjs";

console.log("=== SUITE 3: UNIFICACIÓN DE PATH Y TOOLCHAIN DISCOVERY (BUG 2) ===");

const runtime = await createRuntime({ root: ".", version: "9.0.0", brand: "Aeron Fluxer X" });
const registry = new Registry(runtime);
await registry.load();
const router = new Router({ runtime, registry });

let passed = 0;
let failed = 0;

// Test 1: Normalización de PATH de Windows (deduplicación case-insensitive)
const mockPath = "C:\\Windows\\System32;C:\\Program Files\\nodejs;C:\\Windows\\System32;c:\\windows\\system32\\";
const normalized = normalizeWindowsPath(mockPath);
const parts = normalized.split(";");
const system32Count = parts.filter(p => p.toLowerCase() === "c:\\windows\\system32").length;
if (system32Count === 1) {
  console.log("  ✓ Test 1: normalizeWindowsPath() deduplica entradas case-insensitive y añade directorios críticos.");
  passed++;
} else {
  console.error("  ✗ Test 1 falló: system32Count =", system32Count, normalized);
  failed++;
}

// Test 2: Toolchain Snapshot discovery
const snapshot = await getToolchainSnapshot();
if (snapshot.platform === "win32" && snapshot.binaries.node.available && snapshot.binaries.powershell.available) {
  console.log("  ✓ Test 2: getToolchainSnapshot() descubre binarios clave (Node, PowerShell, etc.):");
  console.log(`    ℹ Node: ${snapshot.binaries.node.path} (${snapshot.binaries.node.version})`);
  console.log(`    ℹ PowerShell: ${snapshot.binaries.powershell.path} (${snapshot.binaries.powershell.version})`);
  passed++;
} else {
  console.error("  ✗ Test 2 falló:", snapshot);
  failed++;
}

// Test 3: Subherramienta nueva diagnostics.resolve_toolchain
const diagToolchain = await router.execute({
  tool: "diagnostics",
  action: "resolve_toolchain",
  args: {}
});
if (diagToolchain.ok && diagToolchain.binaries && diagToolchain.effectivePath) {
  console.log("  ✓ Test 3: diagnostics.resolve_toolchain responde con el toolchain completo.");
  passed++;
} else {
  console.error("  ✗ Test 3 falló:", diagToolchain);
  failed++;
}

// Test 4: Consistencia absoluta entre diagnostics y terminal
const termNodeCheck = await router.execute({
  tool: "terminal",
  action: "run_command",
  args: { command: "node -v" }
});
if (termNodeCheck.ok && termNodeCheck.stdout.trim() === snapshot.binaries.node.version) {
  console.log("  ✓ Test 4: terminal ejecuta 'node -v' por nombre corto sin error y captura stdout correctamente.");
  passed++;
} else {
  console.error("  ✗ Test 4 falló: terminal stdout:", termNodeCheck.stdout, "vs toolchain version:", snapshot.binaries.node.version);
  failed++;
}

// Test 5: Ejecución por ruta absoluta con captura íntegra de stdout
const termNodeAbsCheck = await router.execute({
  tool: "terminal",
  action: "run_command",
  args: { command: `& "${snapshot.binaries.node.path}" -v` }
});
if (termNodeAbsCheck.ok && termNodeAbsCheck.stdout.trim() === snapshot.binaries.node.version) {
  console.log("  ✓ Test 5: terminal ejecuta por ruta absoluta y captura stdout no vacío.");
  passed++;
} else {
  console.error("  ✗ Test 5 falló:", termNodeAbsCheck);
  failed++;
}

// Test 6: Consistencia con packages domain
const pkgCheck = await router.execute({
  tool: "packages",
  action: "check_manager",
  args: { manager: "npm" }
});
if (pkgCheck.ok && pkgCheck.available && pkgCheck.version) {
  console.log(`  ✓ Test 6: packages.check_manager valida npm exitosamente (v${pkgCheck.version}).`);
  passed++;
} else {
  console.error("  ✗ Test 6 falló:", pkgCheck);
  failed++;
}

console.log(`\nResultado Suite 3: ${failed === 0 ? `PASS (${passed}/${passed})` : `FAIL (${passed} pass, ${failed} fail)`}`);
if (failed > 0) process.exit(1);
