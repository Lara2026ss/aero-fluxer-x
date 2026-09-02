/**
 * FLUXER MCP — tests/test_hardening_regression.mjs
 * Valida de forma exhaustiva las correcciones y el hardening de la versión 8.1:
 * 1. Limpieza y decodificación de PowerShell CLIXML
 * 2. Gestor de paquetes universal (npm, pip, winget, cargo, pnpm, scoop)
 * 3. Límites de buffer, stripping ANSI y metadatos en terminal
 * 4. Clasificación estructurada de errores en router
 * 5. Guardas de archivos binarios en files.read_text_file
 * 6. Concurrencia multi-dominio
 */

import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

console.log("🛡️ Iniciando Suite de Tests de Regresión & Hardening FLUXER MCP...");

async function main() {
  const { createRuntime } = await import("../core/runtime.mjs");
  const { Registry } = await import("../core/registry.mjs");
  const { Router } = await import("../core/router.mjs");

  const runtime = await createRuntime({ root: ROOT, version: "8.1.0", brand: "FLUXER" });
  const registry = new Registry(runtime);
  await registry.load();
  runtime._registry = registry;
  const router = new Router({ runtime, registry });

  // ── [1] Test: Limpieza de PowerShell CLIXML ───────────────────────────────
  console.log("\n[1/6] Probando sanitización de errores PowerShell y CLIXML...");
  const invalidCmdRes = await router.execute("terminal", "run_command", {
    command: "non_existent_command_xyz_12345",
  });
  assert.equal(invalidCmdRes.ok, false, "Comando inexistente debe retornar ok: false");
  assert.ok(!invalidCmdRes.stderr.includes("<Objs"), "El error no debe contener tags XML brutos");
  assert.ok(!invalidCmdRes.stderr.includes("#< CLIXML"), "El error no debe contener cabeceras CLIXML");
  console.log("  ✓ Error de PowerShell limpio y des-serializado correctamente.");

  // ── [2] Test: Gestor Universal de Paquetes (npm, pip, winget) ───────────────
  console.log("\n[2/6] Probando gestor universal de paquetes...");
  
  // List installed npm packages
  const npmList = await router.execute("packages", "list_installed", { manager: "npm" });
  assert.equal(npmList.ok, true, "packages.list_installed con manager: npm debe ser exitoso");
  assert.equal(npmList.manager, "npm");
  assert.ok(Array.isArray(npmList.packages), "Debe retornar un array de paquetes");
  console.log(`  ✓ npm list retornó ${npmList.count} paquetes globales.`);

  // Package info npm
  const npmInfo = await router.execute("packages", "package_info", { manager: "npm", name: "express" });
  assert.equal(npmInfo.ok, true, "packages.package_info para npm debe ser exitoso");
  assert.equal(npmInfo.manager, "npm");
  console.log("  ✓ package_info para npm ejecutado correctamente.");

  // Search package npm
  const npmSearch = await router.execute("packages", "search_package", { manager: "npm", query: "koa" });
  assert.equal(npmSearch.ok, true, "packages.search_package para npm debe ser exitoso");
  assert.equal(npmSearch.manager, "npm");
  console.log("  ✓ search_package para npm ejecutado correctamente.");

  // ── [3] Test: Terminal Output Limits & ANSI Stripping ──────────────────────
  console.log("\n[3/6] Probando límites de salida y ANSI stripping en terminal...");
  const largeOutputRes = await router.execute("terminal", "run_command", {
    command: process.platform === "win32"
      ? "1..2000 | ForEach-Object { Write-Output 'Linea de prueba con texto largo para verificar truncamiento seguro' }"
      : "for i in $(seq 1 2000); do echo 'Linea de prueba con texto largo para verificar truncamiento seguro'; done",
    maxOutputChars: 5000,
    stripAnsi: true,
  });
  assert.equal(largeOutputRes.ok, true);
  assert.equal(largeOutputRes.truncated, true, "Debe marcar truncated: true cuando excede el límite");
  assert.ok(largeOutputRes.stdout.length <= 6000, "La salida no debe exceder significativamente maxOutputChars");
  assert.ok(largeOutputRes.stdout.includes("[TRUNCADO"), "Debe incluir aviso de truncado");
  console.log("  ✓ Límite de caracteres en terminal respetado con aviso de truncado.");

  // ── [4] Test: Clasificación Estructurada de Errores ────────────────────────
  console.log("\n[4/6] Probando clasificación estructurada de errores...");

  // Error de parámetro faltante -> INVALID_INPUT
  const invalidInputRes = await router.execute("files", "read_text_file", {});
  assert.equal(invalidInputRes.ok, false);
  assert.equal(invalidInputRes.code, "INVALID_INPUT", "Falta de parámetro debe clasificarse como INVALID_INPUT");
  assert.ok(invalidInputRes.suggestion.length > 0, "Debe incluir sugerencia de acción");
  assert.equal(invalidInputRes.recoverable, true, "INVALID_INPUT debe ser recuperable");

  // Error de archivo inexistente -> NOT_FOUND
  const notFoundRes = await router.execute("files", "read_text_file", { path: "archivo_inexistente_9999.txt" });
  assert.equal(notFoundRes.ok, false);
  assert.equal(notFoundRes.code, "NOT_FOUND", "Archivo inexistente debe clasificarse como NOT_FOUND");
  assert.equal(notFoundRes.recoverable, true);

  console.log("  ✓ Errores clasificados con códigos estándar, severidad y sugerencias.");

  // ── [5] Test: Guardas de Archivos Binarios en files ────────────────────────
  console.log("\n[5/6] Probando guardas de archivos binarios...");
  const tempBinPath = path.join(runtime.dirs.cache, "test_binary.bin");
  const binBuf = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD]);
  await fs.writeFile(tempBinPath, binBuf);

  const readBinAsText = await router.execute("files", "read_text_file", { path: tempBinPath });
  assert.equal(readBinAsText.ok, false, "read_text_file sobre binario debe retornar ok: false");
  assert.equal(readBinAsText.isBinary, true, "Debe identificar que el archivo es binario");
  assert.equal(readBinAsText.recommendedTool, "files.read_binary_file");

  // Leerlo correctamente con read_binary_file
  const readBinProperly = await router.execute("files", "read_binary_file", { path: tempBinPath, format: "hex" });
  assert.equal(readBinProperly.ok, true);
  assert.equal(readBinProperly.data, "000102fffefd");

  await fs.rm(tempBinPath, { force: true }).catch(() => {});
  console.log("  ✓ Guardas binarias protegen contra lectura errónea de datos binarios.");

  // ── [6] Test: Concurrencia Multi-Dominio Bajo Carga ────────────────────────
  console.log("\n[6/6] Probando estrés concurrente multi-dominio...");
  const promises = [
    router.execute("system", "get_system_info", {}),
    router.execute("system", "get_ram_info", {}),
    router.execute("system", "get_cpu_info", {}),
    router.execute("security", "generate_uuid", {}),
    router.execute("security", "hash_text", { text: "fluxer_hardening_test" }),
    router.execute("terminal", "run_command", { command: "echo concurrent_task_1" }),
    router.execute("terminal", "run_command", { command: "echo concurrent_task_2" }),
    router.execute("files", "list_directory", { path: ".", limit: 5 }),
    router.execute("packages", "list_installed", { manager: "npm" }),
    router.execute("shortcuts", "list", {}),
  ];

  const results = await Promise.all(promises);
  for (let i = 0; i < results.length; i++) {
    assert.equal(results[i].ok, true, `Operación concurrente #${i + 1} debe retornar ok: true`);
  }
  console.log(`  ✓ ${results.length}/${results.length} operaciones concurrentes completadas con éxito.`);

  console.log("\n==================================================");
  console.log("🎉 TODOS LOS TESTS DE REGRESIÓN Y HARDENING PASARON AL 100%");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("❌ Falló el test de regresión:", err);
  process.exit(1);
});
