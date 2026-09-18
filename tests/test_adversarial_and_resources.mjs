import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";
import { FirstRunBootstrap } from "../core/bootstrap.mjs";
import { CURRENT_VERSION, BRAND_NAME } from "../core/version.mjs";

console.log("══════════════════════════════════════════════════════════════════════");
console.log("🥊 BATERÍA ADVERSARIAL Y MEDICIÓN DE RECURSOS — FLUXER X MCP");
console.log("══════════════════════════════════════════════════════════════════════\n");

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FALLO: ${message}`);
    failedTests++;
  } else {
    console.log(`  ✓ [PASS] ${message}`);
    passedTests++;
  }
}

const root = process.cwd();
const sandboxDir = path.join(root, "storage", "cache", "adversarial_sandbox");
await fs.mkdir(sandboxDir, { recursive: true });

// ─── TEST 1: Llamada Temprana / Encolado durante Bootstrap ───
console.log("\n[1/6] Test Adversarial: Llamada Concurrente en Estado INITIALIZING...");
const testBootstrap = new FirstRunBootstrap({ root: sandboxDir, version: CURRENT_VERSION, brand: BRAND_NAME });
assert(testBootstrap.status === "UNINITIALIZED", "Estado inicial es UNINITIALIZED");

let earlyCallResolved = false;
// Simular llamada de la IA que entra antes de que el bootstrap termine
const pendingCall = testBootstrap.waitForReady(5000).then(() => {
  earlyCallResolved = true;
});

// Arrancar bootstrap
await testBootstrap.initialize();
await pendingCall;
assert(earlyCallResolved === true, "Llamada concurrente esperó y se resolvió exitosamente al alcanzar READY");
assert(testBootstrap.isReady === true, "Bootstrap reporta isReady: true");
assert(testBootstrap.status === "READY", "Estado final es READY");

// ─── TEST 2: Resiliencia ante Archivo state.json Corrupto ───
console.log("\n[2/6] Test Adversarial: Recuperación ante state.json Corrupto...");
const corruptStateDir = path.join(sandboxDir, "corrupt_test");
const corruptStateFile = path.join(corruptStateDir, "state", "state.json");
await fs.mkdir(path.dirname(corruptStateFile), { recursive: true });
await fs.writeFile(corruptStateFile, "{ esto_es_un_json_invalido_y_mutilado ::: ", "utf8");

const corruptBootstrap = new FirstRunBootstrap({ root: corruptStateDir });
const initResult = await corruptBootstrap.initialize();
assert(initResult.hostId !== null, "Bootstrap detectó JSON corrupto y auto-recuperó generando nuevo hostId válido");
assert(corruptBootstrap.isReady === true, "Sistema no se cayó (crash) y quedó en estado READY");

// ─── TEST 3: Persistencia y Estabilidad de Host ID ante Renombrado de PC ───
console.log("\n[3/6] Test de Invariante: Estabilidad de hostId y Detección de Hostname...");
const firstHostId = corruptBootstrap.hostId;
// Simular segundo inicio en la misma máquina
const secondBootstrap = new FirstRunBootstrap({ root: corruptStateDir });
const secondInit = await secondBootstrap.initialize();
assert(secondInit.firstRun === false, "Segundo arranque detectó que ya estaba inicializado (firstRun: false)");
assert(secondBootstrap.hostId === firstHostId, `hostId se mantuvo estrictamente estable (${firstHostId})`);
assert(secondInit.durationMs < 10, `Tiempo de carga de estado fue de ${secondInit.durationMs}ms (< 10ms objetivo)`);

// ─── TEST 4: Comportamiento Offline y Rechazo Explícito sin Falsos PASS ───
console.log("\n[4/6] Test de Red: Comportamiento Offline y Rechazo Explícito...");
const runtime = await createRuntime({ root, version: CURRENT_VERSION, brand: BRAND_NAME });
const registry = new Registry(runtime);
await registry.load();
const router = new Router({ runtime, registry });

// Puerto cerrado en localhost para probar fallo de red real
const offlineRes = await router.execute({ tool: "network", action: "test_connection", args: { host: "127.0.0.1", port: 59999 } });
assert(offlineRes.ok === true && offlineRes.reachable === false, "Puerto inalcanzable reporta reachable: false explícito sin simular éxito");

// Consulta a host inexistente
const dnsRes = await router.execute({ tool: "network", action: "dns_query", args: { hostname: "non_existent_domain_xyz_12345.local" } });
assert(dnsRes.ok === false || dnsRes.resolved === false || dnsRes.error, "DNS fallido rechaza explícitamente sin simular resolución");

// ─── TEST 5: Rechazo Controlado de Parámetros Inválidos (Edge Cases) ───
console.log("\n[5/6] Test Adversarial: Rechazo de Argumentos Malformados / Inválidos...");
try {
  const badRes = await router.execute({ tool: "files", action: "read_text_file", args: { path: "C:\\Ruta_Completamente_Inexistente_9999\\archivo.txt" } });
  assert(badRes.ok === false, "Ruta inexistente devuelve ok: false");
} catch (e) {
  assert(e.message.includes("no existe") || e.code === "NOT_FOUND", "Ruta inexistente arroja error NOT_FOUND");
}

// ─── TEST 6: Medición Empírica de Recursos (RAM / CPU / Startup) ───
console.log("\n[6/6] Medición de Consumo de Recursos en Reposo...");
const memUsage = process.memoryUsage();
const rssMb = Math.round((memUsage.rss / 1024 / 1024) * 100) / 100;
const heapMb = Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100;
console.log(`  • RAM RSS del proceso Node: ${rssMb} MB`);
console.log(`  • Heap Used de memoria JS:  ${heapMb} MB`);
assert(rssMb < 150, `Consumo de RAM en reposo dentro de norma técnica (${rssMb} MB < 150 MB)`);

console.log("\n══════════════════════════════════════════════════════════════════════");
console.log(`RESULTADO PRUEBAS ADVERSARIALES: ${passedTests} PASARON | ${failedTests} FALLARON`);
console.log("══════════════════════════════════════════════════════════════════════\n");

if (failedTests > 0) process.exit(1);
process.exit(0);
