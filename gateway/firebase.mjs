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
}
