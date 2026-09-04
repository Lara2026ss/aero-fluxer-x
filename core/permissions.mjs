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
    this.defaultLevel = process.env.FLUXER_DEFAULT_LEVEL || config?.security?.defaultLevel || "user";
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
    if (this.isElevationActive()) {
      return "admin";
    }

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
  requiredFor(route, unit) {
    const tool = typeof route === "object" && route !== null ? route.tool : undefined;
    const action = typeof route === "object" && route !== null ? route.action : undefined;
    const declared = unit?.permissions?.[action];
    if (declared && declared in LEVEL_RANK) return declared;

    // Red de seguridad #1: dominios intrínsecamente de alto privilegio (ejecución de comandos y gestión de paquetes)
    const HIGH_RISK_DOMAINS = new Set(["terminal", "packages"]);
    if (HIGH_RISK_DOMAINS.has(String(tool ?? "").toLowerCase())) return "poweruser";

    // Red de seguridad #2: acciones que sugieren riesgo crítico por nombre
    const actionStr = String(action ?? "").toLowerCase();
    const HIGH_RISK_HINTS = ["shell", "exec", "sudo", "delete_file", "delete_path", "kill_process", "install_package", "grant_elevation"];
    if (HIGH_RISK_HINTS.some((hint) => actionStr.includes(hint))) return "poweruser";

    return "user";
  }

  assertAllowed(route, unit) {
    const tool = route?.tool;
    const action = route?.action;

    // Si el usuario otorgó un permiso temporal de elevación ("te doy permiso total"), autorizar
    if (this.isElevationActive()) {
      return true;
    }

    // Verificar modo de seguridad primero (antes de permisos de nivel)
    const modeCheck = this.checkSecurityMode(tool, action);
    if (modeCheck.blocked) {
      const err = new Error(modeCheck.reason);
      err.code = "SECURITY_MODE_BLOCKED";
      this.logger?.warn("security_mode_blocked", { tool, action, mode: this._securityMode, reason: modeCheck.reason });
      throw err;
    }

    const required = this.requiredFor(route, unit);

    // TRUSTED_CLIENT env flag: permite bypass para entornos de desarrollo local o testing.
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
        `Permission denied: route "${tool}.${action}" requires level "${required}", but current level is "${current}". ` +
        `Ask the user for confirmation: "Necesito ejecutar ${tool}.${action} (nivel ${required}). ¿Autorizas otorgar permisos por 5 minutos?". ` +
        `If the user approves, invoke security.grant_permission({ role: "${required}", minutes: 5 }).`
      );
      err.code = "PERMISSION_DENIED";
      err.requiredLevel = required;
      err.currentLevel = current;
      err.suggestedAction = `security.grant_permission({ role: "${required}", minutes: 5 })`;
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
    minutes = 5,
    reason = "temporary grant",
  } = {}) {
    if (!(level in LEVEL_RANK)) throw new Error(`invalid level: ${level}`);
    const expiresAt = new Date(
      Date.now() + Math.min(Math.max(Number(minutes) || 5, 1), 240) * 60000,
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

  grantElevation({ durationMinutes = 5, reason = "Permiso total de administración temporal" } = {}) {
    const minutes = Math.max(1, Number(durationMinutes) || 5);
    const now = Date.now();
    const expiresAt = now + (minutes * 60 * 1000);
    this._elevationGrant = {
      active: true,
      durationMinutes: minutes,
      grantedAt: new Date(now).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      expiresAtMs: expiresAt,
      reason,
      scope: "full_admin",
    };

    try {
      this.grant({ level: "admin", scope: "*", minutes, reason });
    } catch {}

    this.logger?.info("elevation_granted", this._elevationGrant);
    return {
      ok: true,
      elevation_active: true,
      duration_minutes: minutes,
      granted_at: this._elevationGrant.grantedAt,
      expires_at: this._elevationGrant.expiresAt,
      message: `Permiso total de administración activado por ${minutes} minutos. Las herramientas de administración se ejecutarán automáticamente durante este período.`,
    };
  }

  isElevationActive() {
    if (!this._elevationGrant || !this._elevationGrant.active) return false;
    if (Date.now() > this._elevationGrant.expiresAtMs) {
      this._elevationGrant.active = false;
      return false;
    }
    return true;
  }

  getElevationStatus() {
    if (!this.isElevationActive()) {
      return {
        elevation_active: false,
        message: "No hay permisos elevados activos. Las herramientas de administración requieren autorización previa del usuario.",
      };
    }
    const remainingMs = Math.max(0, this._elevationGrant.expiresAtMs - Date.now());
    const remainingSeconds = Math.round(remainingMs / 1000);
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    return {
      elevation_active: true,
      scope: this._elevationGrant.scope,
      granted_at: this._elevationGrant.grantedAt,
      expires_at: this._elevationGrant.expiresAt,
      remaining_seconds: remainingSeconds,
      remaining_formatted: `${mins}m ${secs}s`,
      reason: this._elevationGrant.reason,
    };
  }

  revokeElevation() {
    if (this._elevationGrant) {
      this._elevationGrant.active = false;
    }
    try {
      this.revoke({ scope: "*" });
    } catch {}
    return {
      ok: true,
      elevation_active: false,
      message: "Permiso de administración revocado exitosamente.",
    };
  }
}
