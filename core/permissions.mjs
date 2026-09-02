/**
 * FLUXER Permission Engine v7.0
 * Sistemas de permisos por nivel + modos de seguridad (SAFE/NORMAL/POWER/ADMIN/LOCKDOWN).
 *
 * NIVELES: guest < user < poweruser < admin < developer
 * MODOS: LOCKDOWN < SAFE < NORMAL < POWER < ADMIN
 */

const LEVELS = ["guest", "user", "poweruser", "admin", "developer"];
const LEVEL_RANK = Object.fromEntries(
  LEVELS.map((level, index) => [level, index]),
);

/**
 * Definición de modos de seguridad.
 * Cada modo restringe qué dominios y acciones están permitidas.
 */
const SECURITY_MODES = {
  /** LOCKDOWN: Solo herramientas esenciales de lectura */
  LOCKDOWN: {
    description: "Only essential read-only tools allowed",
    allowedDomains: new Set(["system", "files"]),
    blockedDomains: new Set(["terminal", "packages", "database", "browser", "git", "ollama"]),
    allowedActions: new Set([
      "system.get_system_info", "system.get_cpu_info", "system.get_ram_info",
      "system.get_storage_info", "system.get_system_snapshot",
      "files.read_text_file", "files.read_file_range", "files.read_json",
      "files.list_directory", "files.get_file_info",
    ]),
    maxLevel: "user",
  },
  /** SAFE: Solo lectura — no escritura, no terminal, no delete */
  SAFE: {
    description: "Read-only mode — no writes, no terminal, no delete",
    blockedDomains: new Set(["terminal", "packages"]),
    blockedActions: new Set([
      "files.write_file", "files.delete_path", "files.move_file", "files.append_to_file",
      "files.edit_file", "files.write_json", "files.touch_file", "files.batch_rename",
      "files.find_and_replace_in_files", "files.copy_file",
      "git.add", "git.commit", "git.push", "git.checkout", "git.pull", "git.stash",
      "ollama.pull", "ollama.run",
      "security.grant_permission", "security.revoke_permission",
      "system.set_clipboard", "system.set_env", "system.manage_services",
    ]),
    maxLevel: "user",
  },
  /** NORMAL: Lectura + modificaciones comunes (default) */
  NORMAL: {
    description: "Normal mode — reads and common modifications",
    blockedDomains: new Set([]),
    blockedActions: new Set([]),
    maxLevel: "poweruser",
  },
  /** POWER: Puede ejecutar comandos de terminal */
  POWER: {
    description: "Power mode — terminal execution allowed",
    blockedDomains: new Set([]),
    blockedActions: new Set([]),
    maxLevel: "admin",
  },
  /** ADMIN: Acceso completo */
  ADMIN: {
    description: "Admin mode — full access",
    blockedDomains: new Set([]),
    blockedActions: new Set([]),
    maxLevel: "developer",
  },
};

export class PermissionEngine {
  constructor({ memory, logger, config = null }) {
    this.memory = memory;
    this.logger = logger;
    this.config = config;
    this.defaultLevel = process.env.FLUXER_DEFAULT_LEVEL || "poweruser";
    this.cachedPermissions = null;
    this.cachedAt = 0;
    this.cacheTtlMs = 5000;

    // Modo de seguridad — leído de config o env
    this._securityMode = process.env.FLUXER_SECURITY_MODE || config?.security?.mode || "NORMAL";
  }

  /** Obtiene el modo de seguridad activo */
  get securityMode() {
    return this._securityMode;
  }

  /** Cambia el modo de seguridad en runtime */
  setSecurityMode(mode) {
    if (!SECURITY_MODES[mode]) throw new Error(`Invalid security mode: ${mode}. Valid: ${Object.keys(SECURITY_MODES).join(", ")}`);
    const old = this._securityMode;
    this._securityMode = mode;
    this.logger?.info("security_mode_changed", { from: old, to: mode });
    return { ok: true, mode, previous: old };
  }

  /** Info del modo actual */
  modeInfo() {
    const mode = SECURITY_MODES[this._securityMode] || SECURITY_MODES.NORMAL;
    return {
      mode: this._securityMode,
      description: mode.description,
      maxLevel: mode.maxLevel,
      blockedDomains: [...(mode.blockedDomains || [])],
      blockedActions: [...(mode.blockedActions || [])],
      availableModes: Object.keys(SECURITY_MODES),
    };
  }

  levelRank(level) {
    return LEVEL_RANK[level] ?? 0;
  }

  active() {
    if (
      this.cachedPermissions === null ||
      Date.now() - this.cachedAt > this.cacheTtlMs
    ) {
      this.cachedPermissions = this.memory.activePermissions();
      this.cachedAt = Date.now();
    }
    return this.cachedPermissions;
  }

  // Returns the highest active permission level for the given scope.
  currentLevel(scope = "*") {
    const perms = this.active();
    if (!perms || perms.length === 0) return this.defaultLevel;

    const now = new Date();
    const valid = perms.filter((p) => {
      if (!p || !p.level) return false;
      if (p.expiresAt && new Date(p.expiresAt) < now) return false;
      return p.scope === "*" || p.scope === scope;
    });

    if (valid.length === 0) return this.defaultLevel;

    // Return the highest rank among valid permissions
    let best = valid.reduce((best, p) => {
      return this.levelRank(p.level) > this.levelRank(best) ? p.level : best;
    }, this.defaultLevel);

    // Cap by security mode maxLevel
    const modeConfig = SECURITY_MODES[this._securityMode];
    if (modeConfig?.maxLevel) {
      if (this.levelRank(best) > this.levelRank(modeConfig.maxLevel)) {
        best = modeConfig.maxLevel;
      }
    }

    return best;
  }

