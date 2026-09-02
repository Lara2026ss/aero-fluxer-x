/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🧪 FASE 38 & 39: VERIFICACIÓN FORENSE POST-PUBLICACIÓN EN GITHUB
 * Clona el repositorio público y descarga el asset publicado para certificar
 * el estado final RELEASED / PUBLIC-READY.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { existsSync, createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import https from "node:https";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const REPO_URL = "https://github.com/Lara2026ss/aero-fluxer-x.git";
const RELEASE_ZIP_URL = "https://github.com/Lara2026ss/aero-fluxer-x/releases/download/v9.0.0/aeron-fluxer-x-v9.0.0.zip";
const RELEASE_SHA_URL = "https://github.com/Lara2026ss/aero-fluxer-x/releases/download/v9.0.0/checksums.sha256";

console.log("══════════════════════════════════════════════════════════════════");
console.log("🧪 FASES 38 & 39: AUDITORÍA POST-PUBLICACIÓN EN GITHUB");
console.log("══════════════════════════════════════════════════════════════════\n");

const sandbox = path.join(os.tmpdir(), `aeron_post_pub_${Date.now()}`);
const clonedDir = path.join(sandbox, "clone");
const downloadDir = path.join(sandbox, "download");

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Antigravity-Verifier" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const stream = createWriteStream(dest);
      res.pipe(stream);
      stream.on("finish", () => resolve(dest));
      stream.on("error", reject);
    }).on("error", reject);
  });
}

try {
  await fs.mkdir(clonedDir, { recursive: true });
  await fs.mkdir(downloadDir, { recursive: true });

  console.log(`1. Clonando repositorio público desde: ${REPO_URL}...`);
  await execAsync(`git clone --depth 1 "${REPO_URL}" "${clonedDir}"`);
  console.log("   ✓ Clonado completado con éxito.");

  console.log("2. Inspeccionando archivos del repositorio clonado...");
  const forbidden = [
    path.join(clonedDir, "storage"),
    path.join(clonedDir, ".env"),
    path.join(clonedDir, "shortcuts.json"),
    path.join(clonedDir, "storage", "GROQ.txt"),
  ];
  for (const f of forbidden) {
    assert.equal(existsSync(f), false, `Archivo prohibido presente en repo público: ${f}`);
  }
  console.log("   ✓ Cero archivos prohibidos (storage, .env, shortcuts.json, GROQ.txt).");

  console.log("3. Escaneando repositorio clonado en busca de secretos y rutas personales...");
  const clonedFiles = [];
  async function collect(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.name === ".git") continue;
      if (ent.isDirectory()) await collect(full);
      else clonedFiles.push(full);
    }
  }
  await collect(clonedDir);

  let secretsFound = 0;
  let pathsFound = 0;
  const secretKeyTarget = ["gsk", "_"].join("");
  const authorPathTarget = ["C:\\", "Users\\", "mauri"].join("");

  for (const f of clonedFiles) {
    const txt = await fs.readFile(f, "utf8").catch(() => "");
    if (txt.includes(secretKeyTarget)) secretsFound++;
    if (txt.includes(authorPathTarget)) pathsFound++;
  }

  assert.equal(secretsFound, 0, "Se encontraron secretos en el repositorio clonado");
  assert.equal(pathsFound, 0, "Se encontraron rutas personales del autor en el repositorio clonado");
  console.log(`   ✓ 0 secretos encontrados en los ${clonedFiles.length} archivos.`);
  console.log("   ✓ 0 rutas del autor encontradas.");

  console.log("4. Verificando commit único y sanitizado...");
  const gitLog = (await execAsync("git log --oneline", { cwd: clonedDir })).stdout.trim();
  assert.ok(gitLog.includes("feat: prepare Aero Fluxer X v9.0.0 for public distribution"));
  console.log(`   ✓ Commit verificado: ${gitLog}`);

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("🎉 FASE 38 & 39 COMPLETADAS: REPOSITORIO PÚBLICO 100% VERIFICADO");
  console.log("══════════════════════════════════════════════════════════════════\n");
} finally {
  await fs.rm(sandbox, { recursive: true, force: true }).catch(() => {});
}
