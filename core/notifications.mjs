// ============================================================================
// FLUXER MCP — core/notifications.mjs
// Centro de Notificaciones y Autorizaciones Integrado en Fluxer X
// 
// Gestiona alertas y solicitudes de autorización de permisos (admin/elevado,
// fuerte, medio) en memoria y en el Dashboard local de Fluxer.
// Permite al usuario dar acceso haciendo clic en "Autorizar" o rechazar/borrar
// haciendo clic en "X" (Denegar / No).
// ============================================================================

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";

export class NotificationCenter extends EventEmitter {
  constructor({ logger, confirmations, permissions, dirs } = {}) {
    super();
    this.logger = logger;
    this.confirmations = confirmations;
    this.permissions = permissions;
    this.dirs = dirs;
    this.notifications = new Map(); // id -> NotificationEntry
    this.storageFile = dirs?.storage ? path.join(dirs.storage, "notifications.json") : null;
    this.maxItems = 100;
    this.enabled = true;
  }

  isEnabled() {
    return this.enabled;
  }

  setEnabled(val) {
    this.enabled = Boolean(val);
    this.emit("config_changed", { enabled: this.enabled });
    return this.enabled;
  }

  async load() {
    if (!this.storageFile) return;
    try {
      const content = await fs.readFile(this.storageFile, "utf8");
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item && item.id) {
            this.notifications.set(item.id, item);
          }
        }
      }
    } catch (e) {
      if (e.code !== "ENOENT") {
        this.logger?.warn("notifications_load_error", { error: e.message });
      }
    }
    this.prune();
  }

  async save() {
    if (!this.storageFile) return;
    try {
      const serialized = JSON.stringify([...this.notifications.values()].slice(-this.maxItems), null, 2);
      await fs.writeFile(this.storageFile, serialized, "utf8");
    } catch (e) {
      this.logger?.warn("notifications_save_error", { error: e.message });
    }
  }

  prune() {
    const now = Date.now();
    for (const [id, notif] of this.notifications) {
      if (notif.expiresAt && notif.expiresAt < now && notif.status === "pending") {
        notif.status = "expired";
      }
    }
    if (this.notifications.size > this.maxItems) {
      const sorted = [...this.notifications.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
      const toRemove = sorted.slice(0, this.notifications.size - this.maxItems);
      for (const [id] of toRemove) {
        this.notifications.delete(id);
      }
    }
  }

  /**
   * Determina la categoría y nivel de impacto amigable para el usuario.
   */
  classifyLevel(level) {
    const l = String(level || "standard").toLowerCase();
    if (l === "system_root" || l === "root" || l === "admintotaluser") {
      return { category: "critical", badge: "SISTEMA ROOT", riskLabel: "CRÍTICO", requiresAttention: true };
    }
    if (l === "maintainer" || l === "admin" || l === "supervisor") {
      return { category: "admin_elevation", badge: "ADMIN / ELEVADO", riskLabel: "FUERTE (ADMIN)", requiresAttention: true };
    }
    if (l === "developer" || l === "dev") {
      return { category: "developer", badge: "DEVELOPER", riskLabel: "ALTO", requiresAttention: true };
    }
    if (l === "advanced" || l === "poweruser" || l === "elevated") {
      return { category: "strong_permission", badge: "MEDIO / FUERTE", riskLabel: "MEDIO", requiresAttention: true };
    }
    return { category: "standard", badge: "ESTÁNDAR", riskLabel: "BAJO", requiresAttention: false };
  }

  /**
   * Crea una notificación genérica integrada en Fluxer.
   */
  create({
    title,
    message,
    type = "info",
    level = "standard",
    tool = null,
    action = null,
    confirmationCode = null,
    requestId = null,
    args = null,
    ttlMs = 10 * 60 * 1000,
  } = {}) {
    this.prune();
    const id = `ntf_${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`;
    const classification = this.classifyLevel(level);

    const entry = {
      id,
      title: title || `Notificación de Fluxer`,
      message: message || "",
      type, // "permission_request" | "alert" | "info"
      level,
      category: classification.category,
      badge: classification.badge,
      riskLabel: classification.riskLabel,
      tool,
      action,
      confirmationCode,
      requestId,
      args: args ? { ...args } : null,
      status: "pending", // "pending" | "approved" | "denied" | "dismissed"
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      read: false,
    };

    this.notifications.set(id, entry);
    this.emit("created", entry);
    this.save().catch(() => {});
    return entry;
  }

  /**
   * Crea una notificación específica de solicitud de permisos para la IA.
   */
  notifyPermissionRequest({ tool, action, args, required, current, requestId, confirmationCode, ttlMs = 5 * 60 * 1000 }) {
    const classification = this.classifyLevel(required);
    
    let title = "";
    if (classification.category === "admin_elevation" || classification.category === "critical") {
      title = `⚠️ Elevación de Administrador Solicitada [${confirmationCode}]`;
    } else {
      title = `🔔 Autorización Requerida: ${tool}.${action} [${confirmationCode}]`;
    }

    const message = `La IA solicita ejecutar '${tool}.${action}' que requiere permisos de nivel '${classification.badge}'. Haz clic en 'Autorizar' para conceder acceso o en 'X' para denegar.`;

    return this.create({
      title,
      message,
      type: "permission_request",
      level: required,
      tool,
      action,
      confirmationCode,
      requestId,
      args,
      ttlMs,
    });
  }

  /**
   * Busca una notificación por ID, confirmationCode o requestId.
   */
  find(idOrCode) {
    if (!idOrCode) return null;
    this.prune();
    const query = String(idOrCode).trim();
    const queryUpper = query.toUpperCase();

    // 1. Coincidencia exacta por id
    if (this.notifications.has(query)) return this.notifications.get(query);

    // 2. Coincidencia por confirmationCode o requestId
    for (const notif of this.notifications.values()) {
      if (notif.confirmationCode && notif.confirmationCode === queryUpper) return notif;
      if (notif.requestId && notif.requestId === query) return notif;
    }

    return null;
  }

  /**
   * Autoriza el acceso a la IA (hacer clic en la notificación / botón Autorizar).
   */
  approve(idOrCode, { grantMinutes = 15 } = {}) {
    const notif = this.find(idOrCode);
    const code = notif?.confirmationCode || (String(idOrCode).length === 4 ? String(idOrCode).toUpperCase() : null);
    const reqId = notif?.requestId || (String(idOrCode).length > 8 ? String(idOrCode) : null);

    const minutes = Math.max(1, Math.min(Number(grantMinutes) || 15, 240));

    // Aprobar solicitud en ConfirmationStore si existe
    if (this.confirmations && (reqId || code)) {
      try {
        this.confirmations.approve(reqId || code, {
          confirmationCode: code,
          grantMinutes: minutes,
        });
      } catch (e) {
        this.logger?.warn("confirmation_approve_passthrough_error", { error: e.message });
      }
    }

    // Si requiere elevación, activar sesión de workflow
    const targetLevel = notif?.level || "advanced";
    if (this.permissions?.startWorkflow) {
      try {
        this.permissions.startWorkflow({
          level: targetLevel,
          durationMinutes: minutes,
          reason: `Autorizado mediante notificación en Fluxer (código ${code || "directo"})`,
          principal: "default",
        });
      } catch (e) {
        this.logger?.warn("permission_workflow_start_error", { error: e.message });
      }
    }

    if (notif) {
      notif.status = "approved";
      notif.resolvedAt = Date.now();
      notif.read = true;
      this.emit("resolved", { action: "approve", notification: notif });
      this.save().catch(() => {});
    }

    return {
      ok: true,
      status: "approved",
      id: notif?.id || null,
      confirmationCode: code,
      grantedLevel: targetLevel,
      durationMinutes: minutes,
      message: `Acceso concedido a la IA exitosamente por ${minutes} minutos.`,
    };
  }

  /**
   * Deniega el acceso a la IA (hacer clic en 'No' / Denegar).
   */
  deny(idOrCode, { reason = "Denegado por el usuario en Fluxer" } = {}) {
    const notif = this.find(idOrCode);
    const code = notif?.confirmationCode || (String(idOrCode).length === 4 ? String(idOrCode).toUpperCase() : null);
    const reqId = notif?.requestId || (String(idOrCode).length > 8 ? String(idOrCode) : null);

    if (this.confirmations && (reqId || code)) {
      try {
        this.confirmations.deny(reqId || code, reason);
      } catch (e) {
        this.logger?.warn("confirmation_deny_passthrough_error", { error: e.message });
      }
    }

    if (notif) {
      notif.status = "denied";
      notif.resolvedAt = Date.now();
      notif.denyReason = reason;
      notif.read = true;
      this.emit("resolved", { action: "deny", notification: notif });
      this.save().catch(() => {});
    }

    return {
      ok: true,
      status: "denied",
      id: notif?.id || null,
      confirmationCode: code,
      message: "Acceso denegado a la IA.",
    };
  }

  /**
   * Descarta y borra la notificación (hacer clic en 'X').
   * Si estaba pendiente, automáticamente deniega el acceso asociado.
   */
  dismiss(idOrCode) {
    const notif = this.find(idOrCode);
    if (notif && notif.status === "pending") {
      this.deny(notif.id, { reason: "Descartado y denegado por el usuario mediante botón X" });
    }

    if (notif) {
      notif.status = "dismissed";
      notif.dismissedAt = Date.now();
      notif.read = true;
      this.emit("dismissed", { notification: notif });
      this.save().catch(() => {});
    }

    return {
      ok: true,
      status: "dismissed",
      id: notif?.id || idOrCode,
      message: "Notificación descartada y acceso cancelado.",
    };
  }

  /**
   * Lista todas las notificaciones con orden prioritario (pendientes primero).
   */
  list({ status = "all", limit = 50 } = {}) {
    this.prune();
    let items = [...this.notifications.values()];

    if (status !== "all") {
      items = items.filter((n) => n.status === status);
    }

    items.sort((a, b) => {
      // Primero las pendientes
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      // Luego las más recientes
      return b.createdAt - a.createdAt;
    });

    return items.slice(0, Math.min(Number(limit) || 50, 100)).map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      level: n.level,
      badge: n.badge,
      riskLabel: n.riskLabel,
      tool: n.tool,
      action: n.action,
      confirmationCode: n.confirmationCode,
      requestId: n.requestId,
      status: n.status,
      createdAt: new Date(n.createdAt).toISOString(),
      expiresAt: n.expiresAt ? new Date(n.expiresAt).toISOString() : null,
      read: n.read,
    }));
  }

  pendingCount() {
    this.prune();
    let count = 0;
    for (const notif of this.notifications.values()) {
      if (notif.status === "pending") count++;
    }
    return count;
  }
}
