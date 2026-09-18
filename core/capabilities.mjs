/**
 * 🪟 AERON FLUXER X — core/capabilities.mjs
 * Motor de detección de capacidades, permisos, estado de API y disponibilidad de recursos.
 */

import fs from "node:fs/promises";
import path from "node:path";

export class CapabilitiesEngine {
  constructor({ runtime }) {
    this.runtime = runtime;
  }

  async checkPreflight({ serviceId, environmentId, domain, action } = {}) {
    const checks = {
      apiAvailable: true,
      authenticated: true,
      permissionsOk: true,
      resourceExists: true,
      capabilitiesSupported: true,
      code: "OK",
      reason: null,
    };

    try {
      // 1. Verificación de entorno de host (Windows)
      if (process.platform !== "win32") {
        checks.capabilitiesSupported = false;
        checks.code = "CAPABILITY_UNSUPPORTED";
        checks.reason = "Aeron Fluxer X es exclusivo de Windows 10/11.";
        return checks;
      }

      // 2. Verificación de permisos requeridos para la acción
      if (domain && action && this.runtime?.permissions) {
        const reqLevel = this.runtime.permissions.requiredFor({ tool: domain, action });
        const currentMode = this.runtime.permissions.getMode();
        if (reqLevel === "admin" && currentMode !== "poweruser" && currentMode !== "admin") {
          checks.permissionsOk = false;
          checks.code = "PERMISSION_ERROR";
          checks.reason = `La acción ${domain}.${action} requiere nivel ${reqLevel}, modo actual: ${currentMode}.`;
          return checks;
        }
      }

      return checks;
    } catch (err) {
      return {
        apiAvailable: false,
        authenticated: false,
        permissionsOk: false,
        resourceExists: false,
        capabilitiesSupported: false,
        code: "PREFLIGHT_FAILED",
        reason: err.message,
      };
    }
  }
}
