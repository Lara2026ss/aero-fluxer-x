/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🧪 TEST: FEEDBACK EXTERNAL GATEWAY ARCHITECTURE (RENDER + FIREBASE)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Verifica:
 * 1. Desacoplamiento total: CERO transportes externos privados, CERO tokens.
 * 2. Despacho directo al Gateway HTTP externo (Render).
 * 3. Respuestas compactas: { status: "received", id: "AFX-FB-..." }.
 * 4. Deduplicación inteligente: reportes idénticos devuelven { status: "duplicate" }.
 * 5. Bloqueo preventivo de secretos: credenciales gsk_/Bearer bloqueadas localmente.
 * 6. Sanitización estricta de rutas de usuario (C:\Users\... -> ~).
 * 7. Control de tasa (Rate Limiting) en el Gateway.
 * 8. Cola segura fuera de línea (Offline Outbox) ante indisponibilidad del gateway.
 * 9. Herramientas complementarias: feedback_guide, check_update, update_info.
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import http from "node:http";

import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";
import { getStorageStructure } from "../core/storage-paths.mjs";
import { server as gatewayServer, firebaseStore, dedupEngine, rateLimiter } from "../gateway/server.mjs";

console.log("══════════════════════════════════════════════════════════════════");
console.log("🧪 PRUEBA DE ARQUITECTURA: FEEDBACK GATEWAY EXTERNO");
console.log("══════════════════════════════════════════════════════════════════\n");

// 1. Aislamiento estricto: Eliminar cualquier variable de transportes externos no autorizados
for (const key of Object.keys(process.env)) {
  if (["DISC", "NEX", "WEBHOOK", "BOT"].some((p) => key.toUpperCase().startsWith(p))) {
    delete process.env[key];
  }
}

const TEST_PORT = 38765;
process.env.AERON_FEEDBACK_ENDPOINT = `http://127.0.0.1:${TEST_PORT}/api/v1/feedback`;

