#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
// 📦 AERON FLUXER X — update.mjs
// CLI y Motor de Actualización Oficial para Aero Fluxer X MCP Server
// ══════════════════════════════════════════════════════════════════════════════

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkForUpdates,
  executeAutoUpdate,
  executeRollback,
  listAvailableBackups,
} from "./core/updater.mjs";
import { CURRENT_VERSION, BRAND_NAME } from "./core/version.mjs";
import { getStorageStructure } from "./core/storage-paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname);

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

export async function checkUpdate(options = {}) {
  return checkForUpdates({ repoRoot: ROOT, ...options });
}

export async function applyUpdate(options = {}) {
  return executeAutoUpdate({ repoRoot: ROOT, ...options });
}

export async function rollback(targetBackupId) {
  const storage = getStorageStructure(ROOT);
  const backups = await listAvailableBackups(ROOT);
  if (!backups.backups || backups.backups.length === 0) {
    return { ok: false, error: "No se encontraron backups disponibles para restaurar." };
  }

  let selected = null;
  if (targetBackupId) {
    selected = backups.backups.find((b) => b.backupId === targetBackupId);
  } else {
    // Tomar el backup más reciente
    selected = backups.backups[backups.backups.length - 1];
  }

  if (!selected) {
    return { ok: false, error: `Backup especificado no encontrado: ${targetBackupId}` };
  }

  return executeRollback(selected.path, ROOT);
}

async function cli() {
  const args = process.argv.slice(2);
  const isApply = args.includes("--apply") || args.includes("-a");
  const isRollback = args.includes("--rollback") || args.includes("-r");
  const isListBackups = args.includes("--backups") || args.includes("-b");
  const isForce = args.includes("--force") || args.includes("-f");

  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║     ${BRAND_NAME.toUpperCase()} — UPDATE MANAGER            ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${RESET}`);
  console.log(`  Versión instalada: ${BOLD}${GREEN}v${CURRENT_VERSION}${RESET}\n`);

  if (isListBackups) {
    const list = await listAvailableBackups(ROOT);
    console.log(`  ${BOLD}Backups de seguridad disponibles:${RESET}`);
    if (list.backups.length === 0) {
      console.log(`  ${YELLOW}No hay backups registrados en el directorio de usuario.${RESET}`);
    } else {
      for (const b of list.backups) {
        console.log(`  - ${CYAN}${b.backupId}${RESET} (${b.manifest?.createdAt || "sin fecha"})`);
      }
    }
    return;
  }

  if (isRollback) {
    const backupArgIdx = args.findIndex((a) => a === "--rollback" || a === "-r");
    const targetId = args[backupArgIdx + 1] && !args[backupArgIdx + 1].startsWith("-") ? args[backupArgIdx + 1] : null;
    console.log(`  ${YELLOW}Ejecutando rollback...${RESET}`);
    const res = await rollback(targetId);
    if (res.ok) {
      console.log(`  ${GREEN}✓ Rollback completado exitosamente (${res.restoredFiles} componentes restaurados).${RESET}`);
    } else {
      console.log(`  ${RED}✗ Fallo en rollback: ${res.error}${RESET}`);
    }
    return;
  }

  if (isApply) {
    console.log(`  ${CYAN}Buscando y aplicando actualización...${RESET}`);
    const updateRes = await applyUpdate({ force: isForce });
    if (updateRes.ok) {
      if (updateRes.upToDate) {
        console.log(`  ${GREEN}✓ ${updateRes.message}${RESET}`);
      } else {
        console.log(`  ${GREEN}✓ Actualizado exitosamente de v${updateRes.previousVersion} a v${updateRes.newVersion}${RESET}`);
        console.log(`  Backup creado en: ${updateRes.backupId}`);
      }
    } else {
      console.log(`  ${RED}✗ Fallo al actualizar: ${updateRes.error}${RESET}`);
      if (updateRes.rolledBack) {
        console.log(`  ${YELLOW}✓ Se aplicó rollback automático al backup: ${updateRes.backupUsed}${RESET}`);
      }
    }
    return;
  }

  // Por defecto: comprobar estado
  console.log(`  Comprobando estado de versiones (Modo Autónomo Desacoplado)...`);
  const check = await checkUpdate();
  if (!check.ok) {
    console.log(`  ${YELLOW}Aviso:${RESET} ${check.error}`);
    console.log(`  ${CYAN}Aero Fluxer X continuará funcionando con la versión local v${CURRENT_VERSION}.${RESET}`);
    return;
  }

  if (check.updateAvailable) {
    console.log(`  ${GREEN}★ ¡Nueva versión disponible!${RESET} ${BOLD}v${check.latestVersion}${RESET}`);
    console.log(`  Tipo: ${check.eligibility?.diffType?.toUpperCase()}`);
    console.log(`  ${check.eligibility?.reason}`);
    console.log(`\n  Para aplicar esta actualización ejecute:`);
    console.log(`    ${BOLD}node update.mjs --apply${RESET}\n`);
  } else {
    console.log(`  ${GREEN}✓ Sistema verificado:${RESET} v${CURRENT_VERSION} instalada.`);
    if (check.message) {
      console.log(`  ${CYAN}${check.message}${RESET}`);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  cli().catch((err) => {
    console.error(`\n${RED}[ERROR] Error en el gestor de actualizaciones:${RESET}`, err.message);
    process.exit(1);
  });
}

export default { checkUpdate, applyUpdate, rollback };
