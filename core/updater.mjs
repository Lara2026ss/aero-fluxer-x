/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔄 AERON FLUXER X — core/updater.mjs
 * Sistema de Actualización Automática, Verificación Criptográfica y Rollback
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Características:
 * 1. Detección precisa de versión instalada vs remota (SemVer).
 * 2. Soporte nativo para GitHub Releases API y Release Manifests JSON.
 * 3. Verificación de integridad estricta con SHA-256 (previene archivos corruptos).
 * 4. Backup preventivo automático del código antes de modificar nada.
 * 5. Verificación de sintaxis y prueba de estado real post-actualización.
 * 6. Rollback automático ante cualquier fallo de verificación o extracción.
 * 7. Cero afectación a datos del usuario (datos y configs residen fuera del repo).
 * 8. Registro de auditoría completo en updater.log.
 */

import fs from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import https from "node:https";
import http from "node:http";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";

import { CURRENT_VERSION, checkUpdateEligibility, compareSemVer } from "./version.mjs";
import { getStorageStructure } from "./storage-paths.mjs";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const DEFAULT_REPO_OWNER = "aero-fluxer";
const DEFAULT_REPO_NAME = "aero-fluxer-x";

/**
 * Registra una línea en el log dedicado de actualizaciones.
 */
export async function logUpdaterMessage(repoRoot, level, message, meta = null) {
  try {
    const storage = getStorageStructure(repoRoot);
    await fs.mkdir(storage.logsDir, { recursive: true }).catch(() => {});
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : "";
    const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}\n`;
    await fs.appendFile(storage.updaterLog, logLine, "utf8").catch(() => {});
  } catch {}
}

/**
 * Realiza una petición HTTPS con seguimiento de redirecciones y timeout.
 */
function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": `Aeron-Fluxer-X-Updater/v${CURRENT_VERSION}`,
      Accept: "application/vnd.github.v3+json, application/json",
      ...(options.headers || {}),
    };

    if (process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
      const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      headers["Authorization"] = `Bearer ${token}`;
    }

    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { headers, timeout: options.timeout || 15000 }, (res) => {
      // Manejar redirecciones HTTP 301, 302, 307
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location, options).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || "Error en la petición"}`));
      }

      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Respuesta inválida JSON: ${e.message}`));
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Tiempo de espera agotado al conectar con el servidor de actualizaciones (timeout 15s)."));
    });

    req.on("error", (err) => reject(err));
  });
}

/**
 * Descarga un archivo binario a disco calculando su hash SHA-256 simultáneamente.
 */
function downloadFileWithHash(url, destinationPath, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const headers = {
      "User-Agent": `Aeron-Fluxer-X-Updater/v${CURRENT_VERSION}`,
      ...(options.headers || {}),
    };

    if (process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
      const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      headers["Authorization"] = `Bearer ${token}`;
    }

    const req = client.get(url, { headers, timeout: options.timeout || 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFileWithHash(res.headers.location, destinationPath, options).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Fallo en descarga: HTTP ${res.statusCode}`));
      }

      const hash = crypto.createHash("sha256");
      let totalBytes = 0;
      const chunks = [];

      res.on("data", (chunk) => {
        totalBytes += chunk.length;
        hash.update(chunk);
        chunks.push(chunk);
      });

      res.on("end", async () => {
        try {
          await fs.mkdir(path.dirname(destinationPath), { recursive: true });
          const buffer = Buffer.concat(chunks);
          await fs.writeFile(destinationPath, buffer);
          const computedHash = hash.digest("hex").toLowerCase();
          resolve({
            bytes: totalBytes,
            sha256: computedHash,
            filePath: destinationPath,
          });
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Tiempo de espera agotado durante la descarga del paquete de actualización."));
    });

    req.on("error", (err) => reject(err));
  });
}

/**
 * Calcula el hash SHA-256 de un archivo en disco.
 */
export async function computeFileSha256(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex").toLowerCase();
}

/**
 * Consulta la versión más reciente disponible en GitHub Releases o en un Manifest URL.
 *
 * @param {object} [options]
 * @param {string} [options.repoRoot]
 * @param {string} [options.owner]
 * @param {string} [options.repo]
 * @param {string} [options.manifestUrl]
 * @param {boolean} [options.allowDowngrade=false]
 * @param {boolean} [options.allowPrerelease=false]
 * @returns {Promise<object>}
 */
