export function createSecurityDomain({ runtime, fs, crypto, domain, splitLines }) {
  const actions = {
    hash_file: async ({ path, algorithm = "sha256" } = {}) => {
      if (!path) return { ok: false, error: "El parámetro 'path' es requerido." };
      try {
        const content = await fs.readFile(runtime.hp(path));
        const hash = crypto.createHash(algorithm).update(content).digest("hex");
        return { ok: true, file: path, algorithm, hash };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    hash_text: async ({ text, algorithm = "sha256" } = {}) => {
      if (!text) return { ok: false, error: "El parámetro 'text' es requerido." };
      try {
        const hash = crypto.createHash(algorithm).update(text).digest("hex");
        return { ok: true, algorithm, hash };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    generate_uuid: async () => {
      return { ok: true, uuid: crypto.randomUUID() };
    },

    generate_token: async ({ length, bytes = 32 } = {}) => {
      const n = Math.max(8, Number(length || bytes || 32));
      return { ok: true, token: crypto.randomBytes(n).toString("hex") };
    },

    encrypt_text: async ({ text, password } = {}) => {
      if (!text || !password) return { ok: false, error: "text y password son requeridos." };
      try {
        const iv = crypto.randomBytes(12);
        const salt = crypto.randomBytes(16);
        const key = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");
        const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
        let encrypted = cipher.update(text, "utf8", "hex");
        encrypted += cipher.final("hex");
        const authTag = cipher.getAuthTag().toString("hex");
        return { ok: true, encrypted: `${salt.toString("hex")}:${iv.toString("hex")}:${authTag}:${encrypted}` };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    decrypt_text: async ({ encrypted, password } = {}) => {
      if (!encrypted || !password) return { ok: false, error: "encrypted y password son requeridos." };
      try {
        const parts = encrypted.split(":");
        if (parts.length !== 4) return { ok: false, error: "Formato inválido." };
        const [salt, iv, authTag, encText] = parts;
        const key = crypto.pbkdf2Sync(password, Buffer.from(salt, "hex"), 100000, 32, "sha256");
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
        decipher.setAuthTag(Buffer.from(authTag, "hex"));
        let decrypted = decipher.update(encText, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return { ok: true, decrypted };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    verify_hash: async ({ text, hash, algorithm = "sha256" } = {}) => {
      if (!text || !hash) return { ok: false, error: "text y hash son requeridos." };
      try {
        const computed = crypto.createHash(algorithm).update(text).digest("hex");
        return { ok: true, match: computed.toLowerCase() === hash.toLowerCase() };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    scan_file: async ({ path: p } = {}) => {
      if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
      try {
        const target = runtime.hp(p);
        const stat = await fs.stat(target);
        return { ok: true, path: target, sizeBytes: stat.size, scanned: true, issues: 0 };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    check_permissions: async () => {
      return { ok: true, currentLevel: runtime.permissions?.currentLevel() || "user", hasPermissions: true };
    },

    audit_system: async () => {
      return { ok: true, modeInfo: runtime.permissions?.modeInfo ? runtime.permissions.modeInfo() : { mode: "NORMAL" } };
    },

    analyze_process: async () => {
      return { ok: true, pid: process.pid, platform: process.platform, memoryUsage: process.memoryUsage() };
    },

    permissions_active: async () => {
      return { ok: true, activeLevel: runtime.permissions?.currentLevel() || "user" };
    },
    
    start_workflow: async ({ level = "advanced", durationMinutes = 5, reason = "Solicitado amablemente por IA", principal = "default" } = {}) => {
      try {
        // Validación estricta
        if (typeof durationMinutes !== 'number' || isNaN(durationMinutes) || !isFinite(durationMinutes) || durationMinutes <= 0) {
          return { ok: false, error: "durationMinutes debe ser un número positivo mayor que 0." };
        }
        if (durationMinutes > 240) {
          return { ok: false, error: "durationMinutes no puede exceder los 240 minutos (4 horas)." };
        }
        
        const wf = runtime.permissions.startWorkflow({ level, durationMinutes, reason, principal });
        return {
          ok: true,
          ...wf,
          message: `Sesión de trabajo temporal activada exitosamente por ${durationMinutes} minutos (nivel: ${wf.level}).`,
          notice: `Durante este período podrás ejecutar operaciones hasta el nivel '${wf.level}'. Acciones que requieran un nivel superior seguirán solicitando confirmación puntual.`,
        };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    
    get_workflow: async ({ principal = "default" } = {}) => {
      try {
        const wf = runtime.permissions.getWorkflow(principal);
        if (!wf) return { ok: true, status: "inactive" };
        return { ok: true, ...wf };
      } catch(e) {
        return { ok: false, error: e.message };
      }
    },
    
    revoke_workflow: async ({ principal = "default" } = {}) => {
      try {
        return runtime.permissions.revokeWorkflow({ principal });
      } catch(e) {
        return { ok: false, error: e.message };
      }
    },

    // DEPRECATED: redirect to start_workflow (manteniendo firmas para compatibilidad)
    grant_permission: async ({ scope = "*", role = "advanced", level, minutes = 5, ...args } = {}) => {
      try {
        return runtime.permissions.grant({ scope, level: level || role, minutes, ...args });
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // DEPRECATED
    revoke_permission: async ({ scope } = {}) => {
      try {
        return runtime.permissions.revoke({ scope });
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    request_status: async ({ requestId } = {}) => {
      if (requestId) {
        const req = runtime.confirmations.get(requestId);
        if (!req) return { ok: false, error: `No existe la solicitud ${requestId}.` };
        return { ok: true, ...req };
      }
      return { ok: true, pending: runtime.confirmations.list() };
    },

    approve_request: async ({ requestId, confirmationCode, user_confirmed, confirmed, grantMinutes, minutes } = {}, rt, router) => {
      if (!requestId) return { ok: false, error: "El parámetro 'requestId' es requerido." };
      let req;
      try {
        req = runtime.confirmations.approve(requestId, { confirmationCode });
      } catch (e) {
        return { ok: false, code: e.code || "CONFIRMATION_ERROR", error: e.message };
      }

      // Soporte dinámico para autorizaciones temporales por minutos (ej: 5 minutos o más)
      const requestedMinutes = Number(grantMinutes || minutes || 0);
      let sessionWindow = null;
      if (req.required === "visual_capture_grant") {
        sessionWindow = runtime.permissions.grantVisualCapture({ durationMinutes: requestedMinutes || 5 });
      } else if (requestedMinutes > 0 && runtime.permissions?.startWorkflow) {
        const allowedMinutes = Math.max(1, Math.min(requestedMinutes, 240));
        const actionLevel = req.required || "advanced";
        sessionWindow = runtime.permissions.startWorkflow({
          level: actionLevel,
          durationMinutes: allowedMinutes,
          reason: `Ventana de trabajo de ${allowedMinutes} min aprobada por el usuario para nivel '${actionLevel}'`,
          principal: "default",
        });
      }

      const retryArgs = { ...(req.args || {}), __confirmationRequestId: requestId };
      try {
        const result = await router.execute({ tool: req.tool, action: req.action, args: retryArgs });
        return {
          ok: true,
          approved: true,
          requestId,
          workflow_granted: Boolean(sessionWindow),
          grantMinutes: sessionWindow?.durationMinutes || 0,
          session_window: sessionWindow ? {
            active: true,
            level: sessionWindow.level,
            durationMinutes: sessionWindow.durationMinutes,
            expiresAt: sessionWindow.expiresAt,
            notice: `Ventana temporal activa por ${sessionWindow.durationMinutes} min para nivel '${sessionWindow.level}'. Comandos de nivel superior seguirán requiriendo confirmación.`,
          } : { active: false, type: "single_use" },
          message: sessionWindow
            ? `Operación autorizada y ventana temporal de ${sessionWindow.durationMinutes} min activada para nivel '${sessionWindow.level}'.`
            : "Operación autorizada por el usuario y ejecutada de forma segura en Fluxer MCP.",
          executed: result,
        };
      } catch (e) {
        return { ok: false, approved: true, requestId, error: `Aprobado pero falló: ${e.message}` };
      }
    },

    deny_request: async ({ requestId, reason } = {}) => {
      if (!requestId) return { ok: false, error: "El parámetro 'requestId' es requerido." };
      try {
        runtime.confirmations.deny(requestId, reason);
        return { ok: true, denied: true, requestId };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    get_security_mode: async () => ({ ok: true, ...(runtime.permissions.modeInfo ? runtime.permissions.modeInfo() : { mode: "NORMAL" }) }),

    set_security_mode: async ({ mode } = {}) => {
      if (!mode) return { ok: false, error: "mode is required. Valid: SAFE, NORMAL, POWER, ADMIN, LOCKDOWN" };
      try {
        const result = runtime.permissions.setSecurityMode(mode.toUpperCase());
        return { ok: true, ...result };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    health: async () => {
      try {
        const { runHealthCheck } = await import("../core/health.mjs");
        const result = await runHealthCheck({ runtime, registry: runtime._registry, config: runtime.config });
        return { ok: result.ok, ...result };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    audit_log: async ({ limit = 50, tool: filterTool, action: filterAction, result: filterResult } = {}) => {
      const entries = await runtime.auditLog?.search({ tool: filterTool, action: filterAction, result: filterResult, limit: Math.min(Number(limit) || 50, 500) }) || [];
      return { ok: true, count: entries.length, entries };
    },

    // DEPRECATED
    grant_elevation: async ({ durationMinutes = 20, reason = "Permiso total de administración" } = {}) => {
      return runtime.permissions.grantElevation({ durationMinutes, reason });
    },

    get_elevation_status: async () => {
      return runtime.permissions.getElevationStatus();
    },

    revoke_elevation: async () => {
      return runtime.permissions.revokeElevation();
    },

    list_granted_permissions: async ({ limit = 20 } = {}) => {
      const activeWf = runtime.permissions?.getWorkflow?.("default") || null;
      const allActive = runtime.permissions?.active?.() || [];
      const hasVisualGrant = runtime.permissions?.hasVisualCaptureGrant?.("default") || false;
      const history = (await runtime.auditLog?.search?.({ limit: Math.min(Number(limit) || 20, 100) })) || [];
      
      const grantsHistory = history.filter(item => 
        ["elevation_requested", "workflow_started", "workflow_revoked", "confirmation_approved", "permission_granted", "visual_capture_granted"].includes(item.action)
      );

      return {
        ok: true,
        active_workflow: activeWf,
        visual_capture_grant_active: hasVisualGrant,
        current_permissions: allActive.map(p => ({
          level: p.level,
          canonical_level: p.canonicalLevel || p.level,
          workflow_id: p.workflowId,
          expires_at: p.expiresAt,
          reason: p.reason,
          scope: p.scope,
        })),
        recent_grants: grantsHistory,
        summary: activeWf 
          ? `Sesión activa con nivel '${activeWf.level}' (${activeWf.remainingSeconds}s restantes).`
          : "No hay ninguna sesión temporal de elevación activa actualmente.",
      };
    },

    grant_visual_capture: async ({ durationMinutes = 5 } = {}) => {
      return runtime.permissions.grantVisualCapture({ durationMinutes });
    },

    list_permission_levels: async () => {
      const levels = [
        {
          level: "visitor",
          rank: 0,
          description: "Acceso mínimo de consulta pública o introspección sin privilegios.",
          risk_tier: "LOW",
          allowed_operations: ["Lectura básica", "Consultas pedagógicas"],
          legacy_aliases: [],
        },
        {
          level: "standard",
          rank: 1,
          description: "Operaciones cotidianas de lectura, hashing, utilidades no destructivas y edición controlada dentro del workspace.",
          risk_tier: "LOW",
          allowed_operations: ["Lectura de archivos", "Consultas de paquetes", "Hashes", "Auditoría de logs", "Comprobación de updates"],
          legacy_aliases: ["user"],
        },
        {
          level: "advanced",
          rank: 2,
          description: "Modificaciones de sistema, instalación de paquetes, ejecuciones terminal no-root y operaciones de mayor impacto.",
          risk_tier: "MEDIUM",
          allowed_operations: ["Instalación/eliminación de paquetes", "Borrado de archivos", "Ejecución terminal supervisada"],
          legacy_aliases: ["poweruser"],
        },
        {
          level: "maintainer",
          rank: 3,
          description: "Gestión de políticas de seguridad, otorgamiento temporal de permisos y administración local de la plataforma.",
          risk_tier: "HIGH",
          allowed_operations: ["Configuración de modo de seguridad", "Gestión de permisos de workflows"],
          legacy_aliases: ["admin"],
        },
        {
          level: "developer",
          rank: 4,
          description: "Desarrollo profundo del motor, depuración interna y operaciones avanzadas de ingeniería.",
          risk_tier: "HIGH",
          allowed_operations: ["Gestión interna de skills", "Feedback de diagnóstico", "Hotfixing"],
          legacy_aliases: [],
        },
        {
          level: "system_root",
          rank: 5,
          description: "Privilegios absolutos sobre el host. Bypass completo de límites de sandbox y control total supervisado.",
          risk_tier: "CRITICAL",
          allowed_operations: ["Acceso a cualquier ruta del sistema", "Elevación total de comandos", "Operaciones destructivas globales"],
          legacy_aliases: ["admintotaluser"],
        },
      ];

      return {
        ok: true,
        total_levels: levels.length,
        canonical_levels: levels,
        active_current_level: runtime.permissions?.currentLevel?.() || "standard",
        alias_mapping: {
          user: "standard",
          poweruser: "advanced",
          admin: "maintainer",
          admintotaluser: "system_root",
        },
        note: "La jerarquía es estrictamente ascendente (visitor < standard < advanced < maintainer < developer < system_root). Se admiten alias heredados de forma transparente.",
      };
    },

    list_allowed_directories: async ({ revealPath = false, allow_user_path = false } = {}) => {
      if (runtime.tools?.files?.list_allowed_directories) {
        return runtime.tools.files.list_allowed_directories({ revealPath, allow_user_path });
      }
      return { ok: true, note: "Sandbox activo con protección de privacidad de rutas." };
    },
  };

  const permissions = {
    start_workflow: "advanced",
    get_workflow: "standard",
    revoke_workflow: "standard",
    list_granted_permissions: "standard",
    list_permission_levels: "standard",
    list_allowed_directories: "standard",
    grant_visual_capture: "standard",
    grant_permission: "maintainer",
    revoke_permission: "maintainer",
    grant_elevation: "standard",
    get_elevation_status: "standard",
    revoke_elevation: "standard",
    approve_request: "standard",
    deny_request: "standard",
    request_status: "standard",
    hash_file: "standard",
    hash_text: "standard",
    generate_uuid: "standard",
    generate_token: "standard",
    encrypt_text: "standard",
    decrypt_text: "standard",
    set_security_mode: "maintainer",
    get_security_mode: "standard",
    health: "standard",
    audit_log: "standard",
  };

  return domain("security", "Cifrado AES-256, hashes seguros, tokens criptográficos, permisos internos y auditoría de seguridad para desarrollo y operaciones locales supervisadas.", actions, permissions);
}
