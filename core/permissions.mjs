/**
 * FLUXER Permission Engine v10.0.0 (Project Z)
 * Sistemas de permisos por nivel + modos de seguridad + workflow temporal.
 *
 * NIVELES: guest < user < poweruser < admin < developer < admintotaluser
 * MODOS: LOCKDOWN < SAFE < NORMAL < POWER < ADMIN
 */

import crypto from "node:crypto";

export const LEVELS = ["guest", "user", "poweruser", "admin", "developer", "admintotaluser"];
export const LEVEL_RANK = Object.fromEntries(
  LEVELS.map((level, index) => [level, index]),
);

/**
 * Definición de modos de seguridad.
 * Cada modo restringe qué dominios y acciones están permitidas.
 */
export const SECURITY_MODES = {
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
    maxLevel: "admintotaluser",
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
    this.cacheTtlMs = 1000;
    this._securityMode = process.env.FLUXER_SECURITY_MODE || config?.security?.mode || "NORMAL";
    this._workflowTimer = null;
    this._audit("engine_started", { defaultLevel: this.defaultLevel, securityMode: this._securityMode });
    this._scheduleNextExpiration();
  }

  _audit(action, details = {}) {
    const safeDetails = { ...details };
    this.logger?.info(`audit: ${action}`, safeDetails);
  }

  get securityMode() {
    return this._securityMode;
  }

  setSecurityMode(mode) {
    if (!SECURITY_MODES[mode]) throw new Error(`Invalid security mode: ${mode}. Valid: ${Object.keys(SECURITY_MODES).join(", ")}`);
    const old = this._securityMode;
    this._securityMode = mode;
    this._audit("security_mode_changed", { from: old, to: mode });
    return { ok: true, mode, previous: old };
  }

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
    return LEVEL_RANK[level] ?? -1;
  }

  active() {
    if (this.cachedPermissions === null || Date.now() - this.cachedAt > this.cacheTtlMs) {
      this.cachedPermissions = this.memory.activePermissions();
      this.cachedAt = Date.now();
    }
    return this.cachedPermissions;
  }

  _scheduleNextExpiration() {
    if (this._workflowTimer) clearTimeout(this._workflowTimer);
    const perms = this.active();
    if (!perms || perms.length === 0) return;
    
    const now = Date.now();
    let nextExpiration = null;
    
    for (const p of perms) {
      if (p.expiresAt) {
        const exp = new Date(p.expiresAt).getTime();
        if (exp > now) {
          if (!nextExpiration || exp < nextExpiration) {
            nextExpiration = exp;
          }
        }
      }
    }
    
    if (nextExpiration) {
      const delay = Math.max(0, nextExpiration - now) + 100;
      this._workflowTimer = setTimeout(() => {
        this.cachedPermissions = null; // force reload
        this._scheduleNextExpiration();
      }, delay);
      this._workflowTimer.unref?.();
    }
  }

  currentLevel(scope = "*", principal = "default") {
    const perms = this.active();
    if (!perms || perms.length === 0) return this.defaultLevel;

    const now = Date.now();
    const valid = perms.filter((p) => {
      if (!p || !p.level) return false;
      if (p.expiresAt && new Date(p.expiresAt).getTime() <= now) return false;
      if (p.principal && p.principal !== principal) return false;
      return p.scope === "*" || p.scope === scope;
    });

    if (valid.length === 0) return this.defaultLevel;

    let best = valid.reduce((best, p) => {
      return this.levelRank(p.level) > this.levelRank(best) ? p.level : best;
    }, this.defaultLevel);

    const modeConfig = SECURITY_MODES[this._securityMode];
    if (modeConfig?.maxLevel) {
      if (best !== "admintotaluser" && this.levelRank(best) > this.levelRank(modeConfig.maxLevel)) {
        best = modeConfig.maxLevel;
      }
    }

    return best;
  }
  
  getWorkflow(principal = "default") {
    const perms = this.active();
    const now = Date.now();
    const workflow = perms.find(p => p.workflowId && p.principal === principal && (!p.expiresAt || new Date(p.expiresAt).getTime() > now));
    if (!workflow) return null;
    
    const expiresMs = new Date(workflow.expiresAt).getTime();
    return {
      workflowId: workflow.workflowId,
      principal: workflow.principal,
      level: workflow.level,
      startedAt: workflow.ts,
      expiresAt: workflow.expiresAt,
      remainingSeconds: Math.max(0, Math.round((expiresMs - now) / 1000)),
      status: "active",
      reason: workflow.reason
    };
  }

  checkSecurityMode(tool, action, currentLevel) {
    if (currentLevel === "admintotaluser") return { blocked: false };

    const modeConfig = SECURITY_MODES[this._securityMode];
    if (!modeConfig) return { blocked: false };

    if (this._securityMode === "LOCKDOWN") {
      const allowed = modeConfig.allowedActions;
      const key = `${tool}.${action}`;
      if (!allowed.has(key)) {
        return { blocked: true, reason: `LOCKDOWN mode: only essential read-only tools are allowed. Blocked: ${key}` };
      }
      return { blocked: false };
    }

    if (modeConfig.blockedDomains?.has(tool)) {
      return { blocked: true, reason: `Security mode ${this._securityMode}: domain "${tool}" is blocked.` };
    }

    const actionKey = `${tool}.${action}`;
    if (modeConfig.blockedActions?.has(actionKey)) {
      return { blocked: true, reason: `Security mode ${this._securityMode}: action "${actionKey}" is blocked.` };
    }

    return { blocked: false };
  }

  requiredFor(route, unit) {
    const tool = typeof route === "object" && route !== null ? route.tool : undefined;
    const action = typeof route === "object" && route !== null ? route.action : undefined;
    const declared = unit?.permissions?.[action];
    if (declared && declared in LEVEL_RANK) return declared;

    const HIGH_RISK_DOMAINS = new Set(["terminal", "packages"]);
    if (HIGH_RISK_DOMAINS.has(String(tool ?? "").toLowerCase())) return "poweruser";

    const actionStr = String(action ?? "").toLowerCase();
    const HIGH_RISK_HINTS = ["shell", "exec", "sudo", "delete_file", "delete_path", "kill_process", "install_package", "start_workflow"];
    if (HIGH_RISK_HINTS.some((hint) => actionStr.includes(hint))) return "poweruser";

    return "user";
  }

  assertAllowed(route, unit, principal = "default") {
    const tool = route?.tool;
    const action = route?.action;
    const current = this.currentLevel("*", principal);

    const modeCheck = this.checkSecurityMode(tool, action, current);
    if (modeCheck.blocked) {
      const err = new Error(modeCheck.reason);
      err.code = "SECURITY_MODE_BLOCKED";
      this._audit("security_mode_blocked", { tool, action, mode: this._securityMode, reason: modeCheck.reason });
      throw err;
    }

    const required = this.requiredFor(route, unit);

    if (process.env.FLUXER_TRUSTED_CLIENT === "true" || this.config?.security?.trustedClient === true) {
      this._audit("permission_bypassed_trusted_client", { tool, action, required });
      return true;
    }

    if (this.levelRank(current) < this.levelRank(required)) {
      const workflow = this.getWorkflow(principal);
      
      const structuredError = {
        error: "PERMISSION_DENIED",
        message: `Route "${tool}.${action}" requires level "${required}", but current level is "${current}".`,
        currentLevel: current,
        requiredLevel: required,
        workflow: workflow ? { status: "active", remainingSeconds: workflow.remainingSeconds } : { status: "inactive" },
        action: `Call 'security.start_workflow' to request elevated permissions (e.g. level: "${required}", durationMinutes: 10).`
      };

      const err = new Error(JSON.stringify(structuredError, null, 2));
      err.code = "PERMISSION_DENIED";
      err.structured = structuredError;
      
      this._audit("permission_denied", { tool, action, required, current, principal });
      throw err;
    }

    return true;
  }

  startWorkflow({ level = "poweruser", durationMinutes = 20, reason = "Workflow elevation", principal = "default" } = {}) {
    if (!(level in LEVEL_RANK)) throw new Error(`Invalid level: ${level}`);
    const minutes = Math.max(1, Math.min(Number(durationMinutes) || 20, 240)); 
    
    this.revokeWorkflow({ principal });

    const workflowId = `wf_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const expiresAt = new Date(Date.now() + minutes * 60000);
    
    this._audit("elevation_requested", { level, durationMinutes: minutes, principal });

    this.memory.grantPermission({ 
      level, 
      scope: "*", 
      expiresAt: expiresAt.toISOString(), 
      reason, 
      principal,
      workflowId 
    });
    
    this.cachedPermissions = null;
    this.cachedAt = 0;
    this._scheduleNextExpiration();
    
    this._audit("workflow_started", { workflowId, level, expiresAt: expiresAt.toISOString(), principal });
    
    return { 
      workflowId, 
      principal, 
      level, 
      expiresAt: expiresAt.toISOString(), 
      durationMinutes: minutes,
      status: "active"
    };
  }

  revokeWorkflow({ principal = "default" } = {}) {
    const workflow = this.getWorkflow(principal);
    if (workflow) {
      this.memory.revokeWorkflow(workflow.workflowId);
      this.cachedPermissions = null;
      this.cachedAt = 0;
      this._audit("workflow_revoked", { workflowId: workflow.workflowId, principal });
      return { ok: true, revoked: true, workflowId: workflow.workflowId };
    }
    return { ok: true, revoked: false, message: "No active workflow found for this principal." };
  }

  grantElevation(args) {
    return this.startWorkflow({ level: "admin", durationMinutes: args.durationMinutes, reason: args.reason, principal: "default" });
  }

  getElevationStatus() {
    const wf = this.getWorkflow("default");
    if (!wf) {
      return {
        elevation_active: false,
        message: "No hay permisos elevados activos. Las herramientas de administración requieren autorización previa del usuario mediante security.start_workflow.",
      };
    }
    const mins = Math.floor(wf.remainingSeconds / 60);
    const secs = wf.remainingSeconds % 60;
    return {
      elevation_active: true,
      workflowId: wf.workflowId,
      level: wf.level,
      granted_at: wf.startedAt,
      expires_at: wf.expiresAt,
      remaining_seconds: wf.remainingSeconds,
      remaining_formatted: `${mins}m ${secs}s`,
      reason: wf.reason,
    };
  }

  isElevationActive(principal = "default") {
    const wf = this.getWorkflow(principal);
    return Boolean(wf && wf.remainingSeconds > 0);
  }

  revokeElevation() {
    return this.revokeWorkflow({ principal: "default" });
  }

  grant({ level = "poweruser", scope = "*", minutes = 5, reason = "temporary grant" } = {}) {
    return this.startWorkflow({ level, durationMinutes: minutes, reason, principal: "default" });
  }

  revoke({ scope } = {}) {
    this.memory.revokePermissions(scope, null);
    this.cachedPermissions = null;
    this.cachedAt = 0;
    return { revoked: scope ?? "*" };
  }
}
