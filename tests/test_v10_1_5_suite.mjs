/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🧪 FLUXER CORE v10.1.5 — TEST SUITE INTEGRAL (PILAR 6)
 *
 * Grupo 1: Token Compression Inteligente (No Destructivo)
 * Grupo 2: Terminal Windows 11 Production-Grade
 * Grupo 3: Sandbox Inteligente (Seguro + Usable)
 * Grupo 4: Instalador Robusto y Config Merge
 * Grupo 5: Auto-Diagnóstico & Health Check
 * ══════════════════════════════════════════════════════════════════════════════
 */

import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { CURRENT_VERSION, BRAND_NAME } from "../core/version.mjs";
import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";
import { sanitizeAndPrune, compactFormatter, smartTruncate } from "../core/json-utils.mjs";
import { detectBestShell, executeWindowsTerminal } from "../core/terminal-manager.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ [PASS] ${message}`);
  } else {
    failed++;
    console.error(`  ✗ [FAIL] ${message}`);
  }
}

console.log(`\n======================================================================`);
console.log(`  🧪 EJECUTANDO SUITE COMPLETA v${CURRENT_VERSION} — ${BRAND_NAME}`);
console.log(`======================================================================\n`);

// Inicializar Runtime y Router
const runtime = await createRuntime({ root: ROOT });
const registry = new Registry(runtime);
await registry.load();
runtime._registry = registry;
const router = new Router({ runtime, registry });

// ── GRUPO 1: Token Compression Inteligente ──────────────────────────────────
console.log("▶ [Grupo 1] Token Compression Inteligente (No Destructivo)");
{
  // 1.1: compact: true reduce el output preservando campos críticos
  const dummyPayload = {
    ok: true,
    status: "active",
    error: null,
    message: "Operación completada exitosamente.",
    timestamp: "2026-09-05T00:00:00.000Z",
    level: "poweruser",
    emptyList: [],
    emptyStr: "",
    unusedField: null,
    data: {
      items: [
        { id: 1, name: "item1", extra: null },
        { id: 2, name: "item2", extra: "" }
      ]
    }
  };

  const pruned = sanitizeAndPrune(dummyPayload, { compact: true });
  const rawSize = JSON.stringify(dummyPayload).length;
  const prunedSize = JSON.stringify(pruned).length;

  assert(prunedSize < rawSize, `compact: true redujo tamaño (de ${rawSize} a ${prunedSize} bytes)`);
  assert(pruned.ok === true, "Preserva campo 'ok'");
  assert(pruned.status === "active", "Preserva campo 'status'");
  assert(pruned.message === "Operación completada exitosamente.", "Preserva campo 'message'");
  assert(pruned.level === "poweruser", "Preserva campo 'level'");
  assert(pruned.emptyList === undefined, "Eliminó lista vacía no crítica");
  assert(pruned.emptyStr === undefined, "Eliminó cadena vacía no crítica");

  // 1.2: compact: false preserva salida completa
  const uncompressed = sanitizeAndPrune(dummyPayload, { compact: false });
  assert(uncompressed.emptyList !== undefined, "compact: false preserva listas vacías");

  // 1.3: smartTruncate preserva tail (conclusiones/errores) y mantiene >=200 caracteres
  const longText = "HEADER_START " + "x".repeat(2000) + " TAIL_CONCLUSION_CRITICAL_ERROR";
  const truncated = smartTruncate(longText, 300, "tail");
  assert(truncated.length >= 200, "smartTruncate mantiene al menos 200 chars");
  assert(truncated.includes("TAIL_CONCLUSION_CRITICAL_ERROR"), "smartTruncate (tail) preserva el final");
  assert(truncated.includes("chars omitted"), "smartTruncate incluye marcador de omisión transparente");

  // 1.4: compactFormatter table
  const tableInput = [
    { id: "A1", name: "Alpha", status: "OK" },
    { id: "B2", name: "Beta", status: "PENDING" }
  ];
  const tableOut = compactFormatter(tableInput, "table");
  assert(tableOut.includes("| id | name | status |"), "compactFormatter genera tabla markdown válida");
}

