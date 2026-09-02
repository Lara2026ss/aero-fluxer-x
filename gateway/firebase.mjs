/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔥 AERON FLUXER X FEEDBACK GATEWAY — firebase.mjs
 * Conector de persistencia para Firebase Realtime Database
 * ══════════════════════════════════════════════════════════════════════════════
 */

import https from "node:https";

export class FirebaseStore {
  constructor() {
    this.databaseUrl = process.env.FIREBASE_DATABASE_URL ? process.env.FIREBASE_DATABASE_URL.replace(/\/$/, "") : null;
    this.authToken = process.env.FIREBASE_AUTH_TOKEN || null;
    this.localFallback = new Map();
  }

  /**
   * Ejecuta una petición HTTP a Firebase Realtime Database REST API.
   * @param {string} path Ruta dentro del árbol de la base de datos
   * @param {string} method GET, PUT, POST, PATCH
   * @param {object} [data] Datos JSON
   * @returns {Promise<object>}
   */
  async request(path, method = "GET", data = null) {
    if (!this.databaseUrl) {
      return { ok: false, simulated: true };
    }

    const authQuery = this.authToken ? `?auth=${encodeURIComponent(this.authToken)}` : "";
    const fullUrl = `${this.databaseUrl}/${path.replace(/^\//, "")}.json${authQuery}`;
    const urlObj = new URL(fullUrl);
    const bodyStr = data ? JSON.stringify(data) : null;

    return new Promise((resolve, reject) => {
      const req = https.request(
        urlObj,
        {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
          },
          timeout: 7000,
        },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve({ ok: true, data: JSON.parse(body) });
              } catch {
                resolve({ ok: true, data: body });
              }
            } else {
              resolve({ ok: false, status: res.statusCode, error: body });
            }
          });
        }
      );

      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, error: "FIREBASE_TIMEOUT" });
      });

      req.on("error", (err) => resolve({ ok: false, error: err.message }));

      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  /**
   * Guarda un feedback canónico en Firebase Realtime Database.
   * @param {object} feedback
   * @param {string} fingerprint
   */
  async saveFeedback(feedback, fingerprint) {
    this.localFallback.set(feedback.id, feedback);

    // 1. Guardar el ítem en fluxer_feedbacks/items/<id>
    await this.request(`fluxer_feedbacks/items/${feedback.id}`, "PUT", feedback);

    // 2. Indexar huella digital en fluxer_feedbacks/fingerprints/<fingerprint>
    await this.request(`fluxer_feedbacks/fingerprints/${fingerprint}`, "PUT", {
      id: feedback.id,
      timestamp: feedback.created_at,
    });

    // 3. Actualizar contadores en fluxer_feedbacks/stats
    await this.request(`fluxer_feedbacks/stats`, "PATCH", {
      last_updated: new Date().toISOString(),
      last_id: feedback.id,
    });

    // 4. Agregar a la cola de notificaciones pendientes para el digest
    await this.request(`fluxer_feedbacks/notifications/pending/${feedback.id}`, "PUT", {
      id: feedback.id,
      type: feedback.type,
      title: feedback.title,
      severity: feedback.severity,
      tool: feedback.tool,
      created_at: feedback.created_at,
    });

    return { ok: true, id: feedback.id };
  }

  /**
   * Incrementa el contador de duplicados de un feedback canónico.
   * @param {string} canonicalId
   * @param {number} count
   */
  async recordDuplicate(canonicalId, count) {
    const item = this.localFallback.get(canonicalId);
    if (item) item.duplicate_count = count;

    await this.request(`fluxer_feedbacks/items/${canonicalId}`, "PATCH", {
      duplicate_count: count,
      last_duplicate_at: new Date().toISOString(),
    });
  }

  /**
   * Obtiene todos los feedbacks pendientes de notificación para el digest.
   */
  async getPendingNotifications() {
    const res = await this.request("fluxer_feedbacks/notifications/pending", "GET");
    if (res.ok && res.data && typeof res.data === "object") {
      return Object.values(res.data);
    }
    return [];
  }

  /**
   * Limpia la cola de notificaciones tras el envío del digest.
   */
  async clearPendingNotifications() {
    await this.request("fluxer_feedbacks/notifications/pending", "DELETE");
  }

  /**
   * Lee un feedback completo por ID.
   * @param {string} id
   * @returns {Promise<{ ok: boolean, data: object|null }>}
   */
  async getFeedback(id) {
    const res = await this.request(`fluxer_feedbacks/items/${id}`, "GET");
    if (res.ok && res.data) {
      return { ok: true, data: res.data };
    }
    return { ok: false, data: null };
  }

  /**
   * Lista todos los feedbacks con filtros opcionales.
   * @param {object} [filters]
   * @param {string} [filters.type]
   * @param {string} [filters.severity]
   * @param {string} [filters.status]
   * @param {number} [filters.limit=50]
   * @returns {Promise<{ ok: boolean, items: object[], total: number }>}
   */
  async listFeedbacks({ type, severity, status, limit = 50 } = {}) {
    const res = await this.request("fluxer_feedbacks/items", "GET");
    if (!res.ok || !res.data || typeof res.data !== "object") {
      return { ok: true, items: [], total: 0 };
    }

    let items = Object.values(res.data);

    if (type) items = items.filter((fb) => fb.type === type);
    if (severity) items = items.filter((fb) => fb.severity === severity);
    if (status) items = items.filter((fb) => fb.status === status);

    // Ordenar por fecha desc
    items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    const total = items.length;
    items = items.slice(0, Math.min(limit, 100));

    return { ok: true, items, total };
  }

  /**
   * Elimina un feedback y sus registros relacionados (fingerprint + notificación pendiente).
   * @param {string} id
   * @param {string} [fingerprint] Si se provee, elimina también el fingerprint
   * @returns {Promise<{ ok: boolean, deleted: string[] }>}
   */
  async deleteFeedback(id, fingerprint) {
    const deleted = [];

    // 1. Obtener el item para extraer fingerprint si no se pasó
    if (!fingerprint) {
      const res = await this.request(`fluxer_feedbacks/items/${id}`, "GET");
      if (res.ok && res.data?.fingerprint) {
        fingerprint = res.data.fingerprint;
      }
    }

    // 2. Eliminar el item principal
    const itemRes = await this.request(`fluxer_feedbacks/items/${id}`, "DELETE");
    if (itemRes.ok) deleted.push(`items/${id}`);

    // 3. Eliminar fingerprint si se conoce
    if (fingerprint) {
      const fpRes = await this.request(`fluxer_feedbacks/fingerprints/${fingerprint}`, "DELETE");
      if (fpRes.ok) deleted.push(`fingerprints/${fingerprint}`);
    }

    // 4. Eliminar notificación pendiente si existe
    const notifRes = await this.request(`fluxer_feedbacks/notifications/pending/${id}`, "DELETE");
    if (notifRes.ok) deleted.push(`notifications/pending/${id}`);

    return { ok: deleted.length > 0, deleted };
  }
}
