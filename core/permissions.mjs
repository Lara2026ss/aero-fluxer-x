/**
 * FLUXER Permission Engine v10.3.0
 * Sistema integral de permisos por nivel + modos de seguridad + workflow temporal dinámico.
 *
 * NIVELES MODERNOS (Canónicos):
 *   visitor < standard < advanced < maintainer < developer < system_root
 *
 * ALIASES RETROCOMPATIBLES:
 *   guest/readonly -> visitor
 *   user/basic/normal -> standard
 *   poweruser/operator/elevated/power -> advanced
 *   admin/supervisor -> maintainer
 *   admintotaluser/totaladmin/root/full_control -> system_root
 *
 * MODOS DE SEGURIDAD:
 *   LOCKDOWN < SAFE < NORMAL < POWER < ADMIN
 */

import crypto from "node:crypto";

export const LEVELS = ["visitor", "standard", "advanced", "maintainer", "developer", "system_root"];

export const LEVEL_ALIASES = {
  // Visitor aliases
  guest: "visitor",
  visitor: "visitor",
  readonly: "visitor",

  // Standard aliases
  user: "standard",
  standard: "standard",
  basic: "standard",
  normal: "standard",

  // Advanced aliases
  poweruser: "advanced",
  advanced: "advanced",
  power: "advanced",
  operator: "advanced",
  elevated: "advanced",
  workspace_dev: "advanced",
  workspace_developer: "advanced",

  // Maintainer aliases
  admin: "maintainer",
  maintainer: "maintainer",
  supervisor: "maintainer",
  system_admin: "maintainer",
  sys_admin: "maintainer",

  // Developer aliases
  dev: "developer",
  developer: "developer",
  engineer: "developer",

  // System root aliases
  admintotaluser: "system_root",
  totaladmin: "system_root",
  system_root: "system_root",
  root: "system_root",
  master: "system_root",
  full_control: "system_root",
  total_admin: "system_root",
  root_elevated: "system_root",
  elevated_root: "system_root",
};

export function normalizeLevel(level) {
  if (!level || typeof level !== "string") return "standard";
  const clean = level.toLowerCase().trim();
  return LEVEL_ALIASES[clean] || (LEVELS.includes(clean) ? clean : "standard");
}

export const LEVEL_RANK = {
  // Canonical ranks
  visitor: 0,
  standard: 1,
  advanced: 2,
  maintainer: 3,
  developer: 4,
  system_root: 5,

  // Alias ranks for direct lookup compatibility
  guest: 0,
  readonly: 0,
  user: 1,
  basic: 1,
  normal: 1,
  poweruser: 2,
  power: 2,
  operator: 2,
  elevated: 2,
  workspace_dev: 2,
  workspace_developer: 2,
  admin: 3,
  supervisor: 3,
  system_admin: 3,
  sys_admin: 3,
  dev: 4,
  engineer: 4,
  admintotaluser: 5,
  totaladmin: 5,
  root: 5,
  master: 5,
  full_control: 5,
  total_admin: 5,
  root_elevated: 5,
  elevated_root: 5,
};

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
    maxLevel: "standard",
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
    maxLevel: "standard",
  },
  /** NORMAL: Lectura + modificaciones comunes (default) */
  NORMAL: {
    description: "Normal mode — reads and common modifications",
    blockedDomains: new Set([]),
    blockedActions: new Set([]),
    maxLevel: "advanced",
  },
  /** POWER: Puede ejecutar comandos de terminal y builds */
  POWER: {
    description: "Power mode — terminal execution allowed",
    blockedDomains: new Set([]),
    blockedActions: new Set([]),
    maxLevel: "maintainer",
  },
  /** ADMIN: Acceso completo */
  ADMIN: {
    description: "Admin mode — full access",
    blockedDomains: new Set([]),
    blockedActions: new Set([]),
    maxLevel: "system_root",
  },
};

