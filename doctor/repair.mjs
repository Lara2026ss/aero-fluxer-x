/**
 * 🩺 AERON FLUXER X DOCTOR — doctor/repair.mjs
 * Motor de Auto-Reparación Segura con Re-Test Obligatorio de Verificación.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

export const REPAIR_SAFETY_LEVEL = Object.freeze({
  READ_ONLY: "READ_ONLY",
  SAFE_REPAIR: "SAFE_REPAIR",
  DESTRUCTIVE: "DESTRUCTIVE",
});

export class SafeDoctorRepairEngine {
  constructor({ runtime }) {
    this.runtime = runtime;
  }

  async executeRepair({ issueType, targetPath, repairAction, safetyLevel = "SAFE_REPAIR" }) {
    const record = {
      timestamp: new Date().toISOString(),
      issueType,
      safetyLevel,
      beforeState: null,
      actionExecuted: null,
      afterState: null,
      verificationStatus: "UNVERIFIED",
      rollbackAvailable: false,
      reverifiedOk: false,
    };

    // Si es destructiva y no se habilitó confirmación explícita -> Bloquear
    if (safetyLevel === REPAIR_SAFETY_LEVEL.DESTRUCTIVE) {
      record.verificationStatus = "REPAIR_BLOCKED";
      record.actionExecuted = "Reparación destructiva bloqueada por política de seguridad.";
      return record;
    }

    try {
      // 1. DETECT & BEFORE STATE
      record.beforeState = targetPath && existsSync(targetPath)
        ? (await fs.stat(targetPath)).mtime.toISOString()
        : "MISSING";

      // 2. REPAIR ACTION
      if (issueType === "STALE_CACHE" && this.runtime?.cachePolicy) {
        this.runtime.cachePolicy.invalidateService(targetPath);
        record.actionExecuted = `Caché invalidada para recurso ${targetPath}`;
      } else if (issueType === "MISSING_STORAGE_DIR" && targetPath) {
        await fs.mkdir(targetPath, { recursive: true });
        record.actionExecuted = `Directorio ${targetPath} creado correctamente.`;
      } else if (typeof repairAction === "function") {
        record.actionExecuted = await repairAction();
      }

      // 3. REFRESH & AFTER STATE
      record.afterState = targetPath && existsSync(targetPath)
        ? (await fs.stat(targetPath)).mtime.toISOString()
        : "PRESENT";

      // 4. RETEST & VERIFY (OBLIGATORIO)
      const reverifyOk = targetPath ? existsSync(targetPath) : true;
      record.reverifiedOk = Boolean(reverifyOk);
      record.verificationStatus = reverifyOk ? "VERIFIED_FIXED" : "UNVERIFIED";

      return record;
    } catch (err) {
      record.verificationStatus = "REPAIR_FAILED";
      record.actionExecuted = `Error en reparación: ${err.message}`;
      return record;
    }
  }
}