  /**
   * Verifica si un dominio/acción está bloqueado por el modo de seguridad actual.
   * @param {string} tool
   * @param {string} action
   * @returns {{ blocked: boolean, reason?: string }}
   */
  checkSecurityMode(tool, action) {
    const modeConfig = SECURITY_MODES[this._securityMode];
    if (!modeConfig) return { blocked: false };

    // LOCKDOWN: solo acciones explícitamente permitidas
    if (this._securityMode === "LOCKDOWN") {
      const allowed = modeConfig.allowedActions;
      const key = `${tool}.${action}`;
      if (!allowed.has(key)) {
        return { blocked: true, reason: `LOCKDOWN mode: only essential read-only tools are allowed. Blocked: ${key}` };
      }
      return { blocked: false };
    }

    // Dominio bloqueado
    if (modeConfig.blockedDomains?.has(tool)) {
      return { blocked: true, reason: `Security mode ${this._securityMode}: domain "${tool}" is blocked.` };
    }

    // Acción bloqueada
    const actionKey = `${tool}.${action}`;
    if (modeConfig.blockedActions?.has(actionKey)) {
      return { blocked: true, reason: `Security mode ${this._securityMode}: action "${actionKey}" is blocked.` };
    }

    return { blocked: false };
  }

  // Returns the minimum level required to use this tool route.
  //
  // FIX (fase 1 de seguridad): la versión anterior hacía String(route) sobre
  // un objeto { tool, action } — eso siempre produce "[object Object]", que
  // nunca contiene "admin"/"shell"/"system"/"exec". En la práctica TODAS las
  // rutas, incluyendo terminal.run_command o packages.install_package,
  // quedaban en nivel "user" sin importar lo que declara cada dominio en su
  // bloque `permissions: {...}` dentro de registry.mjs.
  requiredFor(route, unit) {
    const tool = typeof route === "object" && route !== null ? route.tool : undefined;
    const action = typeof route === "object" && route !== null ? route.action : undefined;
    const declared = unit?.permissions?.[action];
    if (declared && declared in LEVEL_RANK) return declared;

    // Red de seguridad #1: dominios intrínsecamente peligrosos
    const HIGH_RISK_DOMAINS = new Set(["terminal", "packages", "process", "database", "security", "development"]);
    if (HIGH_RISK_DOMAINS.has(String(tool ?? "").toLowerCase())) return "poweruser";

    // Red de seguridad #2: acciones que sugieren riesgo por nombre
    const actionStr = String(action ?? "").toLowerCase();
    const HIGH_RISK_HINTS = ["shell", "exec", "sudo", "delete", "remove", "kill", "install", "grant", "revoke", "run_"];
    if (HIGH_RISK_HINTS.some((hint) => actionStr.includes(hint))) return "poweruser";

    return "user";
  }

  assertAllowed(route, unit) {
    const tool = route?.tool;
    const action = route?.action;

    // Verificar modo de seguridad primero (antes de permisos de nivel)
    const modeCheck = this.checkSecurityMode(tool, action);
    if (modeCheck.blocked) {
      const err = new Error(modeCheck.reason);
      err.code = "SECURITY_MODE_BLOCKED";
      this.logger?.warn("security_mode_blocked", { tool, action, mode: this._securityMode, reason: modeCheck.reason });
      throw err;
    }

    const required = this.requiredFor(route, unit);

    // TRUSTED_CLIENT env flag: permite bypass para entornos de desarrollo local.
    // Queda auditado en el log.
    if (process.env.FLUXER_TRUSTED_CLIENT === "true" || this.config?.security?.trustedClient === true) {
      this.logger?.warn("permission_bypassed_trusted_client", {
        tool,
        action,
        required,
      });
      return true;
    }

    const current = this.currentLevel();

    if (this.levelRank(current) < this.levelRank(required)) {
      const err = new Error(
        `Permission denied: route "${tool}.${action}" requires level "${required}", current level is "${current}".`,
      );
      err.code = "PERMISSION_DENIED";
      this.logger?.warn("permission_denied", {
        tool,
        action,
        required,
        current,
      });
      throw err;
    }

    return true;
  }

  grant({
    level = "poweruser",
    scope = "*",
    minutes = 60,
    reason = "temporary grant",
  } = {}) {
    if (!(level in LEVEL_RANK)) throw new Error(`invalid level: ${level}`);
    const expiresAt = new Date(
      Date.now() + Math.min(Math.max(Number(minutes) || 60, 1), 240) * 60000,
    );
    this.memory.grantPermission({ level, scope, expiresAt, reason });
    this.cachedPermissions = null;
    this.cachedAt = 0;
    this.logger?.info("permission_granted", {
      level,
      scope,
      expiresAt: expiresAt.toISOString(),
      reason,
    });
    return { level, scope, expiresAt: expiresAt.toISOString(), reason };
  }

  revoke({ scope } = {}) {
    this.memory.revokePermissions(scope);
    this.cachedPermissions = null;
    this.cachedAt = 0;
    this.logger?.info("permission_revoked", { scope: scope ?? "*" });
    return { revoked: scope ?? "*" };
  }
}
