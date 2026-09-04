/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🧪 AERON FLUXER X — tests/test_distribution_and_updater.mjs
 * Suite Integral de Verificación de Distribución Pública, Versionado y Updater
 * ══════════════════════════════════════════════════════════════════════════════
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  CURRENT_VERSION,
  parseSemVer,
  compareSemVer,
  getDiffType,
  checkUpdateEligibility,
  getVersion,
  getVersionInfo,
} from "../core/version.mjs";

import {
  resolveUserDataDir,
  getStorageStructure,
  ensureUserDataInitialized,
} from "../core/storage-paths.mjs";

import {
  computeFileSha256,
  createCodeBackup,
  executeRollback,
  verifyCodeSyntax,
  listAvailableBackups,
} from "../core/updater.mjs";

import { runHealthCheck } from "../core/health.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

console.log("══════════════════════════════════════════════════════════════════");
console.log("🧪 INICIANDO SUITE DE TESTS: DISTRIBUCIÓN PÚBLICA & UPDATER");
console.log("══════════════════════════════════════════════════════════════════\n");

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  process.stdout.write(`  [TEST ${totalTests}] ${name} ... `);
  try {
    await fn();
    console.log("✅ PASS");
    passedTests++;
  } catch (err) {
    console.log("❌ FAIL");
    console.error(`       └─ ${err.message}`);
    if (err.stack) {
      console.error(`       ${err.stack.split("\n")[1]}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Tests de Versionado SemVer
// ─────────────────────────────────────────────────────────────────────────────

await runTest("SemVer — Validación de formato y parseo de versión actual", async () => {
  const vInfo = getVersionInfo();
  assert.equal(vInfo.version, CURRENT_VERSION);
  assert.ok(vInfo.parsed, "El parseo SemVer no debe ser nulo");
  assert.equal(typeof vInfo.parsed.major, "number");
  assert.equal(typeof vInfo.parsed.minor, "number");
  assert.equal(typeof vInfo.parsed.patch, "number");
});

await runTest("SemVer — Comparación lógica de versiones", async () => {
  assert.equal(compareSemVer("9.0.0", "9.0.1"), -1);
  assert.equal(compareSemVer("9.1.0", "9.0.5"), 1);
  assert.equal(compareSemVer("9.0.0", "9.0.0"), 0);
  assert.equal(compareSemVer("10.0.0", "9.9.9"), 1);
  assert.equal(compareSemVer("9.0.0-beta.1", "9.0.0"), -1);
});

await runTest("SemVer — Detección de tipos de diferencia", async () => {
  assert.equal(getDiffType("9.0.0", "9.0.1"), "patch");
  assert.equal(getDiffType("9.0.0", "9.1.0"), "minor");
  assert.equal(getDiffType("9.0.0", "10.0.0"), "major");
  assert.equal(getDiffType("9.0.0", "9.0.0"), "none");
  assert.equal(getDiffType("9.0.1", "9.0.0"), "downgrade");
});

await runTest("SemVer — Prevención estricta de Downgrades accidentales", async () => {
  const blocked = checkUpdateEligibility("9.1.0", "9.0.0");
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.isDowngrade, true);
  assert.ok(blocked.reason.includes("Downgrade bloqueado"));

  const forced = checkUpdateEligibility("9.1.0", "9.0.0", { allowDowngrade: true });
  assert.equal(forced.eligible, true);
  assert.equal(forced.isDowngrade, true);
});

await runTest("SemVer — Detección de versión ya actualizada", async () => {
  const check = checkUpdateEligibility("9.0.0", "9.0.0");
  assert.equal(check.eligible, false);
  assert.equal(check.diffType, "none");
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Tests de Aislamiento de Almacenamiento y Rutas
// ─────────────────────────────────────────────────────────────────────────────

await runTest("Storage — Resolución de rutas fuera del repositorio", async () => {
  const userDir = resolveUserDataDir();
  assert.ok(userDir && userDir.length > 0);
  assert.notEqual(path.resolve(userDir), path.resolve(ROOT), "El directorio de datos no debe ser la raíz del repo");

  const structure = getStorageStructure(ROOT);
  assert.ok(structure.base.includes("FluxerX") || structure.base.includes("fluxer-x") || structure.base.includes("AeroFluxerX") || structure.base.includes("aero-fluxer-x"));
  assert.ok(structure.shortcutsFile.endsWith("shortcuts.json"));
  assert.ok(structure.memoryDb.endsWith("fluxer-memory.sqlite"));
  assert.ok(structure.mainLog.endsWith("fluxer.log"));
});

await runTest("Storage — Inicialización y preservación de shortcuts locales", async () => {
  // Simular directorio de datos temporal aislado
  const tempUserDir = path.join(os.tmpdir(), `aeron_test_user_${Date.now()}`);
  process.env.AERON_DATA_DIR = tempUserDir;

  try {
    const initialized = await ensureUserDataInitialized(ROOT);
    assert.ok(existsSync(initialized.base));
    assert.ok(existsSync(initialized.shortcutsFile), "shortcuts.json debe ser creado automáticamente");

    const raw = await fs.readFile(initialized.shortcutsFile, "utf8");
    const parsed = JSON.parse(raw);
    assert.ok(Object.keys(parsed).length > 0, "shortcuts.json no debe estar vacío");

    // Probar que una segunda inicialización preserva las macros del usuario
    parsed["mi_macro_personalizada"] = { description: "Macro de prueba", steps: [] };
    await fs.writeFile(initialized.shortcutsFile, JSON.stringify(parsed, null, 2), "utf8");

    await ensureUserDataInitialized(ROOT);
    const reRead = JSON.parse(await fs.readFile(initialized.shortcutsFile, "utf8"));
    assert.ok(reRead["mi_macro_personalizada"], "La macro personalizada del usuario debe sobrevivir a reinicializaciones");
  } finally {
    delete process.env.AERON_DATA_DIR;
    await fs.rm(tempUserDir, { recursive: true, force: true }).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Tests de Descontaminación del Repositorio
// ─────────────────────────────────────────────────────────────────────────────

await runTest("Repo — Cero archivos sensibles en almacenamiento local del repo", async () => {
  const sensitiveFiles = [
    path.join(ROOT, "storage", "GROQ.txt"),
    path.join(ROOT, "storage", "Executive_Summary.pdf"),
    path.join(ROOT, "storage", "System_Audit_Report.docx"),
    path.join(ROOT, "novarito"),
    path.join(ROOT, "config", "mcp-schemas", "${name}.json"),
  ];

  for (const f of sensitiveFiles) {
    assert.equal(existsSync(f), false, `Archivo prohibido detectado en repo: ${f}`);
  }
});

await runTest("Repo — Existencia de plantillas públicas requeridas", async () => {
  assert.ok(existsSync(path.join(ROOT, "shortcuts.example.json")), "shortcuts.example.json debe existir");
  assert.ok(existsSync(path.join(ROOT, "aeron.config.example.json")), "aeron.config.example.json debe existir");
  assert.ok(existsSync(path.join(ROOT, ".env.example")), ".env.example debe existir");
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Tests del Motor de Actualización (Backup, Checksum, Rollback)
// ─────────────────────────────────────────────────────────────────────────────

await runTest("Updater — Verificación Criptográfica de Checksum SHA-256", async () => {
  const tempFile = path.join(os.tmpdir(), `sha_test_${Date.now()}.txt`);
  const content = "Aeron Fluxer X Secure Update Payload Verification";
  await fs.writeFile(tempFile, content, "utf8");

  try {
    const computed = await computeFileSha256(tempFile);
    const expected = crypto.createHash("sha256").update(content).digest("hex").toLowerCase();
    assert.equal(computed, expected, "El hash SHA-256 calculado debe coincidir exactamente");
  } finally {
    await fs.rm(tempFile, { force: true });
  }
});

await runTest("Updater — Creación de Backup preventivo de código", async () => {
  const tempUserDir = path.join(os.tmpdir(), `aeron_backup_test_${Date.now()}`);
  process.env.AERON_DATA_DIR = tempUserDir;

  try {
    const backup = await createCodeBackup(ROOT, "9.0.0");
    assert.ok(existsSync(backup.backupDir), "El directorio de backup debe existir");
    assert.ok(backup.filesCount > 5, "Debe haber respaldado los componentes clave");

    const manifestPath = path.join(backup.backupDir, "backup-manifest.json");
    assert.ok(existsSync(manifestPath), "El manifiesto de backup debe existir");

    const backupsList = await listAvailableBackups(ROOT);
    assert.ok(backupsList.backups.some((b) => b.backupId === backup.backupId));
  } finally {
    delete process.env.AERON_DATA_DIR;
    await fs.rm(tempUserDir, { recursive: true, force: true }).catch(() => {});
  }
});

await runTest("Updater — Mecanismo de Rollback ante fallo inducido", async () => {
  // Crear un entorno de simulación aislado para probar rollback
  const simRepo = path.join(os.tmpdir(), `aeron_sim_repo_${Date.now()}`);
  const simBackup = path.join(os.tmpdir(), `aeron_sim_backup_${Date.now()}`);

  await fs.mkdir(simRepo, { recursive: true });
  await fs.mkdir(simBackup, { recursive: true });

  try {
    // 1. Estado original del código
    const originalFile = path.join(simBackup, "version.txt");
    await fs.writeFile(originalFile, "v9.0.0-original", "utf8");

    // 2. Simular que el repo fue modificado y quedó corrupto
    await fs.writeFile(path.join(simRepo, "version.txt"), "v9.1.0-corrupto", "utf8");
    await fs.writeFile(path.join(simRepo, "broken_file.js"), "const broken =", "utf8");

    // 3. Ejecutar Rollback restaurando desde el backup
    const rollbackRes = await executeRollback(simBackup, simRepo);
    assert.equal(rollbackRes.ok, true, "El rollback debe reportar éxito");

    // 4. Verificar que se restauró el contenido original
    const restoredContent = await fs.readFile(path.join(simRepo, "version.txt"), "utf8");
    assert.equal(restoredContent, "v9.0.0-original", "El archivo debe haber sido restaurado a su estado original");
  } finally {
    await fs.rm(simRepo, { recursive: true, force: true }).catch(() => {});
    await fs.rm(simBackup, { recursive: true, force: true }).catch(() => {});
  }
});

await runTest("Updater — Verificación previa de sintaxis de código", async () => {
  const syntaxCheck = await verifyCodeSyntax(ROOT);
  assert.equal(syntaxCheck.ok, true, "La verificación de sintaxis de archivos clave debe pasar");
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Test del Auto-Diagnóstico (Health Check)
// ─────────────────────────────────────────────────────────────────────────────

await runTest("Health Check — Diferenciación PASS / WARN / FAIL / NOT_APPLICABLE", async () => {
  const result = await runHealthCheck();
  assert.equal(typeof result.ok, "boolean");
  assert.ok(result.statusSummary.PASS > 0, "Debe registrar comprobaciones en PASS");
  assert.equal(result.statusSummary.FAIL, 0, "No debe haber fallos críticos en repositorios limpios");

  const allowedStatuses = new Set(["PASS", "WARN", "FAIL", "NOT_APPLICABLE"]);
  for (const c of result.checks) {
    assert.ok(allowedStatuses.has(c.status), `Estado inválido: ${c.status} en chequeo ${c.name}`);
  }
});

console.log("\n══════════════════════════════════════════════════════════════════");
console.log(`📊 RESULTADO FINAL: ${passedTests}/${totalTests} TESTS PASADOS`);
console.log("══════════════════════════════════════════════════════════════════\n");

if (passedTests !== totalTests) {
  process.exit(1);
}
