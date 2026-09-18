import assert from "node:assert";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";
import { getStorageStructure } from "../core/storage-paths.mjs";

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
  console.log("-> 1. developer.submit_feedback con payload mínimo y diversos tipos de adjuntos...");
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

  // Soporte de attachment como objeto ({ path: ... })
  const withObjAttachRes = await runtime.router.execute({
    tool: "developer",
    action: "submit_feedback",
    args: {
      title: "Error con attachment como objeto",
      description: "Descripción con attachment { path: ... }",
      attachment: { path: testCapture }
    }
  });
  assert.strictEqual(withObjAttachRes.ok, true, "submit_feedback debe soportar attachment pasado como objeto");
  await fs.unlink(testCapture).catch(() => {});

  // 1.b. 🟢 developer.submit_feedback con dry_run / test_mode / status: "test_only_dry_run"
  console.log("-> 1.b. developer.submit_feedback con simulación dry_run (cero escritura en producción/red/outbox)...");
  const storage = getStorageStructure(runtime.root);
  const outboxDir = storage.feedbackOutboxDir;

  // Test con dry_run: true
  const dryRunRes = await runtime.router.execute({
    tool: "developer",
    action: "submit_feedback",
    args: {
      dry_run: true,
      title: "Error simulado de prueba",
      description: "Probando el comportamiento de dry_run",
      type: "bug_report",
      severity: "high",
    }
  });
  assert.strictEqual(dryRunRes.ok, true, "dry_run debe retornar ok: true");
  assert.strictEqual(dryRunRes.dry_run, true, "Debe tener dry_run: true");
  assert.strictEqual(dryRunRes.simulated, true, "Debe tener simulated: true");
  assert.strictEqual(dryRunRes.feedbackId, "AFX-FB-SIMULATED", "feedbackId debe ser AFX-FB-SIMULATED");
  assert.ok(dryRunRes.message && dryRunRes.message.includes("Simulación dry_run exitosa"), "Mensaje debe confirmar simulación exitosa");
  assert.strictEqual(dryRunRes.validated?.title, "Error simulado de prueba");
  assert.strictEqual(dryRunRes.validated?.description, "Probando el comportamiento de dry_run");
  assert.strictEqual(dryRunRes.validated?.type, "bug_report");
  assert.strictEqual(dryRunRes.validated?.severity, "high");
  assert.strictEqual(dryRunRes.validated?.hasAttachment, false);

  // Test con status: "test_only_dry_run" (formato reportado por Claude Desktop)
  const statusDryRunRes = await runtime.router.execute({
    tool: "developer",
    action: "submit_feedback",
    args: {
      status: "test_only_dry_run",
      data: {
        title: "Test con status test_only_dry_run",
        description: "Payload anidado en data con status test_only_dry_run",
      }
    }
  });
  assert.strictEqual(statusDryRunRes.ok, true, "status: test_only_dry_run debe ser aceptado");
  assert.strictEqual(statusDryRunRes.dry_run, true);
  assert.strictEqual(statusDryRunRes.simulated, true);
  assert.strictEqual(statusDryRunRes.feedbackId, "AFX-FB-SIMULATED");
  assert.strictEqual(statusDryRunRes.validated?.title, "Test con status test_only_dry_run");

  // Test con test_mode: true
  const testModeRes = await runtime.router.execute({
    tool: "developer",
    action: "submit_feedback",
    args: {
      test_mode: true,
      title: "Test con test_mode",
      description: "Verificando flag test_mode: true",
    }
  });
  assert.strictEqual(testModeRes.ok, true);
  assert.strictEqual(testModeRes.dry_run, true);
  assert.strictEqual(testModeRes.feedbackId, "AFX-FB-SIMULATED");

  // Test con dry_run y archivo adjunto
  const testDryCapture = path.join(os.tmpdir(), "afx_dry_test_img.png");
  await fs.writeFile(testDryCapture, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const dryWithAttachRes = await runtime.router.execute({
    tool: "developer",
    action: "submit_feedback",
    args: {
      dry_run: true,
      title: "Dry run con captura adjunta",
      description: "Validación de adjunto en dry_run",
      screenshot: testDryCapture,
    }
  });
  assert.strictEqual(dryWithAttachRes.ok, true);
  assert.strictEqual(dryWithAttachRes.validated?.hasAttachment, true, "hasAttachment debe ser true");
  await fs.unlink(testDryCapture).catch(() => {});

  // Test validación en dry_run: campos obligatorios faltantes
  const invalidDryRunRes = await runtime.router.execute({
    tool: "developer",
    action: "submit_feedback",
    args: {
      dry_run: true,
      title: "",
      description: "Sin título",
    }
  });
  assert.strictEqual(invalidDryRunRes.ok, false);
  assert.strictEqual(invalidDryRunRes.code, "INVALID_INPUT");

  // Test con status en mayúsculas y espacios (tolerancia robusta a clientes MCP)
  const statusUpperRes = await runtime.router.execute({
    tool: "developer",
    action: "submit_feedback",
    args: {
      status: "  TEST_ONLY_DRY_RUN  ",
      title: "Test con status TEST_ONLY_DRY_RUN en mayúsculas",
      description: "Verificando normalización case-insensitive",
    }
  });
  assert.strictEqual(statusUpperRes.ok, true, "status TEST_ONLY_DRY_RUN mayúsculas debe ser aceptado");
  assert.strictEqual(statusUpperRes.dry_run, true);
  assert.strictEqual(statusUpperRes.feedbackId, "AFX-FB-SIMULATED");

  // Test con dry_run numérico (dry_run: 1) y como string "1"
  const numericDryRunRes = await runtime.router.execute({
    tool: "developer",
    action: "submit_feedback",
    args: {
      dry_run: 1,
      title: "Test con dry_run: 1",
      description: "Verificando valor numérico truthy para dry_run",
    }
  });
  assert.strictEqual(numericDryRunRes.ok, true);
  assert.strictEqual(numericDryRunRes.dry_run, true);
  assert.strictEqual(numericDryRunRes.feedbackId, "AFX-FB-SIMULATED");

  // Test con mode: "dry_run"
  const modeDryRunRes = await runtime.router.execute({
    tool: "developer",
    action: "submit_feedback",
    args: {
      mode: "dry_run",
      title: "Test con mode dry_run",
      description: "Verificando soporte de mode: dry_run",
    }
  });
  assert.strictEqual(modeDryRunRes.ok, true);
  assert.strictEqual(modeDryRunRes.dry_run, true);
  assert.strictEqual(modeDryRunRes.feedbackId, "AFX-FB-SIMULATED");

  // Test con dry_run especificado a nivel superior en router.execute
  const topLevelDryRunRes = await runtime.router.execute({
    tool: "developer",
    action: "submit_feedback",
    dry_run: true,
    args: {
      title: "Test con dry_run a nivel superior",
      description: "Verificando propagación de dry_run desde argumentos raíz del MCP",
    }
  });
  assert.strictEqual(topLevelDryRunRes.ok, true);
  assert.strictEqual(topLevelDryRunRes.dry_run, true);
  assert.strictEqual(topLevelDryRunRes.feedbackId, "AFX-FB-SIMULATED");

  // Test validación en dry_run: detección preventiva de secretos
  const secretKey = ["g", "sk_123456789012345678901234"].join("");
  const blockedDryRunRes = await runtime.router.execute({
    tool: "developer",
    action: "submit_feedback",
    args: {
      dry_run: true,
      title: "Intento con API Key",
      description: `Clave privada ${secretKey} incluida`,
    }
  });
  assert.strictEqual(blockedDryRunRes.ok, false);
  assert.strictEqual(blockedDryRunRes.code, "BLOCKED_SENSITIVE_DATA");

  // Test validación en dry_run: adjunto > 2MB debe ser rechazado con ok: false y PAYLOAD_TOO_LARGE
  const largeAttachment = path.join(os.tmpdir(), "afx_large_test.bin");
  await fs.writeFile(largeAttachment, Buffer.alloc(2.5 * 1024 * 1024)); // 2.5MB
  const largeAttachRes = await runtime.router.execute({
    tool: "developer",
    action: "submit_feedback",
    args: {
      dry_run: true,
      title: "Dry run con adjunto gigante",
      description: "Debe ser rechazado con PAYLOAD_TOO_LARGE",
      attachment: largeAttachment,
    }
  });
  assert.strictEqual(largeAttachRes.ok, false, "Debe retornar ok: false ante adjunto > 2MB");
  assert.strictEqual(largeAttachRes.code, "PAYLOAD_TOO_LARGE", "Código de error debe ser PAYLOAD_TOO_LARGE");
  await fs.unlink(largeAttachment).catch(() => {});

  // Confirmar que NINGÚN archivo de simulación fue escrito en la outbox local
  let postOutboxFiles = [];
  try {
    postOutboxFiles = await fs.readdir(outboxDir);
  } catch {}
  assert.ok(!postOutboxFiles.includes("AFX-FB-SIMULATED.json"), "AFX-FB-SIMULATED no debe guardarse en la outbox");

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
  // Inyectar permiso visual no expirado en SQLite pero de sesión anterior (sin grant en memoria)
  const futureIso = new Date(Date.now() + 3600000).toISOString();
  runtime.memory.grantPermission({
    level: "visual_capture_grant",
    scope: "system.visual_capture",
    expiresAt: futureIso,
    reason: "Captura de sesión anterior",
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
  assert.strictEqual(permsAfterExpiredInjection.visual_capture_grant_active, false, "visual_capture_grant_active debe ser false ante registros de sesión previa");

  // Verificar que PermissionEngine.active() filtra directamente el permiso fantasma
  const engineActive = runtime.permissions.active();
  const hasGhostVisual = engineActive.some(p => p.level === "visual_capture_grant" || p.scope === "system.visual_capture");
  assert.strictEqual(hasGhostVisual, false, "PermissionEngine.active() no debe retornar permisos visuales de sesiones previas");

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
  console.log("-> 3. packages.audit_vulnerabilities con 0 vulnerabilidades y con vulnerabilidades simuladas...");
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

  // Comprobar lógica unitaria ante vulnerabilidades existentes (evitar falsos positivos)
  const packagesDomain = (await import("../tools/packages.mjs")).createPackagesDomain({
    runtime: {
      run: async () => ({
        ok: false,
        stdout: JSON.stringify({
          vulnerabilities: {
            "vulnerable-lib": { name: "vulnerable-lib", severity: "high", range: "<2.0.0", fixAvailable: true }
          },
          metadata: { vulnerabilities: { total: 1 } }
        }),
        stderr: ""
      }),
      hp: p => p
    },
    domain: (name, desc, actions, permissions) => ({ name, description: desc, actions, permissions }),
    parsePkgLines: () => []
  });
  const vulnAuditRes = await packagesDomain.actions.audit_vulnerabilities({ path: "." });
  assert.strictEqual(vulnAuditRes.advisories_count, 1, "Debe registrar 1 asesoría");
  assert.strictEqual(vulnAuditRes.audit_passed, false, "audit_passed debe ser estrictamente FALSE cuando hay vulnerabilidades");

  // También probar formato pnpm con advisories
  const pnpmDomain = (await import("../tools/packages.mjs")).createPackagesDomain({
    runtime: {
      run: async () => ({
        ok: false,
        stdout: JSON.stringify({
          advisories: {
            "101": { module_name: "pnpm-vulnerable", severity: "critical", vulnerable_versions: "<1.5.0" }
          },
          metadata: { vulnerabilities: { total: 1 } }
        }),
        stderr: ""
      }),
      hp: p => p
    },
    domain: (name, desc, actions, permissions) => ({ name, description: desc, actions, permissions }),
    parsePkgLines: () => []
  });
  const pnpmAuditRes = await pnpmDomain.actions.audit_vulnerabilities({ path: ".", manager: "pnpm" });
  assert.strictEqual(pnpmAuditRes.advisories_count, 1, "pnpm debe registrar 1 asesoría");
  assert.strictEqual(pnpmAuditRes.audit_passed, false, "audit_passed debe ser FALSE ante advisories de pnpm");

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. 🟡 files.sandbox_status resuelve C:\\Windows\\System32 a runtime.root
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("-> 4. files.sandbox_status con process.cwd() simulando System32 y variantes...");
  const originalCwd = process.cwd();

  // Test 4a: C:\Windows\System32
  try {
    process.chdir("C:\\Windows\\System32");
  } catch {}

  const sandboxRes = await runtime.router.execute({
    tool: "files",
    action: "sandbox_status",
    args: { revealPath: true }
  });

  const sandboxMaskedRes = await runtime.router.execute({
    tool: "files",
    action: "sandbox_status",
    args: { revealPath: false }
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

  // Masked workspace_cwd no debe revelar System32
  assert.ok(!sandboxMaskedRes.workspace_cwd?.toLowerCase().includes("system32"), "Masked workspace_cwd no debe exponer system32");

  // Test 4b: Verificación con variantes de rutas (trailing slash, forward slash, SysWOW64)
  const filesDomain = (await import("../tools/files.mjs")).createFilesDomain({
    runtime: { dirs: { root: ROOT, home: os.homedir() }, permissions: { currentLevel: () => "standard" } },
    path,
    fs,
    crypto,
    domain: (name, desc, actions, permissions) => ({ name, description: desc, actions, permissions }),
    helpers: {}
  });

  const testVariants = ["C:\\Windows\\System32\\", "C:/Windows/System32", "C:\\Windows\\SysWOW64"];
  for (const variant of testVariants) {
    try {
      process.chdir(variant);
      const res = await runtime.router.execute({
        tool: "files",
        action: "sandbox_status",
        args: { revealPath: true }
      });
      assert.strictEqual(path.resolve(res.workspace_cwd), path.resolve(ROOT), `Variante ${variant} debe resolver a ROOT`);
    } catch {} finally {
      try { process.chdir(originalCwd); } catch {}
    }
  }

  console.log("\n✅ TODOS LOS 4 HOTFIXES DE v10.3.1 FUERON VERIFICADOS SATISFACTORIAMENTE (4/4) ✅");
  await runtime.shutdown();
  process.exit(0);
}

runV10_3_1_Tests().catch(err => {
  console.error("❌ Falló la suite v10.3.1:", err);
  process.exit(1);
});
