import assert from "node:assert";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function runV10_3_1_Tests() {
  console.log("=== Suite de Pruebas Oficial Hotfixes v10.3.1 ===");

  const runtime = await createRuntime({ root: ROOT, version: "10.3.1" });
  const registry = new Registry(runtime);
  await registry.load();
  runtime._registry = registry;
  const router = new Router({ runtime, registry });
  runtime.router = router;

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. 🔴 developer.submit_feedback sin captura adjunta (payload mínimo)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("-> 1. developer.submit_feedback con payload mínimo (sin attachment/screenshot)...");
  const minimalRes = await runtime.router.execute({
    tool: "developer",
    action: "submit_feedback",
    args: {
      title: "Error menor de prueba",
      description: "Descripción mínima sin capturas ni adjuntos"
    }
  });
  assert.strictEqual(minimalRes.ok, true, "submit_feedback debe retornar ok: true con payload mínimo");
  assert.ok(minimalRes.id && minimalRes.id.startsWith("AFX-FB-"), "Debe generar id con prefijo AFX-FB-");
  assert.notStrictEqual(minimalRes.code, "INTERNAL_ERROR", "No debe arrojar ReferenceError");

  // También probamos con captura válida existente
  const testCapture = path.join(os.tmpdir(), "afx_test_img.png");
  await fs.writeFile(testCapture, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const withAttachRes = await runtime.router.execute({
    tool: "developer",
    action: "submit_feedback",
    args: {
      title: "Error con captura adjunta",
      description: "Descripción con archivo de captura",
      screenshot: testCapture
    }
  });
  assert.strictEqual(withAttachRes.ok, true, "submit_feedback debe soportar adjunto válido");
  await fs.unlink(testCapture).catch(() => {});

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. 🟠 security.list_granted_permissions filtrado estricto y visual_capture_grant_active
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("-> 2. security.list_granted_permissions y no-fantasmas...");
  // Al inicio en sesión limpia, visual_capture_grant_active debe ser false
  const initialPerms = await runtime.router.execute({
    tool: "security",
    action: "list_granted_permissions",
    args: {}
  });
  assert.strictEqual(initialPerms.ok, true);
  assert.strictEqual(initialPerms.visual_capture_grant_active, false, "visual_capture_grant_active debe ser false si no se otorgó");
  assert.ok(initialPerms.summary.includes("No hay ninguna sesión") || initialPerms.summary.includes("activo"), "Summary no debe contradecir estado");

  // Inyectar un permiso artificialmente expirado en la base de datos para probar resistencia a SQLite CURRENT_TIMESTAMP
  const pastIso = new Date(Date.now() - 3600000).toISOString();
  runtime.memory.grantPermission({
    level: "advanced",
    scope: "*",
    expiresAt: pastIso,
    reason: "Permiso antiguo expirado hace 1 hora",
    principal: "default",
    workflowId: "wf_expired_test_99"
  });
  // Inyectar permiso visual expirado
  runtime.memory.grantPermission({
    level: "visual_capture_grant",
    scope: "system.visual_capture",
    expiresAt: pastIso,
    reason: "Captura expirada",
    principal: "default"
  });

  const permsAfterExpiredInjection = await runtime.router.execute({
    tool: "security",
    action: "list_granted_permissions",
    args: {}
  });
  // El permiso expirado NO debe aparecer en current_permissions
  const hasExpired = permsAfterExpiredInjection.current_permissions.some(p => p.workflow_id === "wf_expired_test_99");
  assert.strictEqual(hasExpired, false, "Los permisos expirados no deben aparecer en current_permissions");
  assert.strictEqual(permsAfterExpiredInjection.visual_capture_grant_active, false, "visual_capture_grant_active debe ser false ante registros antiguos");

  // Conceder visual capture activamente en esta sesión
  const grantVisual = await runtime.router.execute({
    tool: "security",
    action: "grant_visual_capture",
    args: { durationMinutes: 5 }
  });
  assert.strictEqual(grantVisual.ok, true);
  assert.strictEqual(grantVisual.granted, true);

  const permsWithVisual = await runtime.router.execute({
    tool: "security",
    action: "list_granted_permissions",
    args: {}
  });
  assert.strictEqual(permsWithVisual.visual_capture_grant_active, true, "visual_capture_grant_active debe ser true tras concederlo");

  // Revocarlo
  await runtime.permissions.revokeVisualCapture();
  const permsAfterRevoke = await runtime.router.execute({
    tool: "security",
    action: "list_granted_permissions",
    args: {}
  });
  assert.strictEqual(permsAfterRevoke.visual_capture_grant_active, false, "visual_capture_grant_active debe ser false tras revocarlo");

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. 🟡 packages.audit_vulnerabilities audit_passed: true cuando advisories_count === 0
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("-> 3. packages.audit_vulnerabilities con 0 vulnerabilidades...");
  const tempAuditDir = path.join(os.tmpdir(), `afx_audit_${Date.now()}`);
  await fs.mkdir(tempAuditDir, { recursive: true });
  await fs.writeFile(
    path.join(tempAuditDir, "package.json"),
    JSON.stringify({ name: "clean-project", version: "1.0.0" }, null, 2)
  );
  await fs.writeFile(
    path.join(tempAuditDir, "package-lock.json"),
    JSON.stringify({
      name: "clean-project",
      version: "1.0.0",
      lockfileVersion: 3,
      packages: { "": { name: "clean-project", version: "1.0.0" } }
    }, null, 2)
  );

  const cleanAuditRes = await runtime.router.execute({
    tool: "packages",
    action: "audit_vulnerabilities",
    args: { path: tempAuditDir, manager: "npm" }
  });
  await fs.rm(tempAuditDir, { recursive: true, force: true }).catch(() => {});

  assert.strictEqual(cleanAuditRes.ok, true);
  assert.strictEqual(cleanAuditRes.advisories_count, 0, "advisories_count debe ser 0 en proyecto limpio");
  assert.strictEqual(cleanAuditRes.audit_passed, true, "audit_passed debe ser estrictamente true si advisories_count === 0");

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. 🟡 files.sandbox_status resuelve C:\\Windows\\System32 a runtime.root
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("-> 4. files.sandbox_status con process.cwd() simulando System32...");
  const originalCwd = process.cwd();
  try {
    process.chdir("C:\\Windows\\System32");
  } catch {}

  const sandboxRes = await runtime.router.execute({
    tool: "files",
    action: "sandbox_status",
    args: { revealPath: true }
  });

  try {
    process.chdir(originalCwd);
  } catch {}

  assert.strictEqual(sandboxRes.ok, true);
  assert.notStrictEqual(sandboxRes.workspace_cwd?.toLowerCase(), "c:\\windows\\system32", "workspace_cwd no debe ser System32");
  const wsRoot = sandboxRes.allowed_roots.find(r => r.label === "workspace_cwd");
  assert.ok(wsRoot, "allowed_roots debe contener workspace_cwd");
  assert.notStrictEqual(wsRoot.path?.toLowerCase(), "c:\\windows\\system32", "allowed_roots.workspace_cwd no debe ser System32");
  assert.strictEqual(path.resolve(wsRoot.path), path.resolve(ROOT), "workspace_cwd debe resolver hacia la raíz del MCP");

  console.log("\n✅ TODOS LOS 4 HOTFIXES DE v10.3.1 FUERON VERIFICADOS SATISFACTORIAMENTE (4/4) ✅");
  await runtime.shutdown();
  process.exit(0);
}

runV10_3_1_Tests().catch(err => {
  console.error("❌ Falló la suite v10.3.1:", err);
  process.exit(1);
});
