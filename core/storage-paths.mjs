/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 📦 AERON FLUXER X — core/storage-paths.mjs
 * Separación total entre Código del Repositorio y Datos Locales del Usuario.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Determina y aprovisiona de forma portable las rutas de datos del usuario
 * según el sistema operativo o anulaciones por variable de entorno.
 */

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

/**
 * Obtiene el directorio base de datos del usuario según el SO.
 * @returns {string} Ruta absoluta del directorio de datos del usuario
 */
export function resolveUserDataDir() {
  // 1. Variable de entorno explícita
  const envOverride = process.env.AERON_DATA_DIR || process.env.AERO_FLUXER_DATA_DIR || process.env.FLUXER_STORAGE_DIR;
  if (envOverride && typeof envOverride === "string" && envOverride.trim().length > 0) {
    return path.resolve(envOverride.trim());
  }

  const home = os.homedir();

  // 2. Windows: %APPDATA%\AeroFluxerX (fallback a ~/.aerofluxerx si APPDATA no está definido)
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, "AeroFluxerX");
  }

  // 3. Linux / macOS: XDG compliant (~/.config/aero-fluxer-x o ~/.local/share/aero-fluxer-x)
  const xdgData = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
  return path.join(xdgData, "aero-fluxer-x");
}

/**
 * Resuelve la estructura completa de subdirectorios de datos del usuario.
 * @param {string} [repoRoot] Ruta del repositorio (usada solo para plantillas)
 * @returns {object} Objeto con las rutas absolutas de cada subdominio de datos
 */
export function getStorageStructure(repoRoot) {
  const base = resolveUserDataDir();
  const home = os.homedir();

  return {\n    base,
    configDir: path.join(base, "config"),
    configFile: path.join(base, "config", "aeron.config.json"),
    shortcutsDir: path.join(base, "shortcuts"),
    shortcutsFile: path.join(base, "shortcuts", "shortcuts.json"),
    memoryDir: path.join(base, "memory"),
    memoryDb: path.join(base, "memory", "fluxer-memory.sqlite"),
    logsDir: path.join(base, "logs"),
    mainLog: path.join(base, "logs", "fluxer.log"),
    auditLog: path.join(base, "logs", "audit.jsonl"),
    updaterLog: path.join(base, "logs", "updater.log"),
    cacheDir: path.join(base, "cache"),
    backupsDir: path.join(base, "cache", "backups"),
    feedbackDir: path.join(base, "feedback"),
    feedbackOutboxDir: path.join(base, "feedback", "outbox"),
    feedbackAttachmentsDir: path.join(base, "feedback", "attachments"),
    runtimeDir: path.join(base, "runtime"),
    statusFile: path.join(base, "runtime", "status.json"),
    downloads: path.join(home, "Downloads"),
    documents: path.join(home, "Documents"),
    repoRoot: repoRoot || process.cwd(),
  };
}

/**
 * Inicializa los directorios locales del usuario si no existen,
 * y genera shortcuts.json a partir de la plantilla si es la primera ejecución.
 *
 * @param {string} [repoRoot] Ruta del repositorio
 * @returns {Promise<object>} Estructura de almacenamiento inicializada
 */
export async function ensureUserDataInitialized(repoRoot) {
  const structure = getStorageStructure(repoRoot);

  // Crear directorios de usuario
  const dirsToEnsure = [
    structure.base,
    structure.configDir,
    structure.shortcutsDir,
    structure.memoryDir,
    structure.logsDir,
    structure.cacheDir,
    structure.backupsDir,
    structure.feedbackDir,
    structure.feedbackOutboxDir,
    structure.feedbackAttachmentsDir,
    structure.runtimeDir,
  ];

  for (const dir of dirsToEnsure) {
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
  }

  // 1. Inicialización de shortcuts.json local
  if (!existsSync(structure.shortcutsFile)) {
    let sourceContent = null;

    // A) Verificar si existe legado en ~/.aeron/shortcuts.json para migrar sin pérdida
    const legacyAeronShortcuts = path.join(os.homedir(), ".aeron", "shortcuts.json");
    if (existsSync(legacyAeronShortcuts)) {
      try {
        sourceContent = await fs.readFile(legacyAeronShortcuts, "utf8");
      } catch {}
    }

    // B) Si no hay legado, usar la plantilla pública shortcuts.example.json del repo
    if (!sourceContent && structure.repoRoot) {
      const templatePath = path.join(structure.repoRoot, "shortcuts.example.json");
      if (existsSync(templatePath)) {
        try {
          sourceContent = await fs.readFile(templatePath, "utf8");
        } catch {}
      }
    }

    // C) Fallback interno si no se pudo leer ninguna fuente
    if (!sourceContent) {
      sourceContent = JSON.stringify(
        {
          verificar_sistema: {
            description: "Obtiene información básica del sistema y memoria disponible",
            category: "sistema",
            tags: ["sistema", "diagnostico"],
            steps: [{ tool: "system", action: "get_system_info", args: {} }],
          },
        },
        null,
        2
      );
    }

    await fs.writeFile(structure.shortcutsFile, sourceContent, "utf8").catch(() => {});
  }

  // 2. Migración transparente de SQLite legado (si existe en storage/memory y no en el nuevo destino)
  if (!existsSync(structure.memoryDb) && structure.repoRoot) {
    const legacyDb = path.join(structure.repoRoot, "storage", "memory", "fluxer-memory.sqlite");
    if (existsSync(legacyDb)) {
      try {
        await fs.copyFile(legacyDb, structure.memoryDb);
      } catch {}
    }
  }

  return structure;
}
