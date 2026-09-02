import { createRuntime } from "../core/runtime.mjs";
import { MemoryStore } from "../core/memory.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

console.log("==================================================================");
console.log("🛡️ CHEQUEO INTERNO DE ALTA INTENSIDAD: SQLITE, ESTRÉS Y RENDIMIENTO");
console.log("==================================================================\n");

let pass = 0;
let fail = 0;

function assertCheck(label, cond, detail = "") {
  if (cond) {
    console.log(`  🟢 PASS: ${label}`);
    pass++;
  } else {
    console.error(`  🔴 FAIL: ${label}`, detail);
    fail++;
  }
}

// 1. Inicializar Runtime y MemoryStore
const runtime = await createRuntime({ root: ".", version: "9.0.0", brand: "Aeron Fluxer X" });
const memory = runtime.memory;

console.log("── 1. Integridad Estructural y Pragmas de SQLite ──");

const integrityResult = memory.db.prepare("PRAGMA integrity_check").get();
assertCheck("PRAGMA integrity_check == 'ok'", integrityResult.integrity_check === "ok", JSON.stringify(integrityResult));

const fkResult = memory.db.prepare("PRAGMA foreign_key_check").all();
assertCheck("PRAGMA foreign_key_check (0 violaciones)", fkResult.length === 0, JSON.stringify(fkResult));

const journalResult = memory.db.prepare("PRAGMA journal_mode").get();
assertCheck("PRAGMA journal_mode == 'wal'", String(journalResult.journal_mode).toLowerCase() === "wal", JSON.stringify(journalResult));

const syncResult = memory.db.prepare("PRAGMA synchronous").get();
assertCheck("PRAGMA synchronous == 1 (NORMAL)", Number(syncResult.synchronous) === 1, JSON.stringify(syncResult));

const pageCount = memory.db.prepare("PRAGMA page_count").get().page_count;
const freelistCount = memory.db.prepare("PRAGMA freelist_count").get().freelist_count;
console.log(`    ℹ Páginas totales: ${pageCount}, Páginas libres en freelist: ${freelistCount}`);


console.log("\n── 2. Prueba de Estrés de Concurrencia de Escritura (500 operaciones masivas) ──");

const startStress = performance.now();
const writePromises = [];

for (let i = 0; i < 250; i++) {
  writePromises.push(Promise.resolve().then(() => {
    memory.set("stress_test", `key_${i}`, `value_${i}_${Date.now()}`);
    memory.recordCall({
      tool: "internal_stress",
      action: "write",
      ok: true,
      durationMs: i % 10,
      client: { name: "deep_checker" },
      traceId: `trace_${i}`
    });
  }));
}

for (let i = 0; i < 250; i++) {
  writePromises.push(Promise.resolve().then(() => {
    memory.grantPermission({
      level: "user",
      scope: `stress_scope_${i}`,
      reason: "Prueba de estrés masiva"
    });
  }));
}

let stressError = null;
try {
  await Promise.all(writePromises);
} catch (e) {
  stressError = e.message;
}

const stressDuration = Math.round(performance.now() - startStress);
assertCheck("500 escrituras concurrentes sin bloqueo (SQLITE_BUSY)", stressError === null, stressError);
console.log(`    ℹ Tiempo de ejecución de 500 operaciones: ${stressDuration} ms (${(stressDuration / 500).toFixed(2)} ms/op)`);


console.log("\n── 3. Lectura e Integridad de Consistencia Tras Estrés ──");

let readMatch = true;
for (let i = 0; i < 50; i++) {
  const val = memory.get("stress_test", `key_${i}`);
  if (!val || !val.startsWith(`value_${i}_`)) {
    readMatch = false;
    break;
  }
}
assertCheck("Lectura consistente de valores tras ráfaga de escrituras", readMatch);

const historyCount = memory.db.prepare("SELECT COUNT(*) as count FROM history WHERE tool='internal_stress'").get().count;
assertCheck("Registros de historial persistidos correctamente", historyCount >= 250, `Encontrados: ${historyCount}`);


console.log("\n── 4. Resiliencia de Reapertura y Garbage Collection ──");

// Simular reinicio / reapertura de base de datos
const dbFile = memory.file;
const legacyFile = memory.legacyFile;
memory.close();

const reloadedMemory = new MemoryStore({ file: dbFile, legacyFile });
let reloadOk = true;
try {
  await reloadedMemory.load();
} catch (e) {
  reloadOk = false;
  console.error(e);
}
assertCheck("Reapertura e inicialización limpia de SQLite tras cierre", reloadOk);

// Limpiar datos sintéticos de estrés
reloadedMemory.db.exec("DELETE FROM kv WHERE section='stress_test'");
reloadedMemory.db.exec("DELETE FROM history WHERE tool='internal_stress'");
reloadedMemory.db.exec("DELETE FROM permissions WHERE scope LIKE 'stress_scope_%'");
reloadedMemory.cleanup();
reloadedMemory.close();

// Volver a cargar el runtime memory
await runtime.memory.load();


console.log("\n── 5. Análisis de Fugas de Memoria e Integridad de Heap ──");

const memBefore = process.memoryUsage();
// Ejecutar 500 consultas de lectura en la nueva conexión de runtime
for (let i = 0; i < 500; i++) {
  runtime.memory.get("config", "legacy_json_migrated");
  runtime.memory.get("stress_test");
}
const memAfter = process.memoryUsage();
const heapUsedDiffMB = ((memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024)).toFixed(2);
const rssDiffMB = ((memAfter.rss - memBefore.rss) / (1024 * 1024)).toFixed(2);

console.log(`    ℹ Heap final: ${(memAfter.heapUsed / (1024 * 1024)).toFixed(2)} MB (Delta: ${heapUsedDiffMB} MB)`);
console.log(`    ℹ RSS final: ${(memAfter.rss / (1024 * 1024)).toFixed(2)} MB (Delta: ${rssDiffMB} MB)`);
assertCheck("Uso de Heap estable (< 120 MB)", memAfter.heapUsed / (1024 * 1024) < 120, `${(memAfter.heapUsed / (1024 * 1024)).toFixed(2)} MB`);


console.log("\n==================================================================");
console.log(`📊 RESULTADO FINAL DEL CHEQUEO INTERNO: ${fail === 0 ? "PASADO CON ÉXITO" : "CON FALLOS"}`);
console.log(`  🟢 PASS: ${pass}`);
console.log(`  🔴 FAIL: ${fail}`);
console.log("==================================================================");

if (fail > 0) process.exit(1);