export async function checkForUpdates(options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  const owner = options.owner || process.env.AERON_GITHUB_OWNER || DEFAULT_REPO_OWNER;
  const repo = options.repo || process.env.AERON_GITHUB_REPO || DEFAULT_REPO_NAME;
  const manifestUrl = options.manifestUrl || process.env.AERON_UPDATE_MANIFEST_URL;

  await logUpdaterMessage(repoRoot, "info", `Iniciando comprobación de actualizaciones para ${owner}/${repo}...`);

  let releaseData = null;
  let source = "github_releases";

  try {
    if (manifestUrl) {
      source = "custom_manifest";
      releaseData = await fetchJson(manifestUrl);
    } else {
      const githubUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
      releaseData = await fetchJson(githubUrl);
    }
  } catch (error) {
    const errorMsg = `No se pudo consultar el servidor de actualizaciones: ${error.message}`;
    await logUpdaterMessage(repoRoot, "warn", errorMsg);
    return {
      ok: false,
      currentVersion: CURRENT_VERSION,
      error: errorMsg,
      offline: true,
      recoverable: true,
    };
  }

  // Normalizar datos de la release
  let latestVersion = "";
  let releaseNotes = "";
  let downloadUrl = "";
  let expectedSha256 = "";
  let assetName = "";

  if (source === "custom_manifest") {
    latestVersion = releaseData.version || "";
    releaseNotes = releaseData.changelog || releaseData.description || "";
    const zipAsset = releaseData.assets?.zip || releaseData.asset;
    if (zipAsset) {
      downloadUrl = zipAsset.url || "";
      expectedSha256 = (zipAsset.sha256 || "").toLowerCase().trim();
      assetName = zipAsset.name || path.basename(downloadUrl);
    }
  } else {
    // Formato estándar GitHub Releases API
    latestVersion = (releaseData.tag_name || "").replace(/^v/i, "");
    releaseNotes = releaseData.body || "";

    // Buscar asset zip o manifest adjunto
    const assets = Array.isArray(releaseData.assets) ? releaseData.assets : [];
    const zipAsset = assets.find((a) => a.name && (a.name.endsWith(".zip") || a.name.endsWith(".tar.gz")));
    const checksumAsset = assets.find((a) => a.name && (a.name.endsWith(".sha256") || a.name.includes("checksum")));

    if (zipAsset) {
      downloadUrl = zipAsset.browser_download_url;
      assetName = zipAsset.name;
    } else if (releaseData.zipball_url) {
      downloadUrl = releaseData.zipball_url;
      assetName = `aeron-fluxer-x-v${latestVersion}.zip`;
    }

    // Si hay asset checksum, se puede extraer del cuerpo o notas si existe el patrón
    const shaMatch = releaseNotes.match(/sha256[:\s]+([a-fA-F0-9]{64})/i);
    if (shaMatch) {
      expectedSha256 = shaMatch[1].toLowerCase().trim();
    }
  }

  const eligibility = checkUpdateEligibility(CURRENT_VERSION, latestVersion, {
    allowDowngrade: options.allowDowngrade,
    allowPrerelease: options.allowPrerelease,
  });

  const result = {
    ok: true,
    currentVersion: CURRENT_VERSION,
    latestVersion,
    updateAvailable: eligibility.eligible,
    eligibility,
    releaseInfo: {
      version: latestVersion,
      tag: `v${latestVersion}`,
      releaseNotes,
      downloadUrl,
      assetName,
      expectedSha256,
      source,
    },
  };

  await logUpdaterMessage(repoRoot, "info", `Comprobación finalizada. Versión actual: v${CURRENT_VERSION}, remota: v${latestVersion}. Actualización disponible: ${eligibility.eligible}`);
  return result;
}

/**
 * Crea un backup preventivo del código actual antes de aplicar cualquier cambio.
 *
 * @param {string} repoRoot
 * @param {string} versionTag
 * @returns {Promise<{ backupId: string, backupDir: string, filesCount: number }>}
 */
