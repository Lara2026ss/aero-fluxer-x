/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🌐 AERON FLUXER X FEEDBACK GATEWAY — server.mjs
 * Servidor HTTP público para Render conectado a Firebase Realtime Database
 * ══════════════════════════════════════════════════════════════════════════════
 */

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RateLimiter } from "./rate-limit.mjs";
import { DeduplicationEngine } from "./dedup.mjs";
import { FirebaseStore } from "./firebase.mjs";
import { NotificationDigestEngine } from "./digest.mjs";

const PORT = Number(process.env.PORT) || 3000;
const MAX_PAYLOAD_BYTES = (Number(process.env.FEEDBACK_MAX_PAYLOAD_MB) || 3) * 1024 * 1024;

const rateLimiter = new RateLimiter();
const dedupEngine = new DeduplicationEngine();
const firebaseStore = new FirebaseStore();
const digestEngine = new NotificationDigestEngine({ firebaseStore });

const SENSITIVE_PATTERNS = [
  /gsk_[a-zA-Z0-9]{20,}/i,
  /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/i,
  /ghp_[a-zA-Z0-9]{36,}/i,
  /gho_[a-zA-Z0-9]{36,}/i,
  /-----BEGIN (RSA|EC|OPENSSH|PGP|PRIVATE) KEY-----/i,
  /AIza[0-9A-Za-z-_]{35}/i,
  /xox[baprs]-[0-9a-zA-Z]{10,}/i,
];

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, User-Agent, Authorization",
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, User-Agent, Authorization",
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  // 1. Health check (usado por Render healthCheckPath)
  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/")) {
    return sendJson(res, 200, {
      status: "ok",
      service: "aero-fluxer-feedback-gateway",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    });
  }

  // 2. Endpoint público de recepción de feedback
  if (req.method === "POST" && url.pathname === "/api/v1/feedback") {
    // 2.1 Control de tasa (Rate Limiting)
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
    const limitCheck = rateLimiter.check(clientIp);

    if (!limitCheck.allowed) {
      return sendJson(res, 429, {
        status: "rate_limited",
        code: "RATE_LIMITED",
        message: "Demasiados envíos de feedback. Por favor intente más tarde.",
      });
    }

    // 2.2 Leer cuerpo de la petición con límite estricto de tamaño
    let rawBody = "";
    let bodyLength = 0;

    try {
      await new Promise((resolve, reject) => {
        req.on("data", (chunk) => {
          bodyLength += chunk.length;
          if (bodyLength > MAX_PAYLOAD_BYTES) {
            req.destroy();
            return reject(new Error("PAYLOAD_TOO_LARGE"));
          }
          rawBody += chunk;
        });
        req.on("end", resolve);
        req.on("error", reject);
      });
    } catch (e) {
      if (e.message === "PAYLOAD_TOO_LARGE") {
        return sendJson(res, 413, {
          status: "invalid_input",
          code: "PAYLOAD_TOO_LARGE",
          message: "El payload del feedback excede el límite permitido (3MB).",
        });
      }
      return sendJson(res, 400, { status: "invalid_input", code: "BAD_REQUEST" });
    }

    // 2.3 Parsear y validar JSON
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return sendJson(res, 400, { status: "invalid_input", code: "INVALID_JSON" });
    }

    const { id, type, title, description } = payload;
    if (!id || !title || !description) {
      return sendJson(res, 400, {
        status: "invalid_input",
        code: "INVALID_INPUT",
        message: "Campos 'id', 'title' y 'description' son obligatorios.",
      });
    }

    // 2.4 Verificación de seguridad (Cero Secretos)
    const checkText = `${title}\n${description}\n${payload.steps_to_reproduce || ""}\n${payload.logs || ""}`;
    if (SENSITIVE_PATTERNS.some((p) => p.test(checkText))) {
      return sendJson(res, 400, {
        status: "blocked",
        code: "BLOCKED_SENSITIVE_DATA",
        message: "El contenido contiene posibles tokens o credenciales y fue rechazado por el gateway.",
      });
    }

    // 2.5 Deduplicación inteligente
    const fingerprint = dedupEngine.computeFingerprint(payload);
    const dedupCheck = dedupEngine.check(fingerprint);

    if (dedupCheck.isDuplicate) {
      await firebaseStore.recordDuplicate(dedupCheck.canonicalId, dedupCheck.count);
      return sendJson(res, 200, {
        status: "duplicate",
        id: dedupCheck.canonicalId,
      });
    }

    // 2.6 Registrar nueva huella canónica y persistir en Firebase Realtime Database
    dedupEngine.register(fingerprint, id);

    const feedbackRecord = {
      id,
      fingerprint,
      type: payload.type || "general_feedback",
      title: String(payload.title).slice(0, 200),
      description: String(payload.description).slice(0, 4000),
      steps_to_reproduce: payload.steps_to_reproduce ? String(payload.steps_to_reproduce).slice(0, 2000) : null,
      expected_behavior: payload.expected_behavior ? String(payload.expected_behavior).slice(0, 1000) : null,
      actual_behavior: payload.actual_behavior ? String(payload.actual_behavior).slice(0, 1000) : null,
      severity: payload.severity || "medium",
      tool: payload.tool || null,
      version: payload.version || "unknown",
      system: payload.system || {},
      logs: payload.logs ? String(payload.logs).slice(0, 5000) : null,
      attachment_info: payload.attachment ? { name: payload.attachment.name, sizeBytes: payload.attachment.sizeBytes } : null,
      created_at: payload.created_at || new Date().toISOString(),
      status: "received",
      duplicate_count: 1,
    };

    await firebaseStore.saveFeedback(feedbackRecord, fingerprint);

    // 2.7 Notificar al motor de digest (evalúa digest por volumen o alertas críticas)
    await digestEngine.onNewFeedback(feedbackRecord);

    // 2.8 Responder respuesta compacta al cliente
    return sendJson(res, 200, {
      status: "received",
      id,
    });
  }

  // 3. Endpoint administrativo — lista de feedbacks con filtros
  if (req.method === "GET" && url.pathname === "/api/v1/feedbacks") {
    const authHeader = req.headers["authorization"] || "";
    const adminKey = process.env.ADMIN_SECRET_KEY;

    if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
      return sendJson(res, 401, { error: "UNAUTHORIZED" });
    }

    const type = url.searchParams.get("type") || undefined;
    const severity = url.searchParams.get("severity") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);

    const result = await firebaseStore.listFeedbacks({ type, severity, status, limit });
    return sendJson(res, 200, {
      ok: true,
      total: result.total,
      count: result.items.length,
      feedbacks: result.items,
    });
  }

  // 4. Endpoint administrativo — leer un feedback específico
  if (req.method === "GET" && url.pathname.startsWith("/api/v1/feedback/")) {
    const authHeader = req.headers["authorization"] || "";
    const adminKey = process.env.ADMIN_SECRET_KEY;

    if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
      return sendJson(res, 401, { error: "UNAUTHORIZED" });
    }

    const feedbackId = url.pathname.replace("/api/v1/feedback/", "").trim();
    if (!feedbackId) {
      return sendJson(res, 400, { error: "MISSING_ID" });
    }

    const result = await firebaseStore.getFeedback(feedbackId);
    if (!result.ok || !result.data) {
      return sendJson(res, 404, { error: "NOT_FOUND", id: feedbackId });
    }

    return sendJson(res, 200, { ok: true, feedback: result.data });
  }

  // 5. Endpoint administrativo — eliminar un feedback específico
  if (req.method === "DELETE" && url.pathname.startsWith("/api/v1/feedback/")) {
    const authHeader = req.headers["authorization"] || "";
    const adminKey = process.env.ADMIN_SECRET_KEY;

    if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
      return sendJson(res, 401, { error: "UNAUTHORIZED" });
    }

    const feedbackId = url.pathname.replace("/api/v1/feedback/", "").trim();
    if (!feedbackId) {
      return sendJson(res, 400, { error: "MISSING_ID" });
    }

    const result = await firebaseStore.deleteFeedback(feedbackId);
    if (!result.ok) {
      return sendJson(res, 404, { error: "NOT_FOUND_OR_ALREADY_DELETED", id: feedbackId });
    }

    return sendJson(res, 200, { ok: true, deleted: feedbackId, paths: result.deleted });
  }

  // 6. Ruta no encontrada
  return sendJson(res, 404, { error: "NOT_FOUND" });
});

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  server.listen(PORT, () => {
    console.log(`🚀 Aero Fluxer Feedback Gateway escuchando en el puerto ${PORT}`);
  });
}

export { server, rateLimiter, dedupEngine, firebaseStore, digestEngine };
