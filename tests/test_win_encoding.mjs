import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";
import path from "node:path";
import fs from "node:fs/promises";

console.log("=== SUITE 5: UTF-8 INTEGRAL Y PREVENCIÓN DE MOJIBAKE (BUG 4) ===");

const runtime = await createRuntime({ root: ".", version: "9.0.0", brand: "Aeron Fluxer X" });
const registry = new Registry(runtime);
await registry.load();
const router = new Router({ runtime, registry });

let passed = 0;
let failed = 0;

// Test 1: Salida stdout con acentos en español, 'ñ', signos de interrogación invertidos
const spanishSample = "¡Hola! Configuración rápida: tamaño, ejecución y verificación de código.";
const res1 = await router.execute({
  tool: "terminal",
  action: "run_command",
  args: { command: `Write-Output "${spanishSample}"` }
});
if (res1.ok && res1.stdout.includes(spanishSample)) {
  console.log("  ✓ Test 1: stdout en español capturado en UTF-8 perfecto sin mojibake:");
  console.log(`    ℹ Salida: "${res1.stdout}"`);
  passed++;
} else {
  console.error("  ✗ Test 1 falló (posible mojibake):", res1.stdout);
  failed++;
}

// Test 2: Salida stderr con caracteres especiales
const res2 = await router.execute({
  tool: "terminal",
  action: "run_command",
  args: { command: "Write-Error 'Operación fallida: parámetro inválido en la sesión.'" }
});
if (!res2.ok && (res2.stderr.includes("parámetro") || res2.stderr.includes("inválido") || res2.stderr.includes("fallida"))) {
  console.log("  ✓ Test 2: stderr con acentos capturado limpiamente sin caracteres corruptos:");
  console.log(`    ℹ Error: "${res2.stderr.slice(0, 80)}..."`);
  passed++;
} else {
  console.error("  ✗ Test 2 falló:", res2);
  failed++;
}

// Test 3: Lectura y escritura de archivos UTF-8 con caracteres complejos y emojis
const testFilePath = path.resolve("storage/cache/utf8_test_file.txt");
const complexContent = "Línea 1: Español (ñ, á, é, í, ó, ú)\nLínea 2: Símbolos técnicos: ∑, ∆, √, ∞, ≈, ≠\nLínea 3: Emojis: 🚀, 🧠, ⚡, 🛡️\n";

const writeRes = await router.execute({
  tool: "files",
  action: "write_file",
  args: { path: testFilePath, content: complexContent }
});
const readRes = await router.execute({
  tool: "files",
  action: "read_text_file",
  args: { path: testFilePath }
});

if (writeRes.ok && readRes.ok && readRes.content === complexContent) {
  console.log("  ✓ Test 3: Operaciones de filesystem (lectura/escritura) en UTF-8 100% íntegras.");
  passed++;
} else {
  console.error("  ✗ Test 3 falló:", readRes);
  failed++;
}

console.log(`\nResultado Suite 5: ${failed === 0 ? `PASS (${passed}/${passed})` : `FAIL (${passed} pass, ${failed} fail)`}`);
if (failed > 0) process.exit(1);