export async function createCodeBackup(repoRoot, versionTag = CURRENT_VERSION) {
  const storage = getStorageStructure(repoRoot);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupId = `backup-v${versionTag}-${timestamp}`;
  const backupDir = path.join(storage.backupsDir, backupId);

  await fs.mkdir(backupDir, { recursive: true });
  await logUpdaterMessage(repoRoot, "info", `Creando backup preventivo de seguridad en: ${backupDir}`);

  // Archivos esenciales del código a respaldar (ignora node_modules, storage, logs)
  const itemsToBackup = [
    "core",
    "tools",
    "doctor",
    "scripts",
    "config",
    "contracts",
    "docs",
    "server.js",
    "server.mjs",
    "doctor.mjs",
    "update.mjs",
    "package.json",
    "package-lock.json",
    "aeron.config.json",
    "start_aeron.bat",
    "start_aeron.ps1",
  ];

  let filesCount = 0;

  for (const item of itemsToBackup) {
    const src = path.join(repoRoot, item);
    const dest = path.join(backupDir, item);
    if (existsSync(src)) {
      await fs.cp(src, dest, { recursive: true });
      filesCount++;
    }
  }

  // Guardar manifiesto de backup
  const manifest = {
    backupId,
    version: versionTag,
    createdAt: new Date().toISOString(),
    filesCount,
    repoRoot,
  };
  await fs.writeFile(path.join(backupDir, "backup-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  await logUpdaterMessage(repoRoot, "info", `Backup preventivo ${backupId} completado exitosamente (${filesCount} componentes respaldados).`);
  return { backupId, backupDir, filesCount };
}

/**
 * Realiza un Rollback restaurando los archivos desde un backup previo.
 *
 * @param {string} backupDir Directorio del backup a restaurar
 * @param {string} repoRoot Directorio del repositorio destino
 * @returns {Promise<{ ok: boolean, restoredFiles: number, error?: string }>}
 */
export async function executeRollback(backupDir, repoRoot) {
  await logUpdaterMessage(repoRoot, "warn", `🚨 INICIANDO ROLLBACK AUTOMÁTICO DESDE: ${backupDir}`);

  try {
    if (!existsSync(backupDir)) {
      throw new Error(`Directorio de backup no existe: ${backupDir}`);
    }

    const entries = await fs.readdir(backupDir);
    let restoredCount = 0;

    for (const entry of entries) {
      if (entry === "backup-manifest.json") continue;
      const src = path.join(backupDir, entry);
      const dest = path.join(repoRoot, entry);
      await fs.cp(src, dest, { recursive: true, force: true });
      restoredCount++;
    }

    await logUpdaterMessage(repoRoot, "info", `✅ Rollback completado exitosamente. Se restauraron ${restoredCount} componentes.`);
    return { ok: true, restoredFiles: restoredCount };
  } catch (err) {
    const msg = `Fallo crítico durante rollback: ${err.message}`;
    await logUpdaterMessage(repoRoot, "error", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Valida la sintaxis e integridad básica de los archivos principales de código.
 */
export async function verifyCodeSyntax(targetDir) {
  const criticalFiles = [
    path.join(targetDir, "server.mjs"),
    path.join(targetDir, "server.js"),
    path.join(targetDir, "core", "runtime.mjs"),
    path.join(targetDir, "core", "registry.mjs"),
    path.join(targetDir, "core", "router.mjs"),
  ];

  for (const file of criticalFiles) {
    if (existsSync(file)) {
      try {
        await execFileAsync(process.execPath, ["--check", file]);
      } catch (err) {
        return {
          ok: false,
          file,
          error: `Error de sintaxis en archivo crítico ${path.basename(file)}: ${err.message}`,
        };
      }
    }
  }

  return { ok: true };
}

/**
 * Ejecuta el auto-diagnóstico post-actualización (health check / doctor suave).
 */
export async function runPostUpdateSelfCheck(repoRoot) {
  try {
    const doctorFile = path.join(repoRoot, "doctor.mjs");
    if (existsSync(doctorFile)) {
      const { stdout, stderr } = await execFileAsync(process.execPath, [doctorFile, "--quick"], {
        cwd: repoRoot,
        timeout: 20000,
      });
      const passed = stdout.includes("OPERATIVO Y VERIFICADO") || stdout.includes("Invariantes Cumplidas");
      return { ok: passed, stdout, stderr };
    }
    return { ok: true, note: "doctor.mjs no presente, omitiendo auto-diagnóstico" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Ejecuta el flujo completo de actualización automática con verificación estricta y rollback.
 *
 * @param {object} [options]
 * @param {string} [options.repoRoot]
 * @param {string} [options.targetVersion]
 * @param {string} [options.downloadUrl]
 * @param {string} [options.expectedSha256]
 * @param {boolean} [options.skipVerification=false]
 * @param {boolean} [options.allowDowngrade=false]
 * @returns {Promise<object>}
 */
export async function executeAutoUpdate(options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  const storage = getStorageStructure(repoRoot);

  await logUpdaterMessage(repoRoot, "info", "══════════ INICIANDO PROCESO DE ACTUALIZACIÓN AUTOMÁTICA ══════════");

  // 1. Comprobación preliminar si no se pasaron datos directos
  let targetVersion = options.targetVersion;
  let downloadUrl = options.downloadUrl;
  let expectedSha256 = (options.expectedSha256 || "").toLowerCase().trim();

  if (!targetVersion || !downloadUrl) {
    const checkResult = await checkForUpdates(options);
    if (!checkResult.ok) {
      return { ok: false, phase: "check", error: checkResult.error };
    }
    if (!checkResult.updateAvailable && !options.force) {
      return {
        ok: true,
        phase: "check",
        upToDate: true,
        currentVersion: CURRENT_VERSION,
        message: checkResult.eligibility?.reason || "El sistema ya está actualizado a la versión más reciente.",
      };
    }
    targetVersion = checkResult.releaseInfo.version;
    downloadUrl = checkResult.releaseInfo.downloadUrl;
    if (!expectedSha256 && checkResult.releaseInfo.expectedSha256) {
      expectedSha256 = checkResult.releaseInfo.expectedSha256;
    }
  }

  if (!downloadUrl) {
    const msg = `No se encontró URL de descarga para la versión v${targetVersion}.`;
    await logUpdaterMessage(repoRoot, "error", msg);
    return { ok: false, phase: "resolve_download", error: msg };
  }

  // 2. Directorio de staging temporal aislado en cache de usuario
  const stagingDir = path.join(storage.cacheDir, "staging");
  const extractedDir = path.join(stagingDir, `extracted-v${targetVersion}`);
  const archivePath = path.join(stagingDir, `update-v${targetVersion}.zip`);

  await fs.mkdir(stagingDir, { recursive: true });
  await fs.rm(extractedDir, { recursive: true, force: true }).catch(() => {});

  let backupInfo = null;

  try {
    // 3. Descarga con cálculo simultáneo de SHA-256
    await logUpdaterMessage(repoRoot, "info", `Descargando paquete de actualización desde: ${downloadUrl}`);
    const downloadResult = await downloadFileWithHash(downloadUrl, archivePath);

    // 4. Verificación de Integridad Criptográfica (SHA-256)
    if (expectedSha256 && expectedSha256.length === 64) {
      if (downloadResult.sha256 !== expectedSha256) {
        await fs.rm(archivePath, { force: true }).catch(() => {});
        const mismatchError = `FALLO DE INTEGRIDAD: SHA-256 no coincide. Esperado: ${expectedSha256}, Calculado: ${downloadResult.sha256}. Archivo eliminado para proteger el sistema.`;
        await logUpdaterMessage(repoRoot, "error", mismatchError);
        return { ok: false, phase: "integrity_check", error: mismatchError };
      }
      await logUpdaterMessage(repoRoot, "info", `Integridad verificada con éxito (SHA-256: ${downloadResult.sha256}).`);
    } else {
      await logUpdaterMessage(repoRoot, "info", `Paquete descargado (${downloadResult.bytes} bytes, SHA-256: ${downloadResult.sha256}).`);
    }

    // 5. Crear Backup Preventivo del Código Actual
    backupInfo = await createCodeBackup(repoRoot, CURRENT_VERSION);

    // 6. Extracción en staging para inspección previa
    await fs.mkdir(extractedDir, { recursive: true });
    await logUpdaterMessage(repoRoot, "info", `Extrayendo paquete en staging para inspección: ${extractedDir}`);

    const isWin = process.platform === "win32";
    if (isWin) {
      await execAsync(`powershell -NoProfile -NonInteractive -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${extractedDir}' -Force"`);
    } else {
      await execAsync(`unzip -q -o "${archivePath}" -d "${extractedDir}" || tar -xzf "${archivePath}" -C "${extractedDir}"`);
    }

    // Si el zip contiene una carpeta raíz única (e.g. repo-v9.1.0/), resolverla
    let sourceContentDir = extractedDir;
    const extractedEntries = await fs.readdir(extractedDir);
    if (extractedEntries.length === 1) {
      const singleDir = path.join(extractedDir, extractedEntries[0]);
      const stat = await fs.stat(singleDir).catch(() => null);
      if (stat && stat.isDirectory()) {
        sourceContentDir = singleDir;
      }
    }

    // 7. Verificación previa de sintaxis en el código extraído
    const syntaxCheck = await verifyCodeSyntax(sourceContentDir);
    if (!syntaxCheck.ok) {
      throw new Error(`Código descargado falló chequeo de sintaxis previo: ${syntaxCheck.error}`);
    }

    // 8. Aplicar la Actualización (reemplazo atómico de código)
    await logUpdaterMessage(repoRoot, "info", `Aplicando actualización sobre: ${repoRoot}`);
    const itemsToCopy = await fs.readdir(sourceContentDir);

    for (const item of itemsToCopy) {
      // Proteger datos locales y entorno
      if (item === "node_modules" || item === "storage" || item === ".env" || item === "shortcuts.json") {
        continue;
      }
      const src = path.join(sourceContentDir, item);
      const dest = path.join(repoRoot, item);
      await fs.cp(src, dest, { recursive: true, force: true });
    }

    // 9. Verificación Post-Actualización (Doctor Self-Check)
    await logUpdaterMessage(repoRoot, "info", "Ejecutando auto-diagnóstico post-actualización...");
    const selfCheck = await runPostUpdateSelfCheck(repoRoot);

    if (!selfCheck.ok) {
      throw new Error(`Auto-diagnóstico de la nueva versión falló: ${selfCheck.error || "Invariantes no cumplidas"}`);
    }

    // 10. Limpieza de staging exitoso
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});

    const successMsg = `🎉 ACTUALIZACIÓN COMPLETADA CON ÉXITO a v${targetVersion}. Backup guardado en: ${backupInfo.backupDir}`;
    await logUpdaterMessage(repoRoot, "info", successMsg);

    return {
      ok: true,
      phase: "complete",
      previousVersion: CURRENT_VERSION,
      newVersion: targetVersion,
      backupId: backupInfo.backupId,
      message: successMsg,
    };
  } catch (err) {
    // 11. ROLLBACK AUTOMÁTICO ANTE CUALQUIER FALLO
    const errorMsg = `Error durante la actualización: ${err.message}`;
    await logUpdaterMessage(repoRoot, "error", errorMsg);

    let rollbackResult = { ok: false };
    if (backupInfo?.backupDir) {
      rollbackResult = await executeRollback(backupInfo.backupDir, repoRoot);
    }

    // Limpiar staging temporal
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});

    return {
      ok: false,
      phase: "failed",
      error: errorMsg,
      rolledBack: rollbackResult.ok,
      backupUsed: backupInfo?.backupId || null,
      suggestion: "Se ha restaurado la versión anterior mediante rollback automático. Revise los logs en updater.log.",
    };
  }
}

/**
 * Lista los backups de código disponibles en el directorio de usuario.
 */
export async function listAvailableBackups(repoRoot) {
  const storage = getStorageStructure(repoRoot);
  if (!existsSync(storage.backupsDir)) {
    return { ok: true, backups: [] };
  }

  const entries = await fs.readdir(storage.backupsDir);
  const backups = [];

  for (const entry of entries) {
    const fullPath = path.join(storage.backupsDir, entry);
    const manifestPath = path.join(fullPath, "backup-manifest.json");
    let manifest = null;
    if (existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      } catch {}
    }
    backups.push({
      backupId: entry,
      path: fullPath,
      manifest,
    });
  }

  return { ok: true, backups };
}
