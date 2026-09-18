#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🌐 ORBIT GOOGLE X — scripts/manage_feedbacks.mjs
 * Sistema de Gestión, Etiquetado y Limpieza de Feedbacks en Firebase RTDB
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { googleClients } from "../core/google-clients.mjs";

const args = process.argv.slice(2);

function printHelp() {
  console.log(`
Uso de manage_feedbacks.mjs:
  node scripts/manage_feedbacks.mjs --list [--status <hecho|en_proceso|ignorado|recibido>] [--limit <n>]
  node scripts/manage_feedbacks.mjs --set-status <hecho|en_proceso|ignorado|recibido> --id <ID> [--notes "<notas>"] [--version "<ver>"]
  node scripts/manage_feedbacks.mjs --delete --id <ID>
  node scripts/manage_feedbacks.mjs --cleanup [--status <hecho|ignorado>]
  `);
}

async function main() {
  const db = googleClients.getDatabase();
  const basePath = "fluxer_feedbacks";

  if (args.includes("--help") || args.length === 0) {
    printHelp();
    return;
  }

  // 1. Listar Feedbacks
  if (args.includes("--list")) {
    const statusIdx = args.indexOf("--status");
    const filterStatus = statusIdx !== -1 ? args[statusIdx + 1] : null;
    const limitIdx = args.indexOf("--limit");
    const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : 50;

    console.log(`\n📋 Consultando feedbacks en Firebase RTDB (${basePath}/items)...`);
    const snap = await db.ref(`${basePath}/items`).once("value");
    if (!snap.exists()) {
      console.log("  No se encontraron feedbacks en la base de datos.");
      return;
    }

    let items = Object.values(snap.val() || {});
    if (filterStatus) {
      items = items.filter((it) => (it.status || "recibido").toLowerCase() === filterStatus.toLowerCase());
    }

    items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    items = items.slice(0, limit);

    console.log(`  Total listados: ${items.length}\n`);
    for (const item of items) {
      const statusTag = (item.status || "recibido").toUpperCase();
      const badge =
        statusTag === "HECHO" ? "✅ [HECHO]" :
        statusTag === "EN_PROCESO" ? "⏳ [EN PROCESO]" :
        statusTag === "IGNORADO" ? "⚪ [IGNORADO]" : "📥 [RECIBIDO]";

      console.log(`${badge} ${item.id} | ${item.type || "feedback"} | Severidad: ${item.severity || "medium"}`);
      console.log(`   Título: ${item.title}`);
      console.log(`   Fecha: ${item.created_at || "N/A"}`);
      if (item.resolved_at) {
        console.log(`   Resuelto en: ${item.resolved_in_version || "N/A"} (${item.resolved_at})`);
      }
      if (item.resolution_notes) {
        console.log(`   Notas: ${item.resolution_notes}`);
      }
      console.log("");
    }
    return;
  }

  // 2. Marcar Estado (Hecho, En Proceso, Ignorado)
  if (args.includes("--set-status")) {
    const statusIdx = args.indexOf("--set-status");
    const statusVal = args[statusIdx + 1];
    const idIdx = args.indexOf("--id");
    const idVal = idIdx !== -1 ? args[idIdx + 1] : null;

    if (!statusVal || !idVal) {
      console.error("Error: Se requiere --set-status <estado> y --id <ID>");
      process.exit(1);
    }

    const notesIdx = args.indexOf("--notes");
    const notesVal = notesIdx !== -1 ? args[notesIdx + 1] : null;

    const verIdx = args.indexOf("--version");
    const verVal = verIdx !== -1 ? args[verIdx + 1] : "v9.2.6-1";

    const targetRef = db.ref(`${basePath}/items/${idVal}`);
    const snap = await targetRef.once("value");
    if (!snap.exists()) {
      console.error(`Error: Feedback con ID '${idVal}' no encontrado.`);
      process.exit(1);
    }

    const updatePayload = {
      status: statusVal.toLowerCase(),
      status_label: statusVal === "hecho" ? "Hecho / Resuelto" : statusVal === "en_proceso" ? "En Proceso" : statusVal,
      status_updated_at: new Date().toISOString(),
      ...(statusVal.toLowerCase() === "hecho" ? {
        resolved_at: new Date().toISOString(),
        resolved_in_version: verVal,
      } : {}),
      ...(notesVal ? { resolution_notes: notesVal } : {}),
    };

    await targetRef.update(updatePayload);
    console.log(`✓ Feedback '${idVal}' actualizado exitosamente a estado '${statusVal}'.`);
    return;
  }

  // 3. Eliminar individual
  if (args.includes("--delete")) {
    const idIdx = args.indexOf("--id");
    const idVal = idIdx !== -1 ? args[idIdx + 1] : null;
    if (!idVal) {
      console.error("Error: Se requiere --id <ID> para eliminar.");
      process.exit(1);
    }

    const targetRef = db.ref(`${basePath}/items/${idVal}`);
    const snap = await targetRef.once("value");
    if (!snap.exists()) {
      console.error(`Error: Feedback con ID '${idVal}' no existe.`);
      process.exit(1);
    }

    const data = snap.val();
    await targetRef.remove();
    await db.ref(`${basePath}/notifications/pending/${idVal}`).remove().catch(() => {});
    if (data.fingerprint) {
      await db.ref(`${basePath}/fingerprints/${data.fingerprint}`).remove().catch(() => {});
    }

    console.log(`✓ Feedback '${idVal}' eliminado limpiamente de Firebase RTDB.`);
    return;
  }

  // 4. Limpieza masiva (Cleanup)
  if (args.includes("--cleanup")) {
    const statusIdx = args.indexOf("--status");
    const targetStatus = statusIdx !== -1 ? args[statusIdx + 1] : null;

    console.log(`\n🧹 Ejecutando limpieza en Firebase RTDB (${targetStatus ? `filtro: ${targetStatus}` : "todos los resueltos/antiguos"})...`);
    const snap = await db.ref(`${basePath}/items`).once("value");
    if (!snap.exists()) {
      console.log("  No hay ítems para limpiar.");
      return;
    }

    const items = snap.val() || {};
    let deletedCount = 0;

    for (const [id, f] of Object.entries(items)) {
      const curStatus = (f.status || "").toLowerCase();
      let match = false;
      if (targetStatus && curStatus === targetStatus.toLowerCase()) match = true;
      if (!targetStatus && (curStatus === "hecho" || curStatus === "ignorado")) match = true;

      if (match) {
        await db.ref(`${basePath}/items/${id}`).remove();
        await db.ref(`${basePath}/notifications/pending/${id}`).remove().catch(() => {});
        if (f.fingerprint) {
          await db.ref(`${basePath}/fingerprints/${f.fingerprint}`).remove().catch(() => {});
        }
        console.log(`  - Eliminado: ${id} (${f.title?.slice(0, 50)})`);
        deletedCount++;
      }
    }

    console.log(`\n✓ Limpieza completada: ${deletedCount} feedback(s) eliminados.`);
    return;
  }

  printHelp();
}

main().catch((err) => {
  console.error("Error en manage_feedbacks:", err);
  process.exit(1);
});