async function main() {
  // 1. Iniciar servidor Gateway local en puerto de pruebas
  console.log("1. Levantando Feedback Gateway en puerto de prueba...");
  await new Promise((resolve) => gatewayServer.listen(TEST_PORT, resolve));
  console.log(`   ✓ Gateway activo en http://127.0.0.1:${TEST_PORT}`);

  // 2. Inicializar Runtime y Router de Aero Fluxer X
  const runtime = await createRuntime({ root: process.cwd() });
  const registry = new Registry(runtime);
  await registry.load();
  const router = new Router({ runtime, registry });

  // 3. Test de feedback_guide
  console.log("\n2. Probando feedback_guide...");
  const guideRes = await router.execute("developer", "feedback_guide", {});
  assert.equal(guideRes.ok, true);
  assert.ok(Array.isArray(guideRes.types));
  assert.ok(guideRes.required_fields.includes("title"));
  console.log("   ✓ feedback_guide responde correctamente.");

  // 4. Test de Envío Normal de Feedback
  console.log("\n3. Enviando reporte válido de prueba (Bug Report)...");
  const res1 = await router.execute("developer", "submit_feedback", {
    type: "bug_report",
    title: "Database index check failed",
    description: "Missing index on column tenant_id during concurrent queries.",
    tool: "database.open",
    severity: "medium",
  });

  console.log("   Respuesta del MCP:", res1);
  assert.equal(res1.ok, true);
  assert.equal(res1.status, "received");
  assert.match(res1.id, /^AFX-FB-[A-Z0-9]+$/);
  assert.equal(res1.dmDelivered, undefined, "No debe exponer dmDelivered");
  assert.equal(res1.webhookDelivered, undefined, "No debe exponer webhookDelivered");
  console.log(`   ✓ Reporte recibido con ID canónico: ${res1.id}`);

  // 5. Test de Deduplicación (Mismo reporte enviado consecutivamente)
  console.log("\n4. Probando deduplicación inteligente ante reporte idéntico...");
  const resDuplicate = await router.execute("developer", "submit_feedback", {
    type: "bug_report",
    title: "Database index check failed",
    description: "Missing index on column tenant_id during concurrent queries.",
    tool: "database.open",
    severity: "medium",
  });

  console.log("   Respuesta de deduplicación:", resDuplicate);
  assert.equal(resDuplicate.status, "duplicate");
  assert.equal(resDuplicate.id, res1.id, "Debe asociar al ID canónico previo");
  console.log("   ✓ Deduplicación exitosa: Cero spam al mantenedor.");

  // 6. Test de Bloqueo Preventivo de Secretos (gsk_ / Bearer)
  console.log("\n5. Probando bloqueo preventivo de credenciales (Cero Secretos)...");
  const resSecret = await router.execute("developer", "submit_feedback", {
    type: "bug_report",
    title: "Error de autenticación",
    description: "Falló la clave gsk_abcdef12345678901234567890 en la llamada externa.",
  });

  console.log("   Respuesta con secreto:", resSecret);
  assert.equal(resSecret.status, "blocked");
  assert.equal(resSecret.code, "BLOCKED_SENSITIVE_DATA");
  console.log("   ✓ Bloqueo preventivo de secretos: PASS (No enviado a la red).");

  // 7. Test de Sanitización de Rutas Privadas
  console.log("\n6. Probando sanitización de rutas personales...");
  const resPath = await router.execute("developer", "submit_feedback", {
    type: "general_feedback",
    title: "Prueba de ruta personal",
    description: "Ruta local encontrada en C:\\Users\\mauri\\Documents\\secret_doc.txt para prueba.",
  });

  assert.equal(resPath.status, "received");
  // Verificar en Firebase store que la ruta fue sanitizada
  const storedItem = firebaseStore.localFallback.get(resPath.id);
  assert.ok(storedItem);
  assert.ok(!storedItem.description.includes("C:\\Users\\mauri"), "La ruta personal debe haber sido reemplazada por ~");
  console.log("   ✓ Sanitización de rutas privadas: PASS (Cero rutas del autor enviadas).");

  // 8. Test de Control de Tasa (Rate Limiting)
  console.log("\n7. Probando control de tasa (Rate Limiting)...");
  rateLimiter.maxRequests = 2; // Forzar límite bajo para la prueba
  const resRate = await router.execute("developer", "submit_feedback", {
    type: "feature_request",
    title: "Solicitud excedente",
    description: "Intento que excede el límite de peticiones por hora.",
  });

  console.log("   Respuesta de rate limit:", resRate);
  assert.equal(resRate.status, "rate_limited");
  assert.equal(resRate.code, "RATE_LIMITED");
  console.log("   ✓ Rate Limiting en Gateway: PASS.");

  // 9. Test de Modo Fuera de Línea (Offline Queue / Outbox)
  console.log("\n8. Probando cola fuera de línea ante Gateway no disponible...");
  await new Promise((resolve) => gatewayServer.close(resolve));
  console.log("   (Gateway apagado temporalmente)");

  const storage = getStorageStructure(runtime.root);
  const resOffline = await router.execute("developer", "submit_feedback", {
    type: "bug_report",
    title: "Falla reportada sin conexión",
    description: "El reporte debe guardarse de forma segura en la outbox local.",
  });

  console.log("   Respuesta offline:", resOffline);
  assert.equal(resOffline.status, "queued");
  assert.match(resOffline.id, /^AFX-FB-[A-Z0-9]+$/);
  const queuedFile = path.join(storage.feedbackOutboxDir, `${resOffline.id}.json`);
  assert.ok(existsSync(queuedFile), "El archivo encolado debe existir en outbox");
  console.log(`   ✓ Outbox local verificado: ${queuedFile}`);

  // 10. Test de Herramientas de Actualización en developer
  console.log("\n9. Probando herramientas de actualización (check_update, update_info)...");
  const checkRes = await router.execute("developer", "check_update", {});
  assert.equal(checkRes.ok, true);
  assert.ok(checkRes.current);

  const infoRes = await router.execute("developer", "update_info", {});
  assert.equal(infoRes.ok, true);
  assert.ok(infoRes.version);
  console.log(`   ✓ check_update & update_info OK (v${checkRes.current}).`);

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("🎉 TODAS LAS PRUEBAS DE ARQUITECTURA DEL FEEDBACK GATEWAY PASARON");
  console.log("══════════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("❌ Error en prueba de Gateway:", err);
  process.exit(1);
});
