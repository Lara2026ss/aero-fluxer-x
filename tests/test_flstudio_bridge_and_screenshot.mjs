/**
 * Test Suite: FL Studio Bridge & Screenshot Domain Verification
 * Tests the real live behavior without simulation.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function runTests() {
  console.log("==================================================");
  console.log("🚀 INICIANDO TEST SUITE: FL STUDIO & SCREENSHOT");
  console.log("==================================================");

  const runtime = await createRuntime({
    root: ROOT,
    version: "12.0.0",
    brand: "FLUXER_TEST",
  });

  const registry = new Registry(runtime);
  await registry.load();
  runtime._registry = registry;
  const router = new Router({ runtime, registry });

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FALLÓ: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // ── TEST 1: Registro de Dominios ──────────────────────────────────────────
  console.log("\n[1/7] Verificando registro de dominios...");
  const domains = registry.moduleNames();
  assert(domains.includes("flstudio"), "Dominio 'flstudio' está registrado en el Registry");
  assert(domains.includes("screenshot"), "Dominio 'screenshot' está registrado en el Registry");

  // ── TEST 2: flstudio.detect con proceso real ───────────────────────────────
  console.log("\n[2/7] Verificando flstudio.detect...");
  const detectRes = await router.execute({
    tool: "flstudio",
    action: "detect",
    args: {},
  });
  assert(detectRes.ok === true, "flstudio.detect retornó ok: true");
  assert(typeof detectRes.executable_path === "string" && detectRes.executable_path.length > 0, "Ruta de ejecutable resuelta");
  assert(typeof detectRes.fl_running === "boolean", "fl_running es un booleano válido");
  if (detectRes.fl_running) {
    assert(typeof detectRes.fl_pid === "number" && detectRes.fl_pid > 0, `PID numérico válido detectado: ${detectRes.fl_pid}`);
  }
  assert(["tcp", "midi", "none"].includes(detectRes.active_transport), `active_transport reportado honestamente: '${detectRes.active_transport}'`);
  console.log(`     Estado detectado: ${detectRes.message}`);

  // ── TEST 3: flstudio.install ──────────────────────────────────────────────
  console.log("\n[3/7] Verificando flstudio.install...");
  const installRes = await router.execute({
    tool: "flstudio",
    action: "install",
    args: {},
  });
  assert(installRes.ok === true, "flstudio.install retornó ok: true");
  assert(existsSync(installRes.hardware_script_path), `Script de Hardware existe en: ${installRes.hardware_script_path}`);
  assert(existsSync(installRes.pianoroll_script_path), `Script de Piano Roll existe en: ${installRes.pianoroll_script_path}`);

  // ── TEST 4: flstudio.open (verificación de estado o enfoque) ───────────────
  console.log("\n[4/7] Verificando flstudio.open / detect...");
  if (detectRes.fl_running) {
    const openRes = await router.execute({
      tool: "flstudio",
      action: "open",
      args: {},
    });
    assert(openRes.ok === true, "flstudio.open retornó ok: true");
    assert(openRes.already_running === true, "Identificó correctamente que ya estaba corriendo");
    assert(openRes.pid === detectRes.fl_pid, "Coincidencia de PID en open");
  } else {
    assert(detectRes.installed === true, "Identificó correctamente que FL Studio está instalado en disco");
    console.log("     FL Studio no está en ejecución; se valida estado 'installed: true' sin lanzar proceso invasivo.");
  }

  // ── TEST 5: Consentimiento y screenshot.desktop (Captura real) ───────────
  console.log("\n[5/7] Verificando consentimiento y screenshot.desktop...");
  const ungrantedRes = await router.execute({
    tool: "screenshot",
    action: "desktop",
    args: { revealPath: true },
  });
  assert(ungrantedRes.code === "CONFIRMATION_REQUIRED", "Capa de seguridad interceptó captura sin permiso 'visual_capture_grant'");

  // Conceder autorización explícita de captura visual
  runtime.permissions.grantVisualCapture({ durationMinutes: 10 });
  assert(runtime.permissions.hasVisualCaptureGrant("default") === true, "Permiso 'visual_capture_grant' otorgado válidamente");

  const deskRes = await router.execute({
    tool: "screenshot",
    action: "desktop",
    args: { revealPath: true },
  });
  console.log("deskRes after auth:", deskRes);
  assert(deskRes.ok === true, "screenshot.desktop retornó ok: true tras autorización");
  assert(deskRes.mode === "desktop", "Modo desktop verificado");
  assert(typeof deskRes.raw_path === "string" && existsSync(deskRes.raw_path), `Archivo de captura creado físicamente: ${deskRes.raw_path}`);
  assert(deskRes.size_bytes > 10000, `Tamaño de archivo real válido: ${deskRes.size_bytes} bytes`);
  assert(deskRes.dimensions.width >= 800 && deskRes.dimensions.height >= 600, `Dimensiones reales válidas: ${deskRes.dimensions.width}x${deskRes.dimensions.height}`);

  // Validar cabecera PNG real (\x89PNG)
  const headerBuf = Buffer.alloc(8);
  const fd = await fs.open(deskRes.raw_path, "r");
  await fd.read(headerBuf, 0, 8, 0);
  await fd.close();
  const isPng = headerBuf[0] === 0x89 && headerBuf[1] === 0x50 && headerBuf[2] === 0x4E && headerBuf[3] === 0x47;
  assert(isPng, "Cabecera PNG real (0x89 0x50 0x4E 0x47) confirmada sin simulación");

  // ── TEST 6: screenshot.app (captura de app real sin robar foco) ────────────
  const targetApp = detectRes.fl_running ? "FL64" : "explorer";
  console.log(`\n[6/7] Verificando screenshot.app (captura de ${targetApp} sin robar foco)...`);
  const appRes = await router.execute({
    tool: "screenshot",
    action: "app",
    args: { process_name: targetApp, revealPath: true },
  });
  assert(appRes.ok === true, `screenshot.app retornó ok: true para ${targetApp}`);
  assert(appRes.mode === "app", "Modo app verificado");
  assert(existsSync(appRes.raw_path), `Archivo de ventana creado: ${appRes.raw_path}`);
  assert(appRes.size_bytes > 500, `Tamaño de captura de app válido: ${appRes.size_bytes} bytes`);
  console.log(`     Motor utilizado: ${appRes.engine}, Dimensiones: ${appRes.dimensions.width}x${appRes.dimensions.height}`);

  // ── TEST 7: Delegación desde system.mjs y Auditoría Forense ───────────────
  console.log("\n[7/7] Verificando delegación desde system y audit log...");
  const sysRes = await router.execute({
    tool: "system",
    action: "capture_screen",
    args: { revealPath: true },
  });
  assert(sysRes.ok === true, "system.capture_screen delega exitosamente a screenshot");

  const auditFile = path.join(runtime.dirs.logs, "audit.jsonl");
  assert(existsSync(auditFile), "Archivo audit.jsonl existe físicamente");
  const auditContent = await fs.readFile(auditFile, "utf8");
  assert(auditContent.includes("screenshot"), "audit.jsonl contiene entradas registradas para 'screenshot'");

  console.log("==================================================");
  console.log(`🎉 TODOS LOS TESTS PASARON EXITOSAMENTE (${passed}/${total})`);
  console.log("==================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Error crítico en test suite:", err);
  process.exit(1);
});
