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
import { sendNativeNotification, promptSecurityDialog } from "./notify.mjs";

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
    this.connectionEnabled = true;
    this.securityEnabled = true;
  }

  isEnabled() {
    return this.enabled;
  }

  setEnabled(val) {
    this.enabled = Boolean(val);
    this.emit("config_changed", { enabled: this.enabled });
    this.save().catch(() => {});
    return this.enabled;
  }

  isConnectionEnabled() {
    return this.enabled && this.connectionEnabled !== false;
  }

  setConnectionEnabled(val) {
    this.connectionEnabled = Boolean(val);
    this.emit("config_changed", { connectionEnabled: this.connectionEnabled });
    this.save().catch(() => {});
    return this.connectionEnabled;
  }

  isSecurityEnabled() {
    return this.enabled && this.securityEnabled !== false;
  }

  setSecurityEnabled(val) {
    this.securityEnabled = Boolean(val);
    this.emit("config_changed", { securityEnabled: this.securityEnabled });
    this.save().catch(() => {});
    return this.securityEnabled;
  }

  async load() {
    if (!this.storageFile) return;
    try {
      const content = await fs.readFile(this.storageFile, "utf8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.enabled === "boolean") {
          this.enabled = parsed.enabled;
        }
        if (typeof parsed.connectionEnabled === "boolean") {
          this.connectionEnabled = parsed.connectionEnabled;
        }
        if (typeof parsed.securityEnabled === "boolean") {
          this.securityEnabled = parsed.securityEnabled;
        }
        const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.notifications) ? parsed.notifications : []);
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
      const payload = {
        enabled: this.enabled,
        connectionEnabled: this.connectionEnabled,
        securityEnabled: this.securityEnabled,
        notifications: [...this.notifications.values()].slice(-this.maxItems),
        savedAt: new Date().toISOString(),
      };
      await fs.writeFile(this.storageFile, JSON.stringify(payload, null, 2), "utf8");
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
    clientName = null,
    status = "pending",
  } = {}) {
    this.prune();
    const id = `ntf_${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`;
    const classification = this.classifyLevel(level);
    const clientLabel = clientName && String(clientName).toLowerCase() !== "desconocida" ? clientName : "Cliente MCP";

    const entry = {
      id,
      title: title || `Notificación de Fluxer`,
      message: message || "",
      type, // "permission_request" | "alert" | "info" | "client_lifecycle"
      level,
      category: classification.category,
      badge: classification.badge,
      riskLabel: classification.riskLabel,
      tool,
      action,
      confirmationCode,
      requestId,
      clientName: clientLabel,
      args: args ? { ...args } : null,
      status, // "pending" | "approved" | "denied" | "dismissed" | "resolved"
      createdAt: Date.now(),
      expiresAt: status === "pending" ? Date.now() + ttlMs : null,
      read: status !== "pending",
    };

    this.notifications.set(id, entry);
    this.emit("created", entry);
    this.save().catch(() => {});
    return entry;
  }

  /**
   * Crea o actualiza una notificación específica de solicitud de permisos para la IA.
   * Evita duplicaciones si la misma IA u otra IA reintenta la misma acción con código activo.
   */
  notifyPermissionRequest({ tool, action, args, required, current, requestId, confirmationCode, ttlMs = 5 * 60 * 1000, clientName = null }) {
    this.prune();
    const classification = this.classifyLevel(required);
    const clientLabel = (clientName && String(clientName).toLowerCase() !== "desconocida") ? clientName : "Cliente MCP";

    // 1. Evitar acumulación de tarjetas duplicadas: si ya hay una pendiente con el mismo código, request o acción
    const existing = this.find(confirmationCode || requestId) ||
      [...this.notifications.values()].find(n => n.status === "pending" && n.tool === tool && n.action === action);

    if (existing && existing.status === "pending") {
      existing.expiresAt = Date.now() + ttlMs;
      existing.level = required;
      existing.category = classification.category;
      existing.badge = classification.badge;
      existing.riskLabel = classification.riskLabel;
      existing.clientName = clientLabel;
      if (confirmationCode) existing.confirmationCode = confirmationCode;
      if (requestId) existing.requestId = requestId;
      if (args) existing.args = { ...args };
      existing.updatedAt = Date.now();
      existing.title = (classification.category === "admin_elevation" || classification.category === "critical")
        ? `⚠️ Elevación de Administrador Solicitada [${existing.confirmationCode || confirmationCode}]`
        : `🔔 Autorización Requerida: ${tool}.${action} [${existing.confirmationCode || confirmationCode}]`;
      existing.message = `La IA (${clientLabel}) solicita ejecutar '${tool}.${action}' que requiere permisos de nivel '${classification.badge}'. Haz clic en 'Autorizar' para conceder acceso o en 'X' para denegar.`;
      this.emit("updated", existing);
      this.save().catch(() => {});
      return existing;
    }

    let title = "";
    if (classification.category === "admin_elevation" || classification.category === "critical") {
      title = `⚠️ Elevación de Administrador Solicitada [${confirmationCode}]`;
    } else {
      title = `🔔 Autorización Requerida: ${tool}.${action} [${confirmationCode}]`;
    }

    const message = `La IA (${clientLabel}) solicita ejecutar '${tool}.${action}' que requiere permisos de nivel '${classification.badge}'. Haz clic en 'Autorizar' para conceder acceso o en 'X' para denegar.`;

    const entry = this.create({
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
      clientName: clientLabel,
      status: "pending",
    });

    // Despachar diálogo interactivo con botones "Sí, Autorizar" y "Declinar" + Toast si securityEnabled está activo
    if (this.isSecurityEnabled()) {
      try {
        promptSecurityDialog({
          title: "Fluxer X — Autorización de Seguridad",
          tool,
          action,
          required: classification.badge,
          confirmationCode,
          requestId,
          clientName: clientLabel,
        }, (decision) => {
          if (decision === "approved") {
            this.approve(requestId || confirmationCode);
          } else {
            this.deny(requestId || confirmationCode, { reason: "Declinado por el usuario en ventana de seguridad" });
          }
        });

        sendNativeNotification(
          title,
          `La IA (${clientLabel}) solicita ejecutar '${tool}.${action}'. Código: [${confirmationCode}]. Responde en la ventana emergente.`
        );
      } catch (err) {
        this.logger?.warn("security_prompt_dialog_error", { error: err.message });
      }
    }

    return entry;
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

    // Sincronizar todas las notificaciones pendientes asociadas
    for (const other of this.notifications.values()) {
      if (other.status === "pending" && ((code && other.confirmationCode === code) || (reqId && other.requestId === reqId) || (notif && other.id === notif.id))) {
        other.status = "approved";
        other.resolvedAt = Date.now();
        other.read = true;
      }
    }

    if (notif) {
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

    // Sincronizar todas las notificaciones pendientes asociadas
    for (const other of this.notifications.values()) {
      if (other.status === "pending" && ((code && other.confirmationCode === code) || (reqId && other.requestId === reqId) || (notif && other.id === notif.id))) {
        other.status = "denied";
        other.resolvedAt = Date.now();
        other.denyReason = reason;
        other.read = true;
      }
    }

    if (notif) {
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
      clientName: n.clientName || "Cliente MCP",
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

  clearResolved() {
    this.prune();
    let cleared = 0;
    for (const [id, notif] of this.notifications) {
      if (notif.status !== "pending") {
        this.notifications.delete(id);
        cleared++;
      }
    }
    if (cleared > 0) this.save().catch(() => {});
    return { ok: true, cleared, remaining: this.notifications.size };
  }
}