export class PermissionEngine {
  constructor({ memory, logger, config = null }) {
    this.memory = memory;
    this.logger = logger;
    this.config = config;
    this.defaultLevel = normalizeLevel(process.env.FLUXER_DEFAULT_LEVEL || config?.security?.defaultLevel || "standard");
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
    const norm = normalizeLevel(level);
    return LEVEL_RANK[norm] ?? LEVEL_RANK[level] ?? -1;
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

    let best = valid.reduce((bestAcc, p) => {
      return this.levelRank(p.level) > this.levelRank(bestAcc) ? p.level : bestAcc;
    }, this.defaultLevel);

    const modeConfig = SECURITY_MODES[this._securityMode];
    if (modeConfig?.maxLevel) {
      const modeMaxNorm = normalizeLevel(modeConfig.maxLevel);
      if (normalizeLevel(best) !== "system_root" && this.levelRank(best) > this.levelRank(modeMaxNorm)) {
        best = modeMaxNorm;
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
      canonicalLevel: normalizeLevel(workflow.level),
      startedAt: workflow.ts,
      expiresAt: workflow.expiresAt,
      remainingSeconds: Math.max(0, Math.round((expiresMs - now) / 1000)),
      status: "active",
      reason: workflow.reason
    };
  }

  checkSecurityMode(tool, action, currentLevel) {
    const normCurrent = normalizeLevel(currentLevel);
    if (normCurrent === "system_root") return { blocked: false };

    const modeConfig = SECURITY_MODES[this._securityMode];
    if (!modeConfig) return { blocked: false };

    if (this._securityMode === "LOCKDOWN") {
      const allowed = modeConfig.allowedActions;
      const key = `${tool}.${action}`;
      if (!allowed.has(key)) {
        return { blocked: true, reason: `LOCKDOWN mode: solo se permiten herramientas esenciales de lectura. Bloqueado: ${key}` };
      }
      return { blocked: false };
    }

    if (modeConfig.blockedDomains?.has(tool)) {
      return { blocked: true, reason: `Modo de seguridad ${this._securityMode}: el dominio "${tool}" está restringido en este modo.` };
    }

    const actionKey = `${tool}.${action}`;
    if (modeConfig.blockedActions?.has(actionKey)) {
      return { blocked: true, reason: `Modo de seguridad ${this._securityMode}: la acción "${actionKey}" está restringida en este modo.` };
    }

    return { blocked: false };
  }

  requiredFor(route, unit) {
    const tool = typeof route === "object" && route !== null ? route.tool : undefined;
    const action = typeof route === "object" && route !== null ? route.action : undefined;
    const declared = unit?.permissions?.[action];
    if (declared && (declared in LEVEL_RANK || normalizeLevel(declared) in LEVEL_RANK)) {
      return normalizeLevel(declared);
    }

    const HIGH_RISK_DOMAINS = new Set(["terminal"]);
    if (HIGH_RISK_DOMAINS.has(String(tool ?? "").toLowerCase())) return "advanced";

    const actionStr = String(action ?? "").toLowerCase();
    const HIGH_RISK_HINTS = ["shell", "exec", "sudo", "delete_file", "delete_path", "kill_process", "install_package", "start_workflow"];
    if (HIGH_RISK_HINTS.some((hint) => actionStr.includes(hint))) return "advanced";

    return "standard";
  }

  assertAllowed(route, unit, principal = "default") {
    const tool = route?.tool;
    const action = route?.action;
    const current = normalizeLevel(this.currentLevel("*", principal));

    const modeCheck = this.checkSecurityMode(tool, action, current);
    if (modeCheck.blocked) {
      const err = new Error(modeCheck.reason);
      err.code = "SECURITY_MODE_BLOCKED";
      this._audit("security_mode_blocked", { tool, action, mode: this._securityMode, reason: modeCheck.reason });
      throw err;
    }

    const required = normalizeLevel(this.requiredFor(route, unit));

    if (process.env.FLUXER_TRUSTED_CLIENT === "true" || this.config?.security?.trustedClient === true) {
      this._audit("permission_bypassed_trusted_client", { tool, action, required });
      return true;
    }

    const isVisualCapture = (tool === "system" && ["capture_screen", "capture_window", "capture_region", "screenshot"].includes(action)) ||
      ["capture_screen", "capture_window", "capture_region", "screenshot"].includes(tool);

    if (isVisualCapture) {
      const hasVisualGrant = this.hasVisualCaptureGrant(principal);
      if (!hasVisualGrant) {
        const structuredError = {
          error: "PERMISSION_DENIED",
          message: `La acción de captura visual "${tool}.${action}" requiere autorización explícita de privacidad del usuario ('visual_capture_grant').`,
          safety_notice: "Protección de Privacidad Visual: La captura de pantalla contiene información personal y sensible potencialmente visible. Requiere consentimiento explícito y separado del usuario.",
          currentLevel: current,
          requiredLevel: "visual_capture_grant",
          instruction_for_ai: "Por favor explica al usuario cordialmente que deseas capturar su pantalla y solicita su autorización explícita en el chat antes de continuar.",
        };
        const err = new Error(JSON.stringify(structuredError, null, 2));
        err.code = "PERMISSION_DENIED";
        err.structured = structuredError;
        this._audit("visual_capture_permission_denied", { tool, action, principal });
        throw err;
      }
    }

    if (this.levelRank(current) < this.levelRank(required)) {
      const workflow = this.getWorkflow(principal);
      
      const structuredError = {
        error: "PERMISSION_DENIED",
        message: `La acción "${tool}.${action}" requiere nivel de autorización "${required}" (nivel actual: "${current}").`,
        safety_notice: "Control amigable de seguridad MCP: Salvaguarda en Windows 11 para asegurar que las operaciones locales cuenten con el consentimiento del usuario.",
        currentLevel: current,
        requiredLevel: required,
        workflow: workflow ? { status: "active", remainingSeconds: workflow.remainingSeconds } : { status: "inactive" },
        instruction_for_ai: `Por favor explica amablemente al usuario qué operación deseas realizar y solicita su confirmación. Si el usuario te permite trabajar durante una sesión (ej. 5 o 10 minutos), puedes usar 'security.approve_request({ requestId, grantMinutes: 5 })' o 'security.start_workflow({ level: "${required}", durationMinutes: 5 })' para avanzar fluidamente.`,
      };

      const err = new Error(JSON.stringify(structuredError, null, 2));
      err.code = "PERMISSION_DENIED";
      err.structured = structuredError;
      
      this._audit("permission_denied", { tool, action, required, current, principal });
      throw err;
    }

    return true;
  }

  startWorkflow({ level = "advanced", durationMinutes = 5, reason = "Sesión de trabajo autorizada", principal = "default" } = {}) {
    const canonicalLevel = normalizeLevel(level);
    if (LEVEL_RANK[canonicalLevel] === undefined) throw new Error(`Nivel de autorización inválido: ${level}`);
    const minutes = Math.max(1, Math.min(Number(durationMinutes) || 5, 240)); 
    
    this.revokeWorkflow({ principal });

    const workflowId = `wf_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const expiresAt = new Date(Date.now() + minutes * 60000);
    
    this._audit("elevation_requested", { level, canonicalLevel, durationMinutes: minutes, principal });
    this.memory.grantPermission({ 
      level, 
      canonicalLevel,
      scope: "*", 
      expiresAt: expiresAt.toISOString(), 
      reason, 
      principal,
      workflowId 
    });
    
    this.cachedPermissions = null;
    this.cachedAt = 0;
    this._scheduleNextExpiration();
    
    this._audit("workflow_started", { workflowId, level, canonicalLevel, expiresAt: expiresAt.toISOString(), principal });
    
    return { 
      workflowId, 
      principal, 
      level, 
      canonicalLevel,
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
    return { ok: true, revoked: false, message: "No se encontró ningún flujo de trabajo activo para revocar." };
  }

  grantElevation(args = {}) {
    return this.startWorkflow({ level: "maintainer", durationMinutes: args.durationMinutes || 10, reason: args.reason || "Elevación a nivel maintainer", principal: "default" });
  }

  getElevationStatus() {
    const wf = this.getWorkflow("default");
    if (!wf) {
      return {
        elevation_active: false,
        message: "No hay permisos elevados activos. Las herramientas avanzadas pueden solicitar confirmación del usuario mediante security.approve_request o security.start_workflow.",
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

  grant({ level = "advanced", scope = "*", minutes = 5, reason = "Permiso temporal concedido" } = {}) {
    return this.startWorkflow({ level: normalizeLevel(level), durationMinutes: minutes, reason, principal: "default" });
  }

  hasVisualCaptureGrant(principal = "default") {
    const perms = this.active();
    const now = Date.now();
    return perms.some(p => 
      p.principal === principal && 
      (p.level === "visual_capture_grant" || p.visual_capture_grant === true) && 
      (!p.expiresAt || new Date(p.expiresAt).getTime() > now)
    );
  }

  grantVisualCapture({ durationMinutes = 5, principal = "default" } = {}) {
    const minutes = Math.max(1, Math.min(Number(durationMinutes) || 5, 60));
    const expiresAt = new Date(Date.now() + minutes * 60000);
    this.memory.grantPermission({
      level: "visual_capture_grant",
      visual_capture_grant: true,
      scope: "system.visual_capture",
      expiresAt: expiresAt.toISOString(),
      reason: `Autorización explícita de captura visual concedida por el usuario (${minutes} min)`,
      principal,
    });
    this.cachedPermissions = null;
    this.cachedAt = 0;
    this._audit("visual_capture_granted", { durationMinutes: minutes, principal, expiresAt: expiresAt.toISOString() });
    return { ok: true, granted: true, durationMinutes: minutes, expiresAt: expiresAt.toISOString() };
  }

  revokeVisualCapture({ principal = "default" } = {}) {
    this.memory.revokePermissions("system.visual_capture", principal);
    this.cachedPermissions = null;
    this.cachedAt = 0;
    this._audit("visual_capture_revoked", { principal });
    return { ok: true, revoked: true };
  }

  revoke({ scope } = {}) {
    this.memory.revokePermissions(scope, null);
    this.cachedPermissions = null;
    this.cachedAt = 0;
    return { revoked: scope ?? "*" };
  }
}
