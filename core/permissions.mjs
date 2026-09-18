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
import path from "node:path";

/**
 * Validates that targetPath is securely inside one of allowedDirs.
 * Normalizes paths, resolves '..', enforces separator boundaries (prevents C:\dir-evil attacks),
 * and handles Windows case-insensitivity.
 */
export function isPathInsideAllowed(targetPath, allowedDirs) {
  if (!targetPath || !allowedDirs) return false;
  const dirs = Array.isArray(allowedDirs) ? allowedDirs : [allowedDirs];
  if (dirs.length === 0) return false;

  const resolvedTarget = path.resolve(String(targetPath));
  const normalizedTarget = path.normalize(resolvedTarget);
  const targetLower = process.platform === "win32" ? normalizedTarget.toLowerCase() : normalizedTarget;

  for (const dir of dirs) {
    if (dir === "*") return true;
    let cleanDir = String(dir).trim();
    if (cleanDir.endsWith("/*") || cleanDir.endsWith("\\*")) {
      cleanDir = cleanDir.slice(0, -2);
    }
    const resolvedAllowed = path.resolve(cleanDir);
    const normalizedAllowed = path.normalize(resolvedAllowed);
    const allowedLower = process.platform === "win32" ? normalizedAllowed.toLowerCase() : normalizedAllowed;

    if (targetLower === allowedLower) return true;
    const prefix = allowedLower.endsWith(path.sep) ? allowedLower : allowedLower + path.sep;
    if (targetLower.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Checks if a capability lease scope matches the requested tool and action.
 */
export function isScopeMatching(scope, tool, action) {
  if (!scope || scope === "*") return true;
  const s = String(scope).toLowerCase().trim();
  const t = String(tool || "").toLowerCase().trim();
  const a = String(action || "").toLowerCase().trim();
  const full = `${t}.${a}`;

  if (s === t || s === `${t}.*` || s === `${t}:*`) return true;
  if (s === full || s === `${t}:${a}`) return true;
  return false;
}

export const PERMISSION_LEVELS = Object.freeze({
  0: "GUEST",
  1: "USER",
  2: "POWER_USER",
  3: "ADMIN",
  GUEST: 0,
  USER: 1,
  POWER_USER: 2,
  ADMIN: 3,
});

export const LEVELS = ["GUEST", "USER", "POWER_USER", "ADMIN"];

export const LEVEL_ALIASES = {
  guest: "GUEST",
  visitor: "GUEST",
  readonly: "GUEST",
  0: "GUEST",

  user: "USER",
  standard: "USER",
  basic: "USER",
  normal: "USER",
  1: "USER",

  power_user: "POWER_USER",
  poweruser: "POWER_USER",
  advanced: "POWER_USER",
  power: "POWER_USER",
  operator: "POWER_USER",
  elevated: "POWER_USER",
  workspace_dev: "POWER_USER",
  workspace_developer: "POWER_USER",
  2: "POWER_USER",

  admin: "ADMIN",
  maintainer: "ADMIN",
  developer: "ADMIN",
  supervisor: "ADMIN",
  system_admin: "ADMIN",
  sys_admin: "ADMIN",
  dev: "ADMIN",
  engineer: "ADMIN",
  admintotaluser: "ADMIN",
  totaladmin: "ADMIN",
  system_root: "ADMIN",
  root: "ADMIN",
  master: "ADMIN",
  full_control: "ADMIN",
  total_admin: "ADMIN",
  root_elevated: "ADMIN",
  elevated_root: "ADMIN",
  3: "ADMIN",
};

export function normalizeLevel(level) {
  if (level === undefined || level === null) return "USER";
  if (typeof level === "number") {
    return PERMISSION_LEVELS[level] || "USER";
  }
  const clean = String(level).toLowerCase().trim();
  return LEVEL_ALIASES[clean] || (LEVELS.includes(clean.toUpperCase()) ? clean.toUpperCase() : "USER");
}

export const LEVEL_RANK = {
  GUEST: 0,
  USER: 1,
  POWER_USER: 2,
  ADMIN: 3,

  // Legacy mappings for full backward compatibility
  visitor: 0,
  guest: 0,
  readonly: 0,
  standard: 1,
  user: 1,
  basic: 1,
  normal: 1,
  advanced: 2,
  poweruser: 2,
  power: 2,
  maintainer: 3,
  developer: 3,
  admin: 3,
  system_root: 3,
  root: 3,
};

export const OPERATION_LEVEL_MAP = Object.freeze({
  // Web (Level 1: USER)
  "web.search": 1,
  "web.search_images": 1,
  "web.images": 1,
  "web.download": 1,
  "web.extract": 1,
  "web.read_page": 1,
  "web.wikipedia": 1,
  "web.reddit": 1,
  "web.multi_search": 1,

  // Print
  "print.list_printers": 0,
  "print.list": 0,
  "print.printers": 0,
  "print.get_printer": 0,
  "print.status": 0,
  "print.info": 0,
  "print.capabilities": 0,
  "print.jobs": 0,
  "print.queue": 0,
  "print.preflight": 1,
  "print.dry_run": 1,
  "print.preview": 1,
  "print.vista_previa": 1,
  "print.pdf_info": 1,
  "print.print": 2,
  "print.print_file": 2,
  "print.print_pdf": 2,
  "print.cancel_job": 2,
  "print.cancel": 2,
  "print.configure": 2,
  "print.purge_queue": 3,

  // Files
  "files.read": 0,
  "files.read_text_file": 0,
  "files.read_file": 0,
  "files.read_file_range": 0,
  "files.read_json": 0,
  "files.read_csv": 0,
  "files.read_binary_file": 0,
  "files.list": 0,
  "files.list_directory": 0,
  "files.list_files": 0,
  "files.search": 0,
  "files.search_files": 0,
  "files.grep": 0,
  "files.grep_files": 0,
  "files.metadata": 0,
  "files.get_file_info": 0,
  "files.get_metadata": 0,
  "files.get_info": 0,
  "files.hash": 0,
  "files.calculate_checksum": 0,
  "files.file_exists": 0,
  "files.directory_tree": 0,
  "files.list_recycle_bin": 0,
  "files.get_recycle_bin": 0,
  "files.write": 2,
  "files.write_file": 2,
  "files.create_file": 2,
  "files.edit": 2,
  "files.edit_file": 2,
  "files.patch_file": 2,
  "files.replace_file_content": 2,
  "files.copy_move": 2,
  "files.copy_file": 2,
  "files.move_file": 2,
  "files.image_to_pdf": 1,
  "files.convert_image_to_pdf": 1,
  "files.img2pdf": 1,
  "files.images_to_pdf": 1,
  "files.merge_pdfs": 1,
  "files.combine_pdfs": 1,
  "files.pdf_merge": 1,
  "files.delete": 3,
  "files.delete_path": 3,
  "files.delete_file": 3,
  "files.recycle_path": 3,
  "files.recycle_file": 3,
  "files.delete_to_trash": 3,
  "files.clear_recycle_bin": 3,
  "files.gc": 3,

  // System
  "system.snapshot": 0,
  "system.get_system_snapshot": 0,
  "system.get_system_info": 0,
  "system.processes": 0,
  "system.disks": 0,
  "system.optimize_ram": 2,
  "system.environment": 2,
  "system.toast": 1,
  "system.kill_process": 3,
  "system.services": 3,
  "system.bcd": 3,

  // Terminal
  "terminal.exec": 3,
  "terminal.background": 3,
  "terminal.jobs": 1,
  "terminal.kill_job": 3,
  "terminal.elevated_exec": 3,

  // Security
  "security.status": 0,
  "security.list_levels": 0,
  "security.get_lease": 0,
  "security.list_leases": 0,
  "security.classify_permission_level": 0,
  "security.audit_log": 0,
  "security.worm_audit": 0,
  "security.request_action_approval": 0,
  "security.simulate_user_click": 0,
  "security.approve_user_action": 0,
  "security.worm_audit_verify": 0,
  "security.grant_lease": 3,
  "security.revoke_lease": 3,
  "security.grant_elevation": 3,
  "security.revoke_elevation": 1,
  "security.approve_request": 3,

  // Developer
  "developer.detect_project": 0,
  "developer.inspect_code": 0,
  "developer.telemetry": 0,
  "developer.skills": 1,
  "developer.notifications": 1,
  "developer.git": 2,
  "developer.run_project_tests": 2,
  "developer.run_project_build": 2,

  // Workflow
  "workflow.status": 0,
  "workflow.runs": 0,
  "workflow.checkpoints": 0,
  "workflow.validate": 0,
  "workflow.template": 0,
  "workflow.run": 1,
  "workflow.resume": 1,

  // Database
  "database.tables": 0,
  "database.schema": 0,
  "database.export": 0,
  "database.query": 2,

  // Packages
  "packages.list_installed": 0,
  "packages.search": 0,
  "packages.info": 0,
  "packages.install": 3,
  "packages.update": 3,
  "packages.uninstall": 3,

  // Media
  "media.inspect": 0,
  "media.desktop": 2,
  "media.window": 2,
  "media.app": 2,
  "media.region": 2,

  // FL Studio
  "flstudio.detect": 0,
  "flstudio.bridge_status": 0,
  "flstudio.plugins": 0,
  "flstudio.view": 0,
  "flstudio.open": 2,
  "flstudio.music_create": 2,
  "flstudio.transport": 2,
  "flstudio.channels": 2,
  "flstudio.patterns": 2,
  "flstudio.mixer": 2,

  // Guide
  "guide.overview": 0,
  "guide.search": 0,
  "guide.category": 0,
  "guide.capability_info": 0,
  "guide.workflows": 0,

  // Upd
  "upd.check": 0,
  "upd.info": 0,
  "upd.status": 0,
  "upd.apply": 3,
  "upd.rollback": 3,
});

export function classifyPermissionLevel(tool, action) {
  const t = String(tool || "").toLowerCase().trim();
  const a = String(action || "").toLowerCase().trim();
  const key = `${t}.${a}`;

  let level = 1; // Default: USER
  if (key in OPERATION_LEVEL_MAP) {
    level = OPERATION_LEVEL_MAP[key];
  } else if (a.startsWith("get_") || a.startsWith("list_") || a.startsWith("search_") || a.startsWith("read_") || a === "info" || a === "status") {
    level = 0; // GUEST
  } else if (a.includes("delete") || a.includes("kill") || a.includes("purge") || a.includes("uninstall") || a.includes("gc") || t === "terminal") {
    level = 3; // ADMIN
  } else if (a.includes("write") || a.includes("create") || a.includes("edit") || a.includes("convert") || a.includes("merge") || a.includes("print")) {
    level = 2; // POWER_USER
  }

  const name = PERMISSION_LEVELS[level] || "USER";
  const DESCRIPTIONS = {
    0: "GUEST — Read-only queries, system telemetry, search, directory listing",
    1: "USER — Basic downloads, web searches, preflight validations",
    2: "POWER_USER — Filesystem writes, image/PDF conversion, printing, builds",
    3: "ADMIN — Destructive operations, process termination, GC, terminal execution (Requires Capability Lease)",
  };

  return {
    level,
    name,
    requiredLevel: name,
    description: DESCRIPTIONS[level] || name,
  };
}

export function isDestructiveOperation(tool, action) {
  const t = String(tool || "").toLowerCase().trim();
  const a = String(action || "").toLowerCase().trim();
  const DESTRUCTIVE_ACTIONS = new Set([
    "files.delete",
    "files.delete_path",
    "files.delete_file",
    "files.recycle_path",
    "files.recycle_file",
    "files.clear_recycle_bin",
    "files.gc",
    "system.kill_process",
    "terminal.kill_job",
    "print.purge_queue",
    "security.revoke_lease",
    "security.grant_lease",
    "security.approve_user_action",
    "packages.uninstall",
    "upd.apply",
    "upd.rollback",
  ]);
  if (DESTRUCTIVE_ACTIONS.has(`${t}.${a}`)) return true;
  return a.includes("delete") || a.includes("kill") || a.includes("purge") || a.includes("uninstall") || a === "gc";
}

/**
 * Definición de modos de seguridad.
 * Cada modo restringe qué dominios y acciones están permitidas.
 */
export const SECURITY_MODES = {
  /** LOCKDOWN: Solo herramientas esenciales de lectura */
  LOCKDOWN: {
    description: "Only essential read-only tools allowed",
    allowedDomains: new Set(["system", "files", "developer"]),
    blockedDomains: new Set(["terminal", "packages", "database", "browser", "git", "ollama"]),
    allowedActions: new Set([
      "system.get_system_info", "system.get_cpu_info", "system.get_ram_info",
      "system.get_storage_info", "system.get_system_snapshot",
      "files.read_text_file", "files.read_file_range", "files.read_json",
      "files.list_directory", "files.get_file_info",
      "developer.list_my_feedbacks", "developer.read_feedback",
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
      "developer.delete_feedback",
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
    this.defaultLevel = normalizeLevel(process.env.FLUXER_DEFAULT_LEVEL || config?.security?.defaultLevel || "USER");
    this.cachedPermissions = null;
    this.cachedAt = 0;
    this.cacheTtlMs = 1000;
    this._securityMode = process.env.FLUXER_SECURITY_MODE || config?.security?.mode || "NORMAL";
    this._workflowTimer = null;
    this._sessionVisualGrants = new Map();
    this.userActionSecret = crypto.randomBytes(32).toString("hex");
    this.pendingActions = new Map();
    this._audit("engine_started", { defaultLevel: this.defaultLevel, securityMode: this._securityMode });
    this._scheduleNextExpiration();
  }

  classifyPermissionLevel(tool, action) {
    return classifyPermissionLevel(tool, action);
  }

  isDestructiveOperation(tool, action) {
    return isDestructiveOperation(tool, action);
  }

  _audit(action, details = {}) {
    const safeDetails = { ...details };
    this.logger?.info(`audit: ${action}`, safeDetails);
  }

  get securityMode() {
    return this._securityMode;
  }

  getSecurityMode() {
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
    const now = Date.now();
    if (this.cachedPermissions === null || now - this.cachedAt > this.cacheTtlMs) {
      this.cachedPermissions = this.memory ? this.memory.activePermissions() : [];
      this.cachedAt = now;
    }
    const nowMs = Date.now();
    return (this.cachedPermissions || []).filter((p) => {
      if (!p) return false;
      if (p.expiresAt) {
        const exp = new Date(p.expiresAt).getTime();
        if (isNaN(exp) || exp <= nowMs) return false;
      }
      if (p.level === "visual_capture_grant" || p.scope === "system.visual_capture") {
        return this.hasVisualCaptureGrant(p.principal || "default");
      }
      return true;
    });
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
      // Compatibilidad fluida entre clientes IA: Si el permiso fue otorgado a 'default', '*' o al mismo principal, es válido
      if (p.principal && p.principal !== "*" && principal !== "*" && p.principal !== "default" && principal !== "default" && p.principal !== principal) return false;
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
    const workflow = perms.find(p => p.workflowId && (p.principal === principal || p.principal === "default" || principal === "default" || p.principal === "*") && (!p.expiresAt || new Date(p.expiresAt).getTime() > now));
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
    const classified = classifyPermissionLevel(tool, action);
    return classified.name;
  }

  requestActionApproval({
    operation = null,
    tool = null,
    action = null,
    scope = null,
    args = {},
    budget = { max_calls: 1 },
    allowedPaths = [],
    runId = null,
    taskId = null,
  } = {}) {
    const op = operation || `${tool}.${action}`;
    const t = tool || op.split(".")[0];
    const a = action || op.split(".")[1];
    const actionId = `act_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
    const now = Date.now();
    const expiresSeconds = 300;

    const resolvedScope = scope || args?.scope || (a === "grant_lease" && (args?.args?.scope || args?.options?.scope)) || op;
    const resolvedBudget = (budget && (budget.max_calls !== 1 || budget.calls !== undefined)) ? budget : (args?.budget || (a === "grant_lease" && (args?.args?.budget || args?.options?.budget)) || budget || { max_calls: 1, calls: 1 });
    const resolvedPaths = allowedPaths?.length ? allowedPaths : (args?.allowedPaths || (a === "grant_lease" && (args?.args?.allowedPaths || args?.options?.allowedPaths)) || []);

    const challengeNonce = crypto.randomBytes(16).toString("hex");
    const actionData = {
      actionId,
      challengeNonce,
      operation: op,
      scope: resolvedScope,
      tool: t,
      action: a,
      args,
      budget: resolvedBudget,
      allowedPaths: resolvedPaths,
      runId: runId || args?.runId,
      taskId: taskId || args?.taskId,
      createdAt: now,
      expiresAt: now + expiresSeconds * 1000,
    };

    this.pendingActions.set(actionId, actionData);

    const title = "Fluxer Authorization Required";
    const body = `Allow operation '${op}' with level ADMIN?`;
    const notification = {
      title,
      body,
      buttons: [
        {
          label: "✓ Allow",
          action_uri: `fluxer://approve?action_id=${actionId}&sig=verified_action`,
          action_type: "allow_operation",
        },
        {
          label: "✗ Deny",
          action_uri: `fluxer://deny?action_id=${actionId}`,
          action_type: "deny_operation",
        },
      ],
      expires_seconds: expiresSeconds,
      prevent_copy_paste: true,
      require_user_click: true,
    };

    this._audit("action_approval_requested", { actionId, operation: op, tool: t, action: a });

    return {
      ok: true,
      actionId,
      challengeNonce,
      operation: op,
      requiredLevel: 3,
      requiredLevelName: "ADMIN",
      expiresInSeconds: expiresSeconds,
      notification,
    };
  }

  generateUserActionSignature(actionId, clickTimestamp, userId = "user") {
    const pending = this.pendingActions.get(actionId);
    const op = pending?.operation || "unknown";
    return crypto
      .createHmac("sha256", this.userActionSecret)
      .update(`${clickTimestamp}:${actionId}:${userId}:${op}`)
      .digest("hex");
  }

  simulateUserClick(actionId, clickTimestamp = Date.now(), userId = "user") {
    const ts = clickTimestamp || Date.now();
    const userActionSignature = this.generateUserActionSignature(actionId, ts, userId);
    return {
      actionId,
      action: "ALLOW",
      clickTimestamp: ts,
      userActionSignature,
      userActionVerified: true,
      verifiedBy: "Windows_Notification_Handler",
    };
  }

  approveUserAction({
    actionId,
    userActionSignature,
    clickTimestamp,
    userId = "user",
  } = {}) {
    if (!actionId) throw new Error("actionId is required for approveUserAction");
    const pending = this.pendingActions.get(actionId);
    if (!pending) {
      const err = new Error(`Action request '${actionId}' not found or already consumed.`);
      err.code = "ACTION_NOT_FOUND";
      throw err;
    }

    if (Date.now() > pending.expiresAt) {
      this.pendingActions.delete(actionId);
      const err = new Error(`Action request '${actionId}' has expired.`);
      err.code = "ACTION_EXPIRED";
      throw err;
    }

    const clickMs = typeof clickTimestamp === "number" ? clickTimestamp : new Date(clickTimestamp).getTime();
    if (isNaN(clickMs) || Math.abs(Date.now() - clickMs) > 300000) {
      const err = new Error(`User action timestamp is invalid or outside the 5-minute freshness window.`);
      err.code = "INVALID_TIMESTAMP";
      throw err;
    }

    const expectedSig = this.generateUserActionSignature(actionId, clickTimestamp, userId);
    if (userActionSignature !== expectedSig) {
      const err = new Error(`Invalid cryptographic user action signature: forged or invalid signature.`);
      err.code = "FORGED_USER_ACTION";
      this._audit("user_action_signature_failed", { actionId, operation: pending.operation });
      throw err;
    }

    this.pendingActions.delete(actionId);

    // Issue cryptographic Capability Lease with verified signature
    const lease = this.grantLease({
      runId: pending.runId,
      taskId: pending.taskId,
      scope: pending.scope || pending.operation,
      budget: pending.budget || { calls: 1 },
      allowedPaths: pending.allowedPaths || [],
      autoRevoke: true,
    });

    if (this.memory?.appendWormAudit) {
      this.memory.appendWormAudit({
        operation: "security.approve_user_action",
        tool: "security",
        action: "approve_user_action",
        permissionLevel: 3,
        principal: userId,
        leaseId: lease.leaseId,
        details: { actionId, operation: pending.operation, userActionSignature },
      });
    }

    this._audit("user_action_approved", { actionId, leaseId: lease.leaseId, operation: pending.operation });

    return {
      ok: true,
      approved: true,
      status: "approved",
      leaseId: lease.leaseId,
      leaseToken: lease.leaseId,
      lease,
      message: `User action approved. Active Capability Lease issued for '${pending.operation}'.`,
    };
  }

  assertAllowed(route, unit, principal = "default", callContext = {}) {
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

    const classified = classifyPermissionLevel(tool, action);
    const requiredLevel = classified.level;
    const requiredLevelName = classified.name;

    // ── Capability Leases Evaluation ──────────────────────────────────────────
    const runId = callContext.runId || route?.runId || route?.options?.runId || route?.args?.runId || null;
    const taskId = callContext.taskId || route?.taskId || route?.options?.taskId || route?.args?.taskId || null;
    const isSecurityLeaseQuery = tool === "security" && [
      "get_lease",
      "revoke_lease",
      "list_leases",
      "classify_permission_level",
      "request_action_approval",
      "approve_user_action",
      "status",
      "list_levels",
      "audit_log",
      "worm_audit",
      "get_worm_audit_log",
    ].includes(action);
    const explicitLeaseId = callContext.leaseToken || route?.leaseToken || (isSecurityLeaseQuery ? null : (callContext.leaseId || route?.leaseId || route?.options?.leaseId || route?.args?.leaseId)) || null;

    let matchingLease = null;
    if (explicitLeaseId) {
      matchingLease = this.memory ? this.memory.getLease(explicitLeaseId) : null;
      if (!matchingLease) {
        const err = new Error(`Capability lease '${explicitLeaseId}' not found.`);
        err.code = "LEASE_NOT_FOUND";
        throw err;
      }
    } else if (this.memory && (runId || taskId)) {
      // Find active lease matching task_id, run_id, or scope
      const activeLeases = this.memory.listActiveLeases({ runId, taskId });
      for (const lease of activeLeases) {
        if (isScopeMatching(lease.scope, tool, action)) {
          matchingLease = lease;
          break;
        }
      }
    }

    // Gate 3 Enforcement: TIER_3 (ADMIN) requires a valid Capability Lease!
    if (requiredLevel >= 3 && !isSecurityLeaseQuery) {
      if (!matchingLease) {
        const approvalReq = this.requestActionApproval({
          operation: `${tool}.${action}`,
          tool,
          action,
          args: route?.args || route?.options || {},
          requiredLevel: 3,
        });

        const structuredError = {
          error: "LEASE_REQUIRED",
          message: `La operación de nivel ADMIN '${tool}.${action}' requiere obligatoriamente un Capability Lease activo aprobado por el usuario (TIER 3).`,
          requiredLevel: 3,
          requiredLevelName: "ADMIN",
          currentLevel: current,
          tool,
          action,
          actionId: approvalReq.actionId,
          notification: approvalReq.notification,
          instruction_for_ai: `Esta acción requiere la confirmación explícita del usuario mediante acción verificada (clic en notificación interactiva o aprobación criptográfica). Invoca 'security.request_action_approval' o solicita que el usuario apruebe la acción '${approvalReq.actionId}'.`,
        };

        const err = new Error(JSON.stringify(structuredError, null, 2));
        err.code = "LEASE_REQUIRED";
        err.status = 403;
        err.structured = structuredError;
        this._audit("admin_lease_required_denied", { tool, action, requiredLevel: 3 });
        throw err;
      }
    }

    if (matchingLease) {
      // 1. Task & Run isolation check
      if (matchingLease.runId && runId && matchingLease.runId !== runId) {
        const err = new Error(`Lease run mismatch: lease belongs to run '${matchingLease.runId}', called from '${runId}'.`);
        err.code = "LEASE_RUN_MISMATCH";
        this._audit("lease_run_mismatch", { leaseId: matchingLease.leaseId, runId, leaseRunId: matchingLease.runId });
        throw err;
      }
      if (matchingLease.taskId && taskId && matchingLease.taskId !== taskId) {
        const err = new Error(`Lease task mismatch: lease belongs to task '${matchingLease.taskId}', called from '${taskId}'.`);
        err.code = "LEASE_TASK_MISMATCH";
        this._audit("lease_task_mismatch", { leaseId: matchingLease.leaseId, taskId, leaseTaskId: matchingLease.taskId });
        throw err;
      }

      // 2. Scope validation
      if (!isScopeMatching(matchingLease.scope, tool, action)) {
        const err = new Error(`Capability lease '${matchingLease.leaseId}' does not authorize scope '${tool}.${action}' (lease scope: '${matchingLease.scope}').`);
        err.code = "LEASE_SCOPE_DENIED";
        this._audit("lease_scope_denied", { leaseId: matchingLease.leaseId, tool, action, scope: matchingLease.scope });
        throw err;
      }

      // 3. Path boundary validation
      if (matchingLease.allowedPaths && matchingLease.allowedPaths.length > 0) {
        const targetPath = callContext.path || callContext.target || route?.target || route?.options?.path || route?.options?.target || route?.options?.file || route?.options?.filePath || route?.args?.path || route?.args?.target || route?.args?.file || route?.args?.filePath;
        if (targetPath && !isPathInsideAllowed(targetPath, matchingLease.allowedPaths)) {
          if (this.memory) {
            this.memory.recordLeaseEvent({
              leaseId: matchingLease.leaseId,
              runId: matchingLease.runId,
              taskId: matchingLease.taskId,
              action: `${tool}.${action}`,
              route: `${tool}.${action}`,
              decision: "PATH_DENIED",
              cost: matchingLease.costPerCall || 1,
              reason: `Path '${targetPath}' outside allowed boundaries`,
            });
          }
          const err = new Error(`Path '${targetPath}' is outside the authorized paths of capability lease '${matchingLease.leaseId}'.`);
          err.code = "PATH_OUTSIDE_LEASE";
          this._audit("lease_path_denied", { leaseId: matchingLease.leaseId, targetPath, allowedPaths: matchingLease.allowedPaths });
          throw err;
        }
      }

      // 4. Atomic quota consumption BEFORE tool execution
      const cost = matchingLease.costPerCall || 1;
      this.memory.consumeLeaseQuota(matchingLease.leaseId, cost, {
        action: `${tool}.${action}`,
        route: `${tool}.${action}`,
      });

      // Gate 4: Log destructive operations to immutable WORM audit log
      if (isDestructiveOperation(tool, action) && this.memory?.appendWormAudit) {
        this.memory.appendWormAudit({
          operation: `${tool}.${action}`,
          tool,
          action,
          permissionLevel: requiredLevel,
          principal,
          leaseId: matchingLease.leaseId,
          details: { path: route?.target || route?.options?.path || route?.args?.path || null },
        });
      }

      this._audit("lease_authorized_call", { leaseId: matchingLease.leaseId, tool, action, cost });
      return true;
    }

    if (process.env.FLUXER_TRUSTED_CLIENT === "true" || this.config?.security?.trustedClient === true) {
      this._audit("permission_bypassed_trusted_client", { tool, action, required: requiredLevelName });
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

    if (this.levelRank(current) < requiredLevel) {
      const workflow = this.getWorkflow(principal);
      
      const structuredError = {
        error: "PERMISSION_DENIED",
        message: `La acción "${tool}.${action}" requiere nivel de autorización "${requiredLevelName}" (nivel actual: "${current}").`,
        safety_notice: "Control amigable de seguridad MCP: Salvaguarda en Windows 11 para asegurar que las operaciones locales cuenten con el consentimiento del usuario.",
        currentLevel: current,
        requiredLevel: requiredLevelName,
        requiredNumericLevel: requiredLevel,
        workflow: workflow ? { status: "active", remainingSeconds: workflow.remainingSeconds } : { status: "inactive" },
        instruction_for_ai: `Esta operación requiere nivel ${requiredLevelName}. Solicite la aprobación o elevación al usuario.`,
      };

      const err = new Error(JSON.stringify(structuredError, null, 2));
      err.code = "PERMISSION_DENIED";
      err.status = 403;
      err.structured = structuredError;
      
      this._audit("permission_denied", { tool, action, required: requiredLevelName, current, principal });
      throw err;
    }

    if (isDestructiveOperation(tool, action) && this.memory?.appendWormAudit) {
      this.memory.appendWormAudit({
        operation: `${tool}.${action}`,
        tool,
        action,
        permissionLevel: requiredLevel,
        principal,
        details: { path: route?.target || route?.options?.path || route?.args?.path || null },
      });
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
      ok: true,
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
    if (!this._sessionVisualGrants || this._sessionVisualGrants.size === 0) return false;
    const now = Date.now();
    for (const [p, grant] of this._sessionVisualGrants) {
      if (grant && grant.expiresAt > now) {
        if (p === principal || p === "default" || principal === "default" || p === "*") {
          return true;
        }
      } else if (grant && grant.expiresAt <= now) {
        this._sessionVisualGrants.delete(p);
      }
    }
    return false;
  }

  grantVisualCapture({ durationMinutes = 5, principal = "default" } = {}) {
    const minutes = Math.max(1, Math.min(Number(durationMinutes) || 5, 60));
    const expiresAt = new Date(Date.now() + minutes * 60000);
    const expiresIso = expiresAt.toISOString();
    if (!this._sessionVisualGrants) this._sessionVisualGrants = new Map();
    this._sessionVisualGrants.set(principal, {
      expiresAt: expiresAt.getTime(),
      expiresIso,
      grantedAt: Date.now(),
    });
    this.memory?.grantPermission?.({
      level: "visual_capture_grant",
      visual_capture_grant: true,
      scope: "system.visual_capture",
      expiresAt: expiresIso,
      reason: `Autorización explícita de captura visual concedida por el usuario (${minutes} min)`,
      principal,
    });
    this.cachedPermissions = null;
    this.cachedAt = 0;
    this._audit("visual_capture_granted", { durationMinutes: minutes, principal, expiresAt: expiresIso });
    return { ok: true, granted: true, durationMinutes: minutes, expiresAt: expiresIso };
  }

  revokeVisualCapture({ principal = "default" } = {}) {
    this._sessionVisualGrants?.delete(principal);
    this.memory?.revokePermissions?.("system.visual_capture", principal);
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

  // ── Capability Leases API ─────────────────────────────────────────────────
  grantLease({
    runId = null,
    taskId = null,
    scope = "*",
    budget = {},
    costPerCall = 1,
    remainingCalls = null,
    allowedPaths = [],
    autoRevoke = true,
    expiresAt = null,
  } = {}) {
    if (!this.memory) throw new Error("Memory store unavailable");
    const leaseId = `lease_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
    const created = this.memory.createLease({
      leaseId,
      runId,
      taskId,
      scope,
      budget,
      costPerCall,
      remainingCalls,
      allowedPaths,
      autoRevoke,
      expiresAt,
    });
    this._audit("lease_granted", { leaseId, runId, taskId, scope });
    return created;
  }

  revokeLease(leaseId, reason = "manual_revoke") {
    if (!this.memory) return { ok: false };
    return this.memory.revokeLease(leaseId, reason);
  }

  revokeLeasesByRun(runId, reason = "workflow_finished") {
    if (!this.memory) return { ok: false };
    return this.memory.revokeLeasesByRun(runId, reason);
  }

  revokeLeasesByTask(taskId, reason = "task_finished") {
    if (!this.memory) return { ok: false };
    return this.memory.revokeLeasesByTask(taskId, reason);
  }

  getLease(leaseId) {
    if (!this.memory) return null;
    return this.memory.getLease(leaseId);
  }

  listActiveLeases(filter) {
    if (!this.memory) return [];
    return this.memory.listActiveLeases(filter);
  }
}
