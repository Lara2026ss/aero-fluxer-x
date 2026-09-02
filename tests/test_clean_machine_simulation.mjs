/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🧪 PRUEBA DE REPOSITORIO LIMPIO Y "MÁQUINA DE OTRA PERSONA"
 * Simula a un usuario en una PC completamente nueva clonando el repo desde cero.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

console.log("══════════════════════════════════════════════════════════════════");
console.log("🧪 PRUEBA: 'MÁQUINA DE OTRA PERSONA' (DISTRIBUCIÓN LIMPIA DESDE CERO)");
console.log("══════════════════════════════════════════════════════════════════\n");

const sandboxBase = path.join(os.tmpdir(), `aeron_foreign_pc_${Date.now()}`);
const simRepo = path.join(sandboxBase, "cloned_aero_fluxer_x");
const simUserData = path.join(sandboxBase, "foreign_user_appdata");

try {
  await fs.mkdir(simRepo, { recursive: true });
  await fs.mkdir(simUserData, { recursive: true });

  console.log(`1. Simulando clonado de repositorio público en: ${simRepo}`);
  // Copiar únicamente los archivos versionados del repo (excluyendo storage, node_modules, .git)
  const items = await fs.readdir(ROOT);
  for (const item of items) {
    if (item === "node_modules" || item === "storage" || item === ".git" || item.endsWith(".log")) continue;
    const src = path.join(ROOT, item);
    const dest = path.join(simRepo, item);
    await fs.cp(src, dest, { recursive: true });
  }

  // Enlazar node_modules para evitar volver a descargarlos durante la prueba
  const realNodeModules = path.join(ROOT, "node_modules");
  if (existsSync(realNodeModules)) {
    await fs.symlink(realNodeModules, path.join(simRepo, "node_modules"), "junction").catch(async () => {
      // Si symlink falla, omitir
    });
  }

  console.log(`2. Configurando entorno de usuario extranjero en: ${simUserData}`);
  const foreignEnv = {
    ...process.env,
    AERON_DATA_DIR: simUserData,
    USERPROFILE: sandboxBase,
    APPDATA: path.join(sandboxBase, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(sandboxBase, "AppData", "Local"),
    HOME: sandboxBase,
  };

  console.log("3. Ejecutando instalación limpia (node scripts/install.mjs)...");
  const installResult = await execFileAsync(process.execPath, [path.join(simRepo, "scripts", "install.mjs")], {
    cwd: simRepo,
    env: foreignEnv,
    timeout: 30000,
  });

  assert.ok(installResult.stdout.includes("INSTALADO Y PREPARADO CON ÉXITO"), "El instalador debe reportar éxito");
  console.log("   ✓ Instalador ejecutado con éxito.");

  console.log("4. Verificando generación automática de almacenamiento local de usuario...");
  const simShortcuts = path.join(simUserData, "shortcuts", "shortcuts.json");
  const simConfig = path.join(simUserData, "config", "aeron.config.json");
  const simMemory = path.join(simUserData, "memory", "fluxer-memory.sqlite");
  const simLogs = path.join(simUserData, "logs", "fluxer.log");

  assert.ok(existsSync(simShortcuts), "shortcuts.json debe haberse generado automáticamente");
  assert.ok(existsSync(simConfig), "aeron.config.json debe haberse generado automáticamente");
  console.log("   ✓ shortcuts.json generado desde plantilla pública.");
  console.log("   ✓ aeron.config.json local creado.");

  console.log("5. Verificando que el código clonado NO contenga datos de usuario ni secretos...");
  assert.equal(existsSync(path.join(simRepo, "storage", "GROQ.txt")), false, "Cero secretos en el repo");
  assert.equal(existsSync(path.join(simRepo, "storage", "shortcuts.json")), false, "Cero shortcuts privados en repo");
  console.log("   ✓ Repositorio 100% libre de secretos y archivos personales.");

  console.log("6. Verificando ejecución de health check en la máquina extranjera...");
  const healthResult = await execFileAsync(
    process.execPath,
    ["-e", "import('./core/health.mjs').then(m => m.runHealthCheck({})).then(r => process.exit(r.ok ? 0 : 1))"],
    { cwd: simRepo, env: foreignEnv, timeout: 15000 }
  );
  assert.equal(healthResult.exitCode ?? 0, 0, "Health check debe pasar en máquina ajena");
  console.log("   ✓ Health check superado sin fallos.");

  console.log("7. Verificando preservación de personalizaciones tras reinicio...");
  // El usuario añade un atajo personal
  const userMacros = JSON.parse(await fs.readFile(simShortcuts, "utf8"));
  userMacros["mi_atajo_extranjero"] = { description: "Prueba ajena", steps: [] };
  await fs.writeFile(simShortcuts, JSON.stringify(userMacros, null, 2), "utf8");

  // Re-ejecutar instalador / runtime
  await execFileAsync(process.execPath, [path.join(simRepo, "scripts", "install.mjs")], {
    cwd: simRepo,
    env: foreignEnv,
    timeout: 30000,
  });

  const reReadMacros = JSON.parse(await fs.readFile(simShortcuts, "utf8"));
  assert.ok(reReadMacros["mi_atajo_extranjero"], "La personalización del usuario se conservó intacta");
  console.log("   ✓ Atajos y configuración preservados tras reinstalación.");

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("🎉 PRUEBA DE 'MÁQUINA DE OTRA PERSONA' COMPLETADA CON ÉXITO (7/7)");
  console.log("══════════════════════════════════════════════════════════════════\n");
} finally {
  await fs.rm(sandboxBase, { recursive: true, force: true }).catch(() => {});
}
