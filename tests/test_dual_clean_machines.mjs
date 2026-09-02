/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🧪 PRUEBA FASE 30: SIMULACIÓN DE CLEAN MACHINE #1 Y CLEAN MACHINE #2
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
console.log("🧪 FASE 30: PRUEBA DUAL DE TERCEROS (CLEAN MACHINE #1 Y #2)");
console.log("══════════════════════════════════════════════════════════════════\n");

async function runMachineLifecycle(machineName, customShortcutName) {
  console.log(`▶ Iniciando ciclo de vida para: ${machineName}...`);
  const baseTemp = path.join(os.tmpdir(), `aeron_${machineName.toLowerCase()}_${Date.now()}`);
  const repoDir = path.join(baseTemp, "repo");
  const userDataDir = path.join(baseTemp, "user_data");

  try {
    await fs.mkdir(repoDir, { recursive: true });
    await fs.mkdir(userDataDir, { recursive: true });

    // Copiar archivos del repositorio (excluyendo storage, .git, node_modules)
    const items = await fs.readdir(ROOT);
    for (const item of items) {
      if (item === "node_modules" || item === "storage" || item === ".git" || item.endsWith(".log") || item === "dist") continue;
      await fs.cp(path.join(ROOT, item), path.join(repoDir, item), { recursive: true });
    }

    // Enlazar node_modules
    const realNodeModules = path.join(ROOT, "node_modules");
    if (existsSync(realNodeModules)) {
      await fs.symlink(realNodeModules, path.join(repoDir, "node_modules"), "junction").catch(() => {});
    }

    const machineEnv = {
      ...process.env,
      AERON_DATA_DIR: userDataDir,
      USERPROFILE: baseTemp,
      APPDATA: path.join(baseTemp, "AppData", "Roaming"),
      HOME: baseTemp,
    };

    // 1. Instalar limpiamente
    const installRes = await execFileAsync(process.execPath, [path.join(repoDir, "scripts", "install.mjs")], {
      cwd: repoDir,
      env: machineEnv,
      timeout: 30000,
    });
    assert.ok(installRes.stdout.includes("INSTALADO Y PREPARADO CON ÉXITO"), `${machineName}: Instalador falló`);
    console.log(`  [${machineName}] ✓ Instalación limpia: OK`);

    // 2. Crear shortcut personalizado
    const shortcutsPath = path.join(userDataDir, "shortcuts", "shortcuts.json");
    assert.ok(existsSync(shortcutsPath), `${machineName}: shortcuts.json no fue creado`);
    const sc = JSON.parse(await fs.readFile(shortcutsPath, "utf8"));
    sc[customShortcutName] = { description: `Shortcut de ${machineName}`, steps: ["echo test"] };
    await fs.writeFile(shortcutsPath, JSON.stringify(sc, null, 2), "utf8");
    console.log(`  [${machineName}] ✓ Shortcut personalizado creado: ${customShortcutName}`);

    // 3. Ejecutar herramienta MCP real
    const toolRes = await execFileAsync(
      process.execPath,
      [
        "-e",
        "import('./core/runtime.mjs').then(async ({ createRuntime }) => { const { Registry } = await import('./core/registry.mjs'); const { Router } = await import('./core/router.mjs'); const runtime = await createRuntime({ root: process.cwd() }); const registry = new Registry(runtime); await registry.load(); const router = new Router({ runtime, registry }); const sysInfo = await router.execute('system', 'get_system_info', {}); if (!sysInfo.ok) process.exit(1); console.log('SYSTEM_INFO_OK'); process.exit(0); });",
      ],
      { cwd: repoDir, env: machineEnv, timeout: 15000 }
    );
    assert.ok(toolRes.stdout.includes("SYSTEM_INFO_OK"), `${machineName}: Ejecución de herramienta MCP falló`);
    console.log(`  [${machineName}] ✓ Ejecución de herramienta MCP: OK`);

    // 4. Simular actualización y reinicio
    await execFileAsync(process.execPath, [path.join(repoDir, "scripts", "install.mjs")], {
      cwd: repoDir,
      env: machineEnv,
      timeout: 30000,
    });

    // 5. Verificar persistencia de configuración y shortcuts
    const scAfter = JSON.parse(await fs.readFile(shortcutsPath, "utf8"));
    assert.ok(scAfter[customShortcutName], `${machineName}: Shortcut personalizado se perdió tras reinicio/actualización`);
    console.log(`  [${machineName}] ✓ Persistencia de datos tras reinicio: OK`);

    console.log(`✅ [${machineName}] CICLO COMPLETO PASS\n`);
    return true;
  } finally {
    await fs.rm(baseTemp, { recursive: true, force: true }).catch(() => {});
  }
}

await runMachineLifecycle("CLEAN_MACHINE_1", "SHORTCUT_USUARIO_1");
await runMachineLifecycle("CLEAN_MACHINE_2", "SHORTCUT_USUARIO_2");

console.log("══════════════════════════════════════════════════════════════════");
console.log("🎉 RESULTADO FASE 30: PASS EN CLEAN MACHINE #1 Y #2");
console.log("══════════════════════════════════════════════════════════════════\n");
