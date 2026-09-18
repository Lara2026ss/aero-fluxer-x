import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";

console.log("=== SUITE 2: SHELL, SINTAXIS Y PARSING EDUCATIVO (BUG 1) ===");

const runtime = await createRuntime({ root: ".", version: "9.0.0", brand: "Aeron Fluxer X" });
const registry = new Registry(runtime);
await registry.load();
const router = new Router({ runtime, registry });

let passed = 0;
let failed = 0;

// Test 1: Comando PowerShell simple
const res1 = await router.execute({
  tool: "terminal",
  action: "run_command",
  args: { command: "Write-Output 'Aeron PS Simple'" }
});
if (res1.ok && res1.stdout.includes("Aeron PS Simple") && res1.effectiveShell === "powershell") {
  console.log("  ✓ Test 1: Comando PowerShell simple ejecutado con éxito y effectiveShell declarado.");
  passed++;
} else {
  console.error("  ✗ Test 1 falló:", res1);
  failed++;
}

// Test 2: Comando compuesto con sintaxis PowerShell nativa ';'
const res2 = await router.execute({
  tool: "terminal",
  action: "run_command",
  args: { command: "$a = 'Paso1'; $b = 'Paso2'; Write-Output \"$a - $b\"" }
});
if (res2.ok && res2.stdout.includes("Paso1 - Paso2")) {
  console.log("  ✓ Test 2: Comando compuesto en PowerShell con ';' ejecutado correctamente.");
  passed++;
} else {
  console.error("  ✗ Test 2 falló:", res2);
  failed++;
}

// Test 3: Rechazo educativo de sintaxis bash ('&&')
const res3 = await router.execute({
  tool: "terminal",
  action: "run_command",
  args: { command: "echo uno && echo dos" }
});
if (!res3.ok && res3.error && res3.error.includes("sintaxis de bash") && res3.error.includes("PowerShell")) {
  console.log("  ✓ Test 3: Sintaxis bash ('&&') rechazada con mensaje educativo y accionable:");
  console.log(`    ℹ Mensaje recibido: "${res3.error.slice(0, 100)}..."`);
  passed++;
} else {
  console.error("  ✗ Test 3 falló (no rechazó con mensaje educativo):", res3);
  failed++;
}

// Test 4: Rechazo educativo de sintaxis bash ('||')
const res4 = await router.execute({
  tool: "terminal",
  action: "run_command",
  args: { command: "false || echo fallback" }
});
if (!res4.ok && res4.error && res4.error.includes("sintaxis de bash")) {
  console.log("  ✓ Test 4: Sintaxis bash ('||') rechazada controladamente con alternativas de PowerShell.");
  passed++;
} else {
  console.error("  ✗ Test 4 falló:", res4);
  failed++;
}

// Test 5: Ejecución explícita en modo shell: 'cmd'
const res5 = await router.execute({
  tool: "terminal",
  action: "run_command",
  args: { command: "echo cmd_mode_ok", shell: "cmd" }
});
if (res5.ok && res5.stdout.includes("cmd_mode_ok") && res5.effectiveShell === "cmd") {
  console.log("  ✓ Test 5: Modo explícito shell 'cmd' ejecutado con metadatos completos.");
  passed++;
} else {
  console.error("  ✗ Test 5 falló:", res5);
  failed++;
}

// Test 6: Verificación de metadatos de trazabilidad completa
if (res1.durationMs >= 0 && res1.encoding === "utf-8" && res1.resolvedCommand && res1.effectiveEnvPath) {
  console.log("  ✓ Test 6: Metadatos de observabilidad (durationMs, encoding, resolvedCommand, effectiveEnvPath) presentes.");
  passed++;
} else {
  console.error("  ✗ Test 6 falló:", res1);
  failed++;
}

console.log(`\nResultado Suite 2: ${failed === 0 ? `PASS (${passed}/${passed})` : `FAIL (${passed} pass, ${failed} fail)`}`);
if (failed > 0) process.exit(1);
