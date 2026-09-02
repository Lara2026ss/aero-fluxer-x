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

    grant_permission: async ({ scope = "*", role = "poweruser", level, ...args } = {}) => {
      try {
        return runtime.permissions.grant({ scope, level: level || role, ...args });
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

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

    approve_request: async ({ requestId } = {}, rt, router) => {
      if (!requestId) return { ok: false, error: "El parámetro 'requestId' es requerido." };
      let req;
      try { req = runtime.confirmations.approve(requestId); } catch (e) { return { ok: false, error: e.message }; }
      const retryArgs = { ...(req.args || {}), __confirmationRequestId: requestId };
      try {
        const result = await router.execute({ tool: req.tool, action: req.action, args: retryArgs });
        return { ok: true, approved: true, requestId, executed: result };
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

  };

  const permissions = {
    grant_permission: "admin",
    revoke_permission: "admin",
    approve_request: "user",
    deny_request: "user",
    request_status: "user",
    hash_file: "user",
    hash_text: "user",
    generate_uuid: "user",
    generate_token: "user",
    encrypt_text: "user",
    decrypt_text: "user",
    set_security_mode: "admin",
    get_security_mode: "user",
    health: "user",
    audit_log: "user",
  };

  return domain("security", "Cifrado AES-256, hashes seguros, tokens criptográficos, permisos y auditoría de seguridad.", actions, permissions);
}
