/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 📬 AERON FLUXER X FEEDBACK GATEWAY — digest.mjs
 * Motor de agregación y resumen periódico de notificaciones (Email Digest)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Principio: Cero spam al mantenedor.
 * Agrupa múltiples reportes en un único digest por intervalo o por volumen,
 * permitiendo alertas inmediatas únicamente ante 'critical' (con cooldown anti-abuso).
 */

import https from "node:https";

export class NotificationDigestEngine {
  /**
   * @param {object} options
   * @param {import('./firebase.mjs').FirebaseStore} options.firebaseStore
   * @param {number} [options.intervalMs=3600000] Intervalo del digest (1 hora por defecto)
   * @param {number} [options.criticalCooldownMs=3600000] Cooldown para alertas críticas (1 hora)
   */
  constructor({ firebaseStore, intervalMs = 3600000, criticalCooldownMs = 3600000 } = {}) {
    this.firebase = firebaseStore;
    this.intervalMs = intervalMs;
    this.criticalCooldownMs = criticalCooldownMs;
    this.lastCriticalAlertTime = 0;
    this.notificationEmail = process.env.FEEDBACK_NOTIFICATION_EMAIL || null;

    // Ejecutar digest periódicamente
    this.timer = setInterval(() => this.sendDigest(), this.intervalMs).unref();
  }

  /**
   * Procesa un nuevo reporte entrante y evalúa si amerita alerta crítica inmediata.
   * @param {object} feedback
   */
  async onNewFeedback(feedback) {
    if (feedback.severity === "critical") {
      const now = Date.now();
      if (now - this.lastCriticalAlertTime > this.criticalCooldownMs) {
        this.lastCriticalAlertTime = now;
        await this.dispatchImmediateAlert(feedback);
      }
    }
  }

  /**
   * Compila y envía el digest de reportes acumulados.
   * @returns {Promise<{ sent: boolean, count: number }>}\n   */
  async sendDigest() {
    const pending = await this.firebase.getPendingNotifications();
    if (!pending || pending.length === 0) {
      return { sent: false, count: 0 };
    }

    const counts = {
      total: pending.length,
      bug_report: 0,
      feature_request: 0,
      general_feedback: 0,
      critical: 0,
    };

    const toolFrequencies = {};

    for (const item of pending) {
      counts[item.type] = (counts[item.type] || 0) + 1;
      if (item.severity === "critical") counts.critical++;
      if (item.tool) {
        toolFrequencies[item.tool] = (toolFrequencies[item.tool] || 0) + 1;
      }
    }

    let topIssue = "N/A";
    let maxToolCount = 0;
    for (const [tool, cnt] of Object.entries(toolFrequencies)) {
      if (cnt > maxToolCount) {
        maxToolCount = cnt;
        topIssue = `${tool} (${cnt} reportes)`;
      }
    }

    const digestSummary = [
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📦 AERON FLUXER X — FEEDBACK DIGEST`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `Nuevos reportes:  ${counts.total}`,
      `• Bug reports:     ${counts.bug_report}`,
      `• Feature requests: ${counts.feature_request}`,
      `• General:         ${counts.general_feedback}`,
      `• Críticos:        ${counts.critical}`,
      `• Módulo top:      ${topIssue}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `Reportes en este período:`,
      ...pending.map((p) => `  - [${p.type.toUpperCase()}] ${p.title} (ID: ${p.id})`),
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ].join("\n");

    console.log(digestSummary);

    // Enviar por correo si FEEDBACK_NOTIFICATION_EMAIL está configurado
    if (this.notificationEmail && process.env.RESEND_API_KEY) {
      await this.sendEmail({
        to: this.notificationEmail,
        subject: `[Aero Fluxer X] Resumen de Feedbacks: ${counts.total} nuevos (${counts.bug_report} bugs)`,
        text: digestSummary,
      });
    }

    await this.firebase.clearPendingNotifications();
    return { sent: true, count: counts.total };
  }

  /**
   * Despacha una alerta inmediata individual (solo para fallas críticas comprobadas).\n   * @param {object} feedback
   */
  async dispatchImmediateAlert(feedback) {
    const alertText = [
      `⚠️ ALERTA CRÍTICA EN AERO FLUXER X`,
      `ID:          ${feedback.id}`,
      `Título:      ${feedback.title}`,
      `Descripción: ${feedback.description}`,
      `Herramienta: ${feedback.tool || "General"}`,
      `Versión:     ${feedback.version}`,
      `Timestamp:   ${feedback.created_at}`,
    ].join("\n");

    console.warn(alertText);

    if (this.notificationEmail && process.env.RESEND_API_KEY) {
      await this.sendEmail({
        to: this.notificationEmail,
        subject: `🚨 [CRÍTICO] Aero Fluxer X: ${feedback.title}`,
        text: alertText,
      });
    }
  }

  /**
   * Envío seguro de email vía Resend / HTTPS REST API.
   */
  async sendEmail({ to, subject, text }) {
    return new Promise((resolve) => {
      const payload = JSON.stringify({
        from: "Aero Fluxer Gateway <feedbacks@resend.dev>",
        to: [to],
        subject,
        text,
      });

      const req = https.request(
        "https://api.resend.com/emails",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
          timeout: 8000,
        },
        (res) => {
          resolve(res.statusCode >= 200 && res.statusCode < 300);
        }
      );

      req.on("error", () => resolve(false));
      req.write(payload);
      req.end();
    });
  }
}
