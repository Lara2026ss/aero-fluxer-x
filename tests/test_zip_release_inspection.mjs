/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🧪 INSPECCIÓN FORENSE Y PRUEBA DE ARTEFACTO ZIP DE DISTRIBUCIÓN
 * Descomprime dist/aeron-fluxer-x-v9.0.0.zip y verifica ausencia de secretos,
 * rutas del autor y funcionamiento autónomo completo.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const candidateZips = [
  path.join(ROOT, "dist", "fluxer-x-v9.2.5.zip"),
  path.join(ROOT, "dist", "fluxer-x-v9.2.0.zip"),
  path.join(ROOT, "dist", "aeron-fluxer-x-v9.2.0.zip"),
  path.join(ROOT, "dist", "aeron-fluxer-x-v9.0.0.zip"),
];
const ZIP_PATH = candidateZips.find(p => existsSync(p)) || candidateZips[0];

console.log("══════════════════════════════════════════════════════════════════");
console.log("🧪 FASE 23: INSPECCIÓN FORENSE DEL RELEASE ZIP");
console.log("══════════════════════════════════════════════════════════════════\n");

assert.ok(existsSync(ZIP_PATH), `El archivo ZIP no existe en: ${ZIP_PATH}`);

const sandbox = path.join(os.tmpdir(), `aeron_zip_sandbox_${Date.now()}`);
const zipExtractedDir = path.join(sandbox, "extracted");
const isolatedUserData = path.join(sandbox, "user_appdata");

try {
  await fs.mkdir(zipExtractedDir, { recursive: true });
  await fs.mkdir(isolatedUserData, { recursive: true });

  console.log(`1. Extrayendo ZIP en sandbox aislado: ${zipExtractedDir}...`);
  const isWin = process.platform === "win32";
  if (isWin) {
    await execAsync(`powershell -NoProfile -NonInteractive -Command "Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${zipExtractedDir}' -Force"`);
  } else {
    await execAsync(`unzip -q -o "${ZIP_PATH}" -d "${zipExtractedDir}"`);
  }

  console.log("2. Verificando ausencia de archivos prohibidos en el ZIP...");
  const forbidden = [
    path.join(zipExtractedDir, ".git"),
    path.join(zipExtractedDir, "storage"),
    path.join(zipExtractedDir, ".env"),
    path.join(zipExtractedDir, "shortcuts.json"),
    path.join(zipExtractedDir, "storage", "GROQ.txt"),
    path.join(zipExtractedDir, "node_modules"),
  ];

  for (const f of forbidden) {
    assert.equal(existsSync(f), false, `Archivo o directorio prohibido detectado en el ZIP: ${f}`);
  }
  console.log("   ✓ Ningún archivo prohibido (.git, storage, .env, shortcuts.json, node_modules) en el ZIP.");

  console.log("3. Escaneando todos los archivos extraídos en busca de secretos y rutas del autor...");
  const extractedFiles = [];
  async function collectFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await collectFiles(full);
      } else {
        extractedFiles.push(full);
      }
    }
  }
  await collectFiles(zipExtractedDir);

  let gskFound = 0;
  let authorPathFound = 0;
  const secretKeyTarget = ["gsk", "_"].join("");
  const authorPathTarget = ["C:\\", "Users\\", "mauri"].join("");

  for (const f of extractedFiles) {
    const content = await fs.readFile(f, "utf8").catch(() => "");
    if (content.includes(secretKeyTarget)) gskFound++;
    if (content.includes(authorPathTarget)) authorPathFound++;
  }

  assert.equal(gskFound, 0, "Se detectó patrón de API key en el ZIP");
  assert.equal(authorPathFound, 0, "Se detectó ruta del autor en el ZIP");
  console.log(`   ✓ 0 secretos encontrados en los ${extractedFiles.length} archivos del ZIP.`);
  console.log("   ✓ 0 rutas del autor encontradas en el ZIP.");

  console.log("4. Enlazando node_modules de prueba para ejecutar instalación del ZIP...");
  const realNodeModules = path.join(ROOT, "node_modules");
  if (existsSync(realNodeModules)) {
    await fs.symlink(realNodeModules, path.join(zipExtractedDir, "node_modules"), "junction").catch(() => {});
  }

  const env = {
    ...process.env,
    AERON_DATA_DIR: isolatedUserData,
    USERPROFILE: sandbox,
    APPDATA: path.join(sandbox, "AppData", "Roaming"),
  };

  console.log("5. Ejecutando scripts/install.mjs desde el contenido del ZIP...");
  const installRun = await execFileAsync(process.execPath, [path.join(zipExtractedDir, "scripts", "install.mjs")], {
    cwd: zipExtractedDir,
    env,
    timeout: 30000,
  });
  assert.ok(installRun.stdout.includes("INSTALADO Y PREPARADO CON ÉXITO"));
  console.log("   ✓ Instalador ejecutado con éxito desde el artefacto empaquetado.");

  console.log("6. Ejecutando doctor.mjs --quick desde el contenido del ZIP...");
  const doctorRun = await execFileAsync(process.execPath, [path.join(zipExtractedDir, "doctor.mjs"), "--quick"], {
    cwd: zipExtractedDir,
    env,
    timeout: 30000,
  });
  assert.ok(doctorRun.stdout.includes("OPERATIVO Y VERIFICADO"));
  console.log("   ✓ Doctor ejecutado y validado desde el artefacto ZIP.");

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("🎉 CERTIFICACIÓN DE ARTEFACTO ZIP: PASS (100% LIMPIO Y FUNCIONAL)");
  console.log("══════════════════════════════════════════════════════════════════\n");
} finally {
  await fs.rm(sandbox, { recursive: true, force: true }).catch(() => {});
}
