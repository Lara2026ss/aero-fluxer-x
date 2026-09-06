import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";
import { normalizeDotNetDate } from "../tools/system.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function runHotfixTests() {
  console.log("══════════════════════════════════════════════════════════════════");
  console.log("🧪 SUITE OFICIAL DE VALIDACIÓN: HOTFIX v10.3.2 (5 FEEDBACKS)");
  console.log("══════════════════════════════════════════════════════════════════\n");

  const runtime = await createRuntime({ root: ROOT, version: "10.3.2" });
  const registry = new Registry(runtime);
  await registry.load();
  runtime._registry = registry;
  const router = new Router({ runtime, registry });
  runtime.router = router;

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. REGLA FUNDAMENTAL DE COMPACT MODE (Indicación expresa del usuario)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("1. Validando comportamiento opcional de compact mode (OFF por defecto)...");

  // 1.a system.list_scheduled_tasks
  const tasksDefault = await router.execute({
    tool: "system",
    action: "list_scheduled_tasks",
    args: { filter: "OneDrive" }
  });
  assert.strictEqual(tasksDefault.ok, true, "list_scheduled_tasks default ok");
  assert.strictEqual(tasksDefault.compact, undefined, "compact debe ser false/undefined por defecto");
  if (tasksDefault.tasks && tasksDefault.tasks.length > 0) {
    assert.ok(tasksDefault.tasks[0].TaskPath !== undefined, "Por defecto debe incluir TaskPath (formato completo)");
  }

  const tasksCompact = await router.execute({
    tool: "system",
    action: "list_scheduled_tasks",
    args: { filter: "OneDrive", compact: true }
  });
  assert.strictEqual(tasksCompact.ok, true, "list_scheduled_tasks compact ok");
  assert.strictEqual(tasksCompact.compact, true, "compact: true explícito reportado");
  if (tasksCompact.tasks && tasksCompact.tasks.length > 0) {
    const t0 = tasksCompact.tasks[0];
    assert.ok(t0.TaskName !== undefined, "compact debe incluir TaskName");
    assert.ok(t0.State !== undefined, "compact debe incluir State");
    assert.strictEqual(t0.TaskPath, undefined, "compact NO debe incluir TaskPath para ahorro de tokens");
    assert.strictEqual(t0.LastRunTime, undefined, "compact NO debe incluir LastRunTime");
  }
  console.log("   ✓ system.list_scheduled_tasks soporta compact: true y formato completo por defecto.");

  // 1.b system.get_processes
  const procDefault = await router.execute({
    tool: "system",
    action: "get_processes",
    args: { limit: 5 }
  });
  assert.strictEqual(procDefault.ok, true, "get_processes default ok");
  assert.strictEqual(procDefault.compact, undefined, "compact no activo por defecto");
  assert.ok(typeof procDefault.output === "string", "Por defecto devuelve tabla estándar en output");

  const procCompact = await router.execute({
    tool: "system",
    action: "get_processes",
    args: { limit: 5, compact: true }
  });
  assert.strictEqual(procCompact.ok, true, "get_processes compact ok");
  assert.strictEqual(procCompact.compact, true, "compact: true reportado");
  assert.ok(Array.isArray(procCompact.processes), "compact retorna array de procesos estructurado");
  if (procCompact.processes.length > 0) {
    const p0 = procCompact.processes[0];
    assert.ok(p0.PID !== undefined, "Debe tener PID");
    assert.ok(p0.Name !== undefined, "Debe tener Name");
    assert.ok(p0.MemoryMB !== undefined, "Debe tener MemoryMB");
    assert.ok(p0["CPU%"] !== undefined, "Debe tener CPU%");
  }
  console.log("   ✓ system.get_processes devuelve PID, Name, MemoryMB, CPU% con compact: true.");

  // 1.c security.audit_log
  const auditDefault = await router.execute({
    tool: "security",
    action: "audit_log",
    args: { limit: 5 }
  });
  assert.strictEqual(auditDefault.ok, true, "audit_log default ok");
  assert.strictEqual(auditDefault.compact, undefined, "compact no activo por defecto");

  const auditCompact = await router.execute({
    tool: "security",
    action: "audit_log",
    args: { limit: 5, compact: true }
  });
  assert.strictEqual(auditCompact.ok, true, "audit_log compact ok");
  assert.strictEqual(auditCompact.compact, true, "compact: true reportado");
  if (auditCompact.entries && auditCompact.entries.length > 0) {
    const e0 = auditCompact.entries[0];
    assert.ok("timestamp" in e0, "Debe incluir timestamp");
    assert.ok("tool" in e0, "Debe incluir tool");
    assert.ok("action" in e0, "Debe incluir action");
    assert.ok("status" in e0, "Debe incluir status");
    assert.strictEqual(e0.args, undefined, "No debe incluir args en modo compact");
  }
  console.log("   ✓ security.audit_log limita a timestamp, tool, action, status con compact: true.");

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. [AFX-FB-9XMUF4] Normalizar fechas .NET/WMI a ISO 8601
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n2. Validando normalización de fechas .NET / WMI a ISO 8601...");
  const sampleMs = 1787919781000;
  const expectedIso = new Date(sampleMs).toISOString();
  assert.strictEqual(normalizeDotNetDate(`/Date(${sampleMs})/`), expectedIso);
  assert.strictEqual(normalizeDotNetDate(`/Date(${sampleMs}-0500)/`), expectedIso);
  assert.strictEqual(normalizeDotNetDate({ value: `/Date(${sampleMs})/` }), expectedIso);
  assert.strictEqual(normalizeDotNetDate({ DateTime: "2026-09-01T12:00:00.000Z" }), "2026-09-01T12:00:00.000Z");
  assert.strictEqual(normalizeDotNetDate(null), null);
  assert.strictEqual(normalizeDotNetDate(undefined), undefined);

  // Comprobar system.get_windows_update_status
  const wuRes = await router.execute({
    tool: "system",
    action: "get_windows_update_status",
    args: {}
  });
  assert.strictEqual(wuRes.ok, true, "get_windows_update_status ejecutó correctamente");
  if (wuRes.recentUpdates && wuRes.recentUpdates.length > 0) {
    for (const update of wuRes.recentUpdates) {
      if (typeof update.InstalledOn === "string") {
        assert.ok(!update.InstalledOn.startsWith("/Date("), "Fechas de Windows Update no deben tener formato crudo /Date(...)");
      }
    }
  }

  // Comprobar system.get_defender_status
  const defRes = await router.execute({
    tool: "system",
    action: "get_defender_status",
    args: {}
  });
  if (defRes.ok && defRes.defender) {
    for (const [k, v] of Object.entries(defRes.defender)) {
      if (typeof v === "string") {
        assert.ok(!v.startsWith("/Date("), `Campo defender.${k} no debe contener /Date(...)`);
      }
    }
  }
  console.log("   ✓ Fechas .NET/WMI normalizadas a ISO 8601 en herramientas del sistema.");

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. [AFX-FB-B6A7UQ] system.get_env_vars con sessionOnly: true
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n3. Validando system.get_env_vars con sessionOnly: true...");
  const testVarName = `AFX_TEST_VAR_${Date.now()}`;
  const testVarVal = "active_session_12345";

  // Registrar variable en sesión
  const setRes = await router.execute({
    tool: "system",
    action: "set_env_var",
    args: { name: testVarName, value: testVarVal, scope: "process" }
  });
  assert.strictEqual(setRes.ok, true, "set_env_var debe tener éxito");

  // Consultar con sessionOnly: true
  const sessionEnvs = await router.execute({
    tool: "system",
    action: "get_env_vars",
    args: { scope: "process", sessionOnly: true }
  });
  assert.strictEqual(sessionEnvs.ok, true, "get_env_vars con sessionOnly debe tener éxito");
  assert.strictEqual(sessionEnvs.sessionOnly, true, "sessionOnly: true reflejado");
  assert.strictEqual(sessionEnvs.vars[testVarName], testVarVal, "La variable seteada debe estar presente");
  // Verificar que NO incluye las miles de variables globales del sistema
  assert.ok(sessionEnvs.count < 50, "sessionOnly debe contener solo variables de la sesión, no todo el sistema");

  // Eliminar variable de sesión
  const remRes = await router.execute({
    tool: "system",
    action: "remove_env_var",
    args: { name: testVarName, scope: "process" }
  });
  assert.strictEqual(remRes.ok, true, "remove_env_var debe tener éxito");

  const sessionEnvsAfter = await router.execute({
    tool: "system",
    action: "get_env_vars",
    args: { scope: "process", sessionOnly: true }
  });
  assert.strictEqual(sessionEnvsAfter.vars[testVarName], undefined, "Variable eliminada no debe aparecer");
  console.log("   ✓ system.get_env_vars soporta sessionOnly: true aislando variables de sesión.");

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. [AFX-FB-TTLJN2] system.list_scheduled_tasks con include_run_times: true
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n4. Validando system.list_scheduled_tasks con include_run_times: true...");
  const tasksSchedule = await router.execute({
    tool: "system",
    action: "list_scheduled_tasks",
    args: { filter: "OneDrive", include_run_times: true }
  });
  assert.strictEqual(tasksSchedule.ok, true, "list_scheduled_tasks con include_run_times debe tener éxito");
  assert.strictEqual(tasksSchedule.include_run_times, true, "include_run_times reportado");
  if (tasksSchedule.tasks && tasksSchedule.tasks.length > 0) {
    const t0 = tasksSchedule.tasks[0];
    assert.ok("LastRunTime" in t0, "Debe contener campo LastRunTime");
    assert.ok("NextRunTime" in t0, "Debe contener campo NextRunTime");
    if (typeof t0.LastRunTime === "string") {
      assert.ok(!t0.LastRunTime.startsWith("/Date("), "LastRunTime debe estar normalizado en ISO 8601");
    }
  }
  console.log("   ✓ system.list_scheduled_tasks expone LastRunTime y NextRunTime con normalización.");

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. [AFX-FB-PUG9Y6] y Seguimiento Propio sin ADMIN_KEY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n5. Validando ciclo de feedback propio y list_my_feedbacks sin ADMIN_KEY...");

  const myFeedbacksPath = path.join(ROOT, "storage", "my_feedbacks.json");
  // Asegurar entorno limpio para la prueba
  await fs.mkdir(path.dirname(myFeedbacksPath), { recursive: true });

  const testOwnId = "AFX-FB-TESTOWN1";
  const initialData = [
    {
      id: testOwnId,
      title: "Problema de test en sesión local",
      created_at: new Date().toISOString(),
      status: "recibido",
      resolution_notes: null,
      fixed_in_version: null,
      cached_at: new Date().toISOString(),
    }
  ];
  await fs.writeFile(myFeedbacksPath, JSON.stringify(initialData, null, 2), "utf8");

  // 5.a Consultar feedback ajeno SIN ADMIN_KEY -> Debe rechazar con ADMIN_KEY_REQUIRED
  const alienRes = await router.execute({
    tool: "developer",
    action: "read_feedback",
    args: { id: "AFX-FB-ALIEN999" }
  });
  assert.strictEqual(alienRes.ok, false, "read_feedback ajeno debe fallar");
  assert.strictEqual(alienRes.error, "ADMIN_KEY_REQUIRED", "Debe requerir ADMIN_KEY para feedback ajeno");

  // 5.b Consultar feedback propio SIN ADMIN_KEY -> Debe permitir la consulta
  const ownRes = await router.execute({
    tool: "developer",
    action: "read_feedback",
    args: { id: testOwnId }
  });
  assert.strictEqual(ownRes.ok, true, "read_feedback propio debe tener éxito sin ADMIN_KEY");
  assert.strictEqual(ownRes.feedback.id, testOwnId, "ID devuelto coincide con feedback propio");

  // 5.c Subherramienta developer.list_my_feedbacks
  const myListRes = await router.execute({
    tool: "developer",
    action: "list_my_feedbacks",
    args: {}
  });
  assert.strictEqual(myListRes.ok, true, "list_my_feedbacks debe responder ok");
  assert.ok(Array.isArray(myListRes.feedbacks), "feedbacks debe ser array");
  assert.ok(myListRes.feedbacks.some(f => f.id === testOwnId), "Debe contener el feedback propio");
  const myItem = myListRes.feedbacks.find(f => f.id === testOwnId);
  assert.ok("status" in myItem, "Debe tener status");
  assert.ok("resolution_notes" in myItem, "Debe tener resolution_notes");
  assert.ok("fixed_in_version" in myItem, "Debe tener fixed_in_version");

  // 5.d Eliminar feedback ajeno SIN ADMIN_KEY -> Debe rechazar
  const alienDel = await router.execute({
    tool: "developer",
    action: "delete_feedback",
    args: { id: "AFX-FB-ALIEN999" }
  });
  assert.strictEqual(alienDel.ok, false, "delete_feedback ajeno debe fallar sin ADMIN_KEY");
  assert.strictEqual(alienDel.error, "ADMIN_KEY_REQUIRED", "Debe requerir ADMIN_KEY");

  // 5.e Eliminar feedback propio SIN ADMIN_KEY -> Debe permitirlo
  const ownDel = await router.execute({
    tool: "developer",
    action: "delete_feedback",
    args: { id: testOwnId }
  });
  assert.strictEqual(ownDel.ok, true, "delete_feedback propio debe tener éxito sin ADMIN_KEY");
  assert.strictEqual(ownDel.deleted, testOwnId, "Debe reportar el ID eliminado");

  // Comprobar que ya no aparece en list_my_feedbacks
  const afterDelList = await router.execute({
    tool: "developer",
    action: "list_my_feedbacks",
    args: {}
  });
  assert.ok(!afterDelList.feedbacks.some(f => f.id === testOwnId), "El feedback eliminado ya no debe figurar");

  // 5.f Resiliencia ante JSON corrupto (backup automático .bak.json)
  await fs.writeFile(myFeedbacksPath, "{ ESTO ES JSON TOTALMENTE CORRUPTO", "utf8");
  const corruptTestList = await router.execute({
    tool: "developer",
    action: "list_my_feedbacks",
    args: {}
  });
  assert.strictEqual(corruptTestList.ok, true, "list_my_feedbacks no debe crashear con archivo corrupto");
  const bakExists = await fs.access(path.join(ROOT, "storage", "my_feedbacks.bak.json")).then(() => true).catch(() => false);
  assert.strictEqual(bakExists, true, "Debe haber generado my_feedbacks.bak.json de respaldo");

  // Limpiar archivo bak temporal de prueba
  await fs.rm(path.join(ROOT, "storage", "my_feedbacks.bak.json"), { force: true }).catch(() => {});
  await fs.rm(myFeedbacksPath, { force: true }).catch(() => {});

  console.log("   ✓ Seguimiento de feedback propio, list_my_feedbacks y resiliencia validados.");

  console.log("\n==================================================");
  console.log("🎉 TODOS LOS TESTS DE HOTFIX v10.3.2 PASARON EXITOSAMENTE");
  console.log("==================================================");
}

runHotfixTests().catch(err => {
  console.error("❌ Falló la suite v10.3.2:", err);
  process.exit(1);
});
