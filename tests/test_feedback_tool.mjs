/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🧪 TEST: DEVELOPER TOOL — SUBMIT_FEEDBACK, LIST_FEEDBACKS & GET_FEEDBACK
 * ══════════════════════════════════════════════════════════════════════════════
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";
import { getStorageStructure } from "../core/storage-paths.mjs";

console.log("══════════════════════════════════════════════════════════════════");
console.log("🧪 PRUEBA DE LA HERRAMIENTA FEEDBACK (DEVELOPER DOMAIN)");
console.log("══════════════════════════════════════════════════════════════════\n");

async function main() {
  // Cargar token de Discord local si existe para probar el envío por MD desde Nexus
  if (!process.env.DISCORD_TOKEN) {
    try {
      const claudeConfigPath = path.join(process.env.APPDATA || "", "Claude", "claude_desktop_config.json");
      if (existsSync(claudeConfigPath)) {
        const cfg = JSON.parse(await fs.readFile(claudeConfigPath, "utf8"));
        if (cfg.mcpServers?.discord?.env?.DISCORD_TOKEN) {
          process.env.DISCORD_TOKEN = cfg.mcpServers.discord.env.DISCORD_TOKEN;
        }
      }
    } catch {}
  }

  const runtime = await createRuntime({ root: process.cwd() });
  const registry = new Registry(runtime);
  await registry.load();
  const router = new Router({ runtime, registry });

  const storage = getStorageStructure(runtime.root);

  // 1. Imagen de prueba en Base64 (PNG 1x1 transparente)
  const sampleBase64Png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  // 2. Ejecutar submit_feedback con todas las opciones
  console.log("1. Enviando reporte de bug con screenshot y logs...");
  const res = await router.execute("developer", "submit_feedback", {
    type: "bug_report",
    title: "Prueba automatizada de feedback con imagen",
    description: "Este es un reporte de prueba generado por el test de integración de Aero Fluxer X.",
    steps_to_reproduce: "1. Ejecutar test\n2. Validar entrega en Discord y disco local\n3. Confirmar que el autor recibe el reporte",
    expected_behavior: "El feedback debe guardarse localmente y entregarse al webhook del autor.",
    actual_behavior: "Comportamiento nominal verificado en tiempo de prueba.",
    severity: "high",
    screenshot: sampleBase64Png,
    attach_logs: true,
    attach_system_info: true,
  });

  console.log("   Resultado:", res);
  assert.equal(res.ok, true, "submit_feedback debe responder ok: true");
  assert.ok(res.feedbackId, "Debe generar un feedbackId");
  assert.equal(res.storedLocally, true, "Debe almacenarse localmente");
  assert.equal(res.attachmentSaved, true, "Debe guardar la captura adjunta");
  assert.ok(existsSync(res.feedbackFile), "El archivo JSON de feedback debe existir en disco");

  console.log(`   ✓ Feedback guardado en: ${res.feedbackFile}`);
  console.log(`   ✓ DM por Nexus entregado: ${res.dmDelivered} (${res.dmDetails})`);
  console.log(`   ✓ Webhook entregado: ${res.webhookDelivered}`);

  // 3. Probar list_feedbacks
  console.log("\n2. Probando list_feedbacks...");
  const listRes = await router.execute("developer", "list_feedbacks", { limit: 10 });
  assert.equal(listRes.ok, true, "list_feedbacks debe responder ok: true");
  assert.ok(listRes.count >= 1, "Debe contener al menos 1 feedback");
  const found = listRes.feedbacks.find((f) => f.id === res.feedbackId);
  assert.ok(found, "El feedback recién creado debe aparecer en la lista");
  console.log(`   ✓ list_feedbacks retornó ${listRes.count} feedbacks registrados.`);

  // 4. Probar get_feedback
  console.log("\n3. Probando get_feedback con el ID generado...");
  const getRes = await router.execute("developer", "get_feedback", { feedbackId: res.feedbackId });
  assert.equal(getRes.ok, true, "get_feedback debe responder ok: true");
  assert.equal(getRes.feedback.id, res.feedbackId);
  assert.equal(getRes.feedback.type, "bug_report");
  assert.equal(getRes.feedback.severity, "high");
  assert.ok(getRes.feedback.systemInfo, "Debe contener systemInfo");
  assert.ok(getRes.feedback.attachment?.path, "Debe contener la ruta del archivo adjunto");
  assert.ok(existsSync(getRes.feedback.attachment.path), "El archivo de imagen adjunto debe existir");

  console.log(`   ✓ get_feedback verificado. Imagen en: ${getRes.feedback.attachment.path}`);

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("🎉 TODAS LAS PRUEBAS DE FEEDBACK PASARON CON ÉXITO (100%)");
  console.log("══════════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("❌ Error en prueba de feedback:", err);
  process.exit(1);
});