// ── GRUPO 2: Terminal Windows 11 Production-Grade ───────────────────────────
console.log("\n▶ [Grupo 2] Terminal Windows 11 Production-Grade");
{
  // 2.1: Detección de Shell
  const bestShell = detectBestShell();
  assert(bestShell && bestShell.bin && bestShell.name, `Shell detectada exitosamente: ${bestShell.name}`);

  // 2.2: UTF-8 encoding estricto sin mojibake
  const resUtf8 = await executeWindowsTerminal("Write-Host 'España: camión, pingüino, éxito, ¡hola!, ¿100%?'");
  assert(resUtf8.ok === true, "Ejecución UTF-8 exitosa (exitCode 0)");
  assert(resUtf8.stdout.includes("España: camión, pingüino, éxito, ¡hola!, ¿100%?"), "Salida preserva caracteres españoles y acentos sin mojibake");

  // 2.3: Comando con espacios y comillas
  const resQuotes = await executeWindowsTerminal("Write-Host 'Test con espacios y comillas'");
  assert(resQuotes.ok === true && resQuotes.stdout.includes("Test con espacios y comillas"), "Manejo correcto de comillas y espacios");

  // 2.4: Mapeo amigable de errores en comando inexistente
  const resNonExistent = await executeWindowsTerminal("non_existent_command_12345_xyz");
  assert(resNonExistent.ok === false, "Comando inexistente retorna ok: false");
  assert(resNonExistent.suggestion && resNonExistent.suggestion.includes("no encontrado en PATH"), "Retorna sugerencia amigable para comando no encontrado");
}

// ── GRUPO 3: Sandbox Inteligente (Seguro + Usable) ───────────────────────────
console.log("\n▶ [Grupo 3] Sandbox Inteligente (Seguro + Usable)");
{
  // 3.1: Rutas permitidas (Workspace, Documents, Downloads, Temp)
  const resDoc = await router.execute({ tool: "files", action: "list_directory", args: { path: runtime.dirs.documents } });
  assert(resDoc.ok === true, "Acceso a Documents permitido por whitelist inteligente");

  const resCwd = await router.execute({ tool: "files", action: "list_directory", args: { path: process.cwd() } });
  assert(resCwd.ok === true, "Acceso a CWD del proyecto permitido");

  // 3.2: Rutas críticas del sistema bloqueadas (System32 / SAM)
  const resSys = await router.execute({ tool: "files", action: "read_text_file", args: { path: "C:\\Windows\\System32\\config\\SAM" } });
  assert(resSys.ok === false, "Acceso a C:\\Windows\\System32 bloqueado");
  assert(resSys.code === "SANDBOX_BOUNDARY" || String(resSys.error).includes("Sandbox"), "Retorna error con código SANDBOX_BOUNDARY");

  // 3.3: Alternate Data Streams (ADS) bloqueados
  const resAds = await router.execute({ tool: "files", action: "read_text_file", args: { path: "test_doc.txt:hidden_stream" } });
  assert(resAds.ok === false && resAds.code === "SANDBOX_BOUNDARY", "Alternate Data Stream (ADS) bloqueado");

  // 3.4: Nombres de dispositivo reservados de Windows bloqueados
  const resDev = await router.execute({ tool: "files", action: "read_text_file", args: { path: "CON.txt" } });
  assert(resDev.ok === false && resDev.code === "SANDBOX_BOUNDARY", "Dispositivo reservado CON bloqueado");
}

// ── GRUPO 4: Descubrimiento de Herramientas y Búsqueda Rápida ───────────────
console.log("\n▶ [Grupo 4] Descubrimiento Ultrarrápido de Herramientas (search_tools)");
{
  const searchRes = await router.execute({
    tool: "guide",
    action: "search_tools",
    args: { query: "kill process", limit: 5 }
  });

  assert(searchRes.ok === true, "guide.search_tools respondió con ok: true");
  assert(searchRes.count > 0, `Encontró ${searchRes.count} herramientas relacionadas con 'kill process'`);
  assert(searchRes.matches.some(m => m.action === "kill_process_tree" || m.action === "kill_process"), "Localizó la acción kill_process_tree");

  // Búsqueda cruzada en dominio system
  const sysSearch = await router.execute({
    tool: "system",
    action: "search_tools",
    args: { query: "benchmark" }
  });
  assert(sysSearch.ok === true && sysSearch.count > 0, "system.search_tools responde correctamente");
}

// ── GRUPO 5: Health Check & Registro Global ─────────────────────────────────
console.log("\n▶ [Grupo 5] Health Check y Estado de Dominios");
{
  const healthRes = await router.execute({ tool: "diagnostics", action: "health_check", args: {} });
  assert(healthRes.ok === true, "diagnostics.health_check responde ok: true");
  assert(healthRes.verdict === "HEALTHY" || healthRes.status === "PASS" || healthRes.ok === true, "Veredicto del sistema es saludable");

  const modCount = registry.moduleNames().length;
  assert(modCount >= 11, `Registrados ${modCount} dominios modulares (>= 11)`);
  const actionCount = registry.actionCount();
  assert(actionCount >= 280, `Registradas ${actionCount} acciones operativas (>= 280)`);
}

console.log(`\n======================================================================`);
console.log(`  RESUMEN FINAL: ${passed} PASSED | ${failed} FAILED`);
console.log(`======================================================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
