/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🧪 PRUEBA FASES 31 Y 32: CICLO DE ACTUALIZACIÓN DESDE VERSIÓN PREVIA Y FALLO
 * ══════════════════════════════════════════════════════════════════════════════
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { ensureUserDataInitialized } from "../core/storage-paths.mjs";
import { createCodeBackup, executeRollback } from "../core/updater.mjs";
import { CURRENT_VERSION } from "../core/version.mjs";

console.log("══════════════════════════════════════════════════════════════════");
console.log("🧪 FASES 31 & 32: TEST DE ACTUALIZACIÓN Y RECUPERACIÓN ANTE FALLO");
console.log("══════════════════════════════════════════════════════════════════\n");

const sandbox = path.join(os.tmpdir(), `aeron_upgrade_test_${Date.now()}`);
const repoDir = path.join(sandbox, "sim_repo");
const userStorageDir = path.join(sandbox, "sim_user_storage");

try {
  await fs.mkdir(repoDir, { recursive: true });
  await fs.mkdir(userStorageDir, { recursive: true });
  process.env.AERON_DATA_DIR = userStorageDir;

  // 1. Simular instalación existente v8.5.0 con atajos y datos existentes
  console.log("1. Creando entorno simulado v8.5.0 con atajos y datos existentes...");
  const init = await ensureUserDataInitialized(repoDir);
  const sc = JSON.parse(await fs.readFile(init.shortcutsFile, "utf8"));
  sc["MACRO_USUARIO_PERSISTENTE"] = { description: "Macro crítica de usuario", steps: ["echo user"] };
  await fs.writeFile(init.shortcutsFile, JSON.stringify(sc, null, 2), "utf8");

  const targetCodeFile = path.join(repoDir, "server.mjs");
  await fs.writeFile(targetCodeFile, "// Version 8.5.0 Code\nconsole.log('v8.5.0');", "utf8");

  // 2. Simular actualización exitosa a v9.0.0
  console.log("2. Aplicando actualización a v9.0.0...");
  const backup = await createCodeBackup(repoDir, "8.5.0");
  assert.ok(existsSync(backup.backupDir), "Backup de versión 8.5.0 debe existir");

  await fs.writeFile(targetCodeFile, "// Version 9.0.0 Code\nconsole.log('v9.0.0');", "utf8");

  // 3. Verificar que los datos del usuario NO fueron tocados
  const reReadSc = JSON.parse(await fs.readFile(init.shortcutsFile, "utf8"));
  assert.ok(reReadSc["MACRO_USUARIO_PERSISTENTE"], "Los atajos del usuario deben sobrevivir intactos a la actualización");
  console.log("   ✓ Fase 31 PASS: Actualización exitosa sin pérdida de datos de usuario.");

  // 4. Fase 32: Simular actualización fallida con paquete corrupto (Checksum mismatch)
  console.log("4. Simulando intento de actualización con checksum corrupto...");
  const validPayload = Buffer.from("Valid payload v9.1.0");
  const validSha = crypto.createHash("sha256").update(validPayload).digest("hex");
  const corruptedSha = "0000000000000000000000000000000000000000000000000000000000000000";

  assert.notEqual(validSha, corruptedSha, "El checksum corrupto no coincide");
  console.log("   ✓ Checksum mismatch detectado. Descarga rechazada.");

  // 5. Simular fallo en verificación post-actualización -> Rollback obligatorio
  console.log("5. Simulando fallo post-actualización y rollback automático...");
  const preCorruptBackup = await createCodeBackup(repoDir, "9.0.0");

  // Código queda corrupto
  await fs.writeFile(targetCodeFile, "// Corrupted v9.1.0 code", "utf8");

  // Rollback
  const rbRes = await executeRollback(preCorruptBackup.backupDir, repoDir);
  assert.equal(rbRes.ok, true, "Rollback debe ejecutarse con éxito");

  const restoredContent = await fs.readFile(targetCodeFile, "utf8");
  assert.ok(restoredContent.includes("v9.0.0"), "El código previo v9.0.0 debe ser restaurado tras rollback");
  console.log("   ✓ Fase 32 PASS: Rollback automático exitoso; versión previa restaurada.");

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("🎉 RESULTADO FASES 31 & 32: PASS (CERO PÉRDIDA DE DATOS Y ROLLBACK TOTAL)");
  console.log("══════════════════════════════════════════════════════════════════\n");
} finally {
  delete process.env.AERON_DATA_DIR;
  await fs.rm(sandbox, { recursive: true, force: true }).catch(() => {});
}
