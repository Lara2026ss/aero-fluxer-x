/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔄 FLUXER XZ (V4.0 Architecture) — tools/upd.mjs
 * Autonomous Remote Updater Capability Domain.
 * GitHub release discovery, zero-knowledge staging, verified rollback, and forensic status.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { CURRENT_VERSION, BRAND_NAME, GENERATION, getVersionInfo } from "../core/version.mjs";
import { getStorageStructure } from "../core/storage-paths.mjs";
import {
  checkForUpdates,
  executeAutoUpdate,
  executeRollback,
  listAvailableBackups,
} from "../core/updater.mjs";

export function createUpdDomain({ runtime, domain }) {
  const rootDir = runtime?.root || process.cwd();

  const actions = {
    // ── 1. Check for Updates ─────────────────────────────────────────────────
    check: async (params = {}) => {
      const force = Boolean(params.force);
      const channel = params.channel || "public-release";
      const checkRepo = Boolean(params.checkRepo);

      try {
        const checkResult = await checkForUpdates({
          repoRoot: rootDir,
          force,
          channel,
          checkRepo,
        });

        return {
          ok: true,
          currentVersion: CURRENT_VERSION,
          generation: GENERATION,
          brand: BRAND_NAME,
          ...checkResult,
          summary: checkResult.updateAvailable
            ? `New version available: v${checkResult.latestVersion} (currently v${CURRENT_VERSION}). Run upd { operation: 'apply', confirm: true } after asking user confirmation.`
            : `System is up to date on version v${CURRENT_VERSION} (channel: ${channel}).`,
        };
      } catch (err) {
        return {
          ok: false,
          code: "UPDATE_CHECK_FAILED",
          error: err.message,
          currentVersion: CURRENT_VERSION,
          summary: `Update check failed: ${err.message}`,
        };
      }
    },

    // ── 2. Release Info & Changelog ──────────────────────────────────────────
    info: async (params = {}) => {
      const targetVer = params.version || params.targetVersion || CURRENT_VERSION;
      const changelogPath = path.join(rootDir, "CHANGELOG.md");
      let changelogSnippet = "";

      if (existsSync(changelogPath)) {
        try {
          const content = await fs.readFile(changelogPath, "utf8");
          const vHeader = content.indexOf(`## [${targetVer}]`);
          if (vHeader !== -1) {
            const nextHeader = content.indexOf("## [", vHeader + 5);
            changelogSnippet = nextHeader !== -1 ? content.substring(vHeader, nextHeader).trim() : content.substring(vHeader, vHeader + 2000).trim();
          } else {
            changelogSnippet = content.substring(0, 1500).trim() + "\n...";
          }
        } catch (_) {}
      }

      return {
        ok: true,
        version: targetVer,
        brand: BRAND_NAME,
        generation: GENERATION,
        changelog: changelogSnippet || `No specific changelog found for v${targetVer}`,
        versionInfo: getVersionInfo(),
        summary: `Release info for ${BRAND_NAME} v${targetVer} (Generation ${GENERATION}).`,
      };
    },

    // ── 3. Apply Update ──────────────────────────────────────────────────────
    apply: async (params = {}) => {
      const confirmed = Boolean(params.confirm || params.confirmed);

      // Strict consent verification
      if (!confirmed) {
        return {
          ok: false,
          code: "CONFIRMATION_REQUIRED",
          error: "User consent required. Ask the user in chat: '¿Deseas descargar e instalar la actualización oficial de Fluxer XZ desde GitHub?' and call upd { operation: 'apply', confirm: true } upon confirmation.",
          summary: "Update blocked by safety gate: explicit chat confirmation is required before applying updates.",
        };
      }

      try {
        const updateResult = await executeAutoUpdate({
          repoRoot: rootDir,
          force: Boolean(params.force),
          backupPolicy: params.backupPolicy || "full",
        });

        return {
          ok: updateResult.ok,
          ...updateResult,
          summary: updateResult.ok
            ? `Update applied successfully. Server updated to v${updateResult.newVersion || "latest"}.`
            : `Update failed: ${updateResult.error || "unknown error"}.`,
        };
      } catch (err) {
        return {
          ok: false,
          code: "UPDATE_APPLY_FAILED",
          error: err.message,
          summary: `Failed to apply update: ${err.message}`,
        };
      }
    },

    // ── 4. Rollback to Snapshot ──────────────────────────────────────────────
    rollback: async (params = {}) => {
      const snapshotId = params.snapshotId || params.targetBackupId;
      const backups = await listAvailableBackups(rootDir);

      if (!backups.backups || backups.backups.length === 0) {
        return {
          ok: false,
          code: "NO_BACKUPS",
          error: "No backups available to roll back to.",
        };
      }

      let selected = null;
      if (snapshotId) {
        selected = backups.backups.find((b) => b.backupId === snapshotId);
      } else {
        selected = backups.backups[backups.backups.length - 1];
      }

      if (!selected) {
        return {
          ok: false,
          code: "BACKUP_NOT_FOUND",
          error: `Backup snapshot '${snapshotId}' not found. Available: ${backups.backups.map((b) => b.backupId).join(", ")}`,
        };
      }

      const res = await executeRollback(selected.path, rootDir);
      return {
        ok: res.ok,
        restoredFrom: selected.backupId,
        restoredFiles: res.restoredFiles,
        summary: res.ok ? `Successfully rolled back to snapshot ${selected.backupId}.` : `Rollback failed: ${res.error}`,
      };
    },

    // ── 5. Forensic Disk & Status Audit ──────────────────────────────────────
    status: async (params = {}) => {
      const backups = await listAvailableBackups(rootDir);
      let auditLog = [];
      try {
        const storage = getStorageStructure(rootDir);
        if (existsSync(storage.updaterLog)) {
          const logContent = await fs.readFile(storage.updaterLog, "utf8");
          auditLog = logContent.trim().split(/\r?\n/).slice(-5);
        }
      } catch (_) {}

      return {
        ok: true,
        installedVersion: CURRENT_VERSION,
        generation: GENERATION,
        brand: BRAND_NAME,
        rootDir: params.revealPath ? rootDir : "[PROTECTED_PATH]",
        backupsCount: backups.backups?.length || 0,
        recentBackups: backups.backups?.slice(-3) || [],
        recentAuditEntries: auditLog,
        summary: `FLUXER XZ v${CURRENT_VERSION} (Gen ${GENERATION}) is active. ${backups.backups?.length || 0} backup snapshot(s) available.`,
      };
    },

    // Aliases
    data: async (p) => actions.status(p),
    doctor: async () => {
      if (runtime?.health) {
        return runtime.health();
      }
      return actions.status();
    },
    update: async (p) => actions.apply(p),
  };

  const permissions = {
    check: "standard",
    info: "standard",
    status: "standard",
    data: "standard",
    doctor: "standard",
    apply: "admin",
    update: "admin",
    rollback: "admin",
  };

  if (typeof domain === "function") {
    return domain(
      "upd",
      `Centro Oficial de Actualización de FLUXER XZ (Gen ${GENERATION}). Operaciones: check | info | apply | rollback | status`,
      actions,
      permissions
    );
  }

  return {
    name: "upd",
    description: `Centro Oficial de Actualización de FLUXER XZ (Gen ${GENERATION}). Operaciones: check | info | apply | rollback | status`,
    actions,
    permissions,
  };
}
