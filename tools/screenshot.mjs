/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 📸 FLUXER CORE MCP — tools/screenshot.mjs
 * Dominio de Captura Visual No Intrusiva con WGC, GDI BitBlt y PrintWindow
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Modos de Captura:
 *  1. desktop — Captura de pantalla completa sin robar foco ni reordenar ventanas (GDI BitBlt).
 *  2. app     — Captura de aplicación por nombre de proceso o título sin robar foco (WGC primario, PrintWindow fallback).
 *  3. window  — Captura de ventana específica por HWND o título exacto (WGC primario, PrintWindow fallback).
 * 
 * Capa de Seguridad y Consentimiento:
 *  - Auditoría forense obligatoria en storage/logs/audit.jsonl para cada captura.
 *  - Control de privacidad de rutas de usuario (~/...).
 *  - Integración nativa con PermissionEngine y visual_capture_grant.
 */

import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

export function createScreenshotDomain({ runtime, domain, fs }) {
  const enginePath = path.resolve(runtime.root || process.cwd(), "platform", "capture_engine.ps1");

  function runCaptureEngine(mode, query = "", isHwnd = false, outputPath) {
    if (!existsSync(enginePath)) {
      throw new Error(`Motor de captura no encontrado en: ${enginePath}`);
    }

    const args = [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-File", enginePath,
      "-Mode", mode,
      "-OutFile", outputPath,
    ];

    if (query) {
      args.push("-Query", String(query));
    }
    if (isHwnd) {
      args.push("-IsHwnd");
    }

    const res = spawnSync("powershell.exe", args, {
      encoding: "utf8",
      timeout: 20000,
      windowsHide: true,
    });

    if (res.error) {
      throw res.error;
    }

    const stdout = (res.stdout || "").trim();
    const stderr = (res.stderr || "").trim();

    if (res.status !== 0 && !stdout.startsWith("OK:")) {
      throw new Error(stderr || stdout || `El motor de captura finalizó con código ${res.status}`);
    }

    return stdout;
  }

  async function resolveTargetDirectory() {
    const home = os.homedir();
    const candidates = [
      path.join(home, "Pictures", "FluxerScreenshots"),
      path.join(home, "Imágenes", "FluxerScreenshots"),
      path.join(runtime.root || process.cwd(), "storage", "screenshots"),
    ];
    for (const dir of candidates) {
      try {
        const parent = path.dirname(dir);
        if (existsSync(parent) || existsSync(dir)) {
          await fs.mkdir(dir, { recursive: true });
          return dir;
        }
      } catch {}
    }
    const fallback = path.join(runtime.root || process.cwd(), "storage", "screenshots");
    await fs.mkdir(fallback, { recursive: true });
    return fallback;
  }

  function sanitizePath(fullPath, shouldReveal) {
    if (shouldReveal) return fullPath;
    const home = os.homedir();
    const username = os.userInfo?.()?.username || process.env.USERNAME || "";
    let clean = fullPath;
    if (home) clean = clean.split(home).join("~");
    if (username && username.length > 1) {
      clean = clean.replace(new RegExp(username, "gi"), "<user>");
    }
    return clean;
  }

  const actions = {
    // ── 1. Captura de Escritorio Completo (desktop) ──────────────────────────
    desktop: async ({ format = "png", revealPath = false, allow_user_path = false } = {}) => {
      const startTime = Date.now();
      const captureId = `cap_desk_${crypto.randomBytes(4).toString("hex")}`;
      const timeStr = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `desktop_${timeStr}.png`;
      const targetDir = await resolveTargetDirectory();
      const outputPath = path.join(targetDir, fileName);
      const shouldReveal = Boolean(revealPath || allow_user_path);

      try {
        const outStr = runCaptureEngine("desktop", "", false, outputPath);

        if (!outStr.startsWith("OK:") || !existsSync(outputPath)) {
          throw new Error(outStr || "Error al ejecutar captura GDI de escritorio");
        }

        const parts = outStr.split(":");
        const dims = (parts[1] || "1920x1080").split("x");
        const width = parseInt(dims[0], 10) || 1920;
        const height = parseInt(dims[1], 10) || 1080;
        const stat = await fs.stat(outputPath);

        const durationMs = Date.now() - startTime;
        runtime.auditLog?.record({
          agent: runtime.client?.name || "mcp_client",
          tool: "screenshot",
          action: "desktop",
          args: { format, revealPath: shouldReveal },
          permission: "standard",
          result: "ok",
          durationMs,
        });

        return {
          ok: true,
          capture_id: captureId,
          mode: "desktop",
          engine: "GDI_BitBlt_DesktopDC",
          non_intrusive: true,
          focus_stealing: false,
          file_name: fileName,
          file_path: sanitizePath(outputPath, shouldReveal),
          raw_path: shouldReveal ? outputPath : undefined,
          size_bytes: stat.size,
          dimensions: { width, height },
          created_at: new Date().toISOString(),
          message: "Captura de escritorio completo realizada exitosamente sin alterar foco ni ventanas.",
        };
      } catch (err) {
        runtime.auditLog?.record({
          agent: runtime.client?.name || "mcp_client",
          tool: "screenshot",
          action: "desktop",
          args: { format },
          permission: "standard",
          result: "error",
          error: err.message,
        });
        return { ok: false, error: "DESKTOP_CAPTURE_FAILED", message: err.message };
      }
    },

    // ── 2. Captura de Aplicación (app) ───────────────────────────────────────
    app: async ({ process_name = null, app_name = null, title = null, format = "png", revealPath = false, allow_user_path = false } = {}) => {
      const query = (process_name || app_name || title || "").trim();
      if (!query) {
        return { ok: false, error: "MISSING_ARGUMENT", message: "Especifica 'process_name', 'app_name' o 'title' de la aplicación a capturar." };
      }

      const startTime = Date.now();
      const captureId = `cap_app_${crypto.randomBytes(4).toString("hex")}`;
      const timeStr = new Date().toISOString().replace(/[:.]/g, "-");
      const safePrefix = query.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 20);
      const fileName = `app_${safePrefix}_${timeStr}.png`;
      const targetDir = await resolveTargetDirectory();
      const outputPath = path.join(targetDir, fileName);
      const shouldReveal = Boolean(revealPath || allow_user_path);

      try {
        const outStr = runCaptureEngine("app", query, false, outputPath);

        if (!outStr.startsWith("OK:") || !existsSync(outputPath)) {
          throw new Error(outStr || `No se pudo capturar la aplicación '${query}'`);
        }

        const parts = outStr.split(":");
        const dims = (parts[1] || "1920x1080").split("x");
        const width = parseInt(dims[0], 10) || 1920;
        const height = parseInt(dims[1], 10) || 1080;
        const engine = parts[2] || "WGC_PrintWindow";
        const hwnd = parts[3] || "unknown";
        const matchedTitle = parts.slice(4).join(":") || query;
        const stat = await fs.stat(outputPath);

        const durationMs = Date.now() - startTime;
        runtime.auditLog?.record({
          agent: runtime.client?.name || "mcp_client",
          tool: "screenshot",
          action: "app",
          args: { query, engine, hwnd },
          permission: "standard",
          result: "ok",
          durationMs,
        });

        return {
          ok: true,
          capture_id: captureId,
          mode: "app",
          target_query: query,
          matched_title: matchedTitle,
          window_hwnd: hwnd,
          engine,
          non_intrusive: true,
          focus_stealing: false,
          file_name: fileName,
          file_path: sanitizePath(outputPath, shouldReveal),
          raw_path: shouldReveal ? outputPath : undefined,
          size_bytes: stat.size,
          dimensions: { width, height },
          created_at: new Date().toISOString(),
          message: `Captura de aplicación '${query}' completada con éxito vía ${engine}.`,
        };
      } catch (err) {
        runtime.auditLog?.record({
          agent: runtime.client?.name || "mcp_client",
          tool: "screenshot",
          action: "app",
          args: { query },
          permission: "standard",
          result: "error",
          error: err.message,
        });
        return { ok: false, error: "APP_CAPTURE_FAILED", message: err.message };
      }
    },

    // ── 3. Captura de Ventana Específica (window) ─────────────────────────────
    window: async ({ hwnd = null, handle = null, title = null, format = "png", revealPath = false, allow_user_path = false } = {}) => {
      const rawHwnd = hwnd || handle;
      const isExplicitHwnd = Boolean(rawHwnd);
      const query = (rawHwnd ? String(rawHwnd) : (title || "")).trim();

      if (!query) {
        return { ok: false, error: "MISSING_ARGUMENT", message: "Especifica 'hwnd' o 'title' de la ventana a capturar." };
      }

      const startTime = Date.now();
      const captureId = `cap_wnd_${crypto.randomBytes(4).toString("hex")}`;
      const timeStr = new Date().toISOString().replace(/[:.]/g, "-");
      const safePrefix = (rawHwnd ? `hwnd_${rawHwnd}` : query).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 20);
      const fileName = `window_${safePrefix}_${timeStr}.png`;
      const targetDir = await resolveTargetDirectory();
      const outputPath = path.join(targetDir, fileName);
      const shouldReveal = Boolean(revealPath || allow_user_path);

      try {
        const outStr = runCaptureEngine("window", query, isExplicitHwnd, outputPath);

        if (!outStr.startsWith("OK:") || !existsSync(outputPath)) {
          throw new Error(outStr || `No se pudo capturar la ventana '${query}'`);
        }

        const parts = outStr.split(":");
        const dims = (parts[1] || "1920x1080").split("x");
        const width = parseInt(dims[0], 10) || 1920;
        const height = parseInt(dims[1], 10) || 1080;
        const engine = parts[2] || "WGC_PrintWindow";
        const targetHwnd = parts[3] || query;
        const matchedTitle = parts.slice(4).join(":") || query;
        const stat = await fs.stat(outputPath);

        const durationMs = Date.now() - startTime;
        runtime.auditLog?.record({
          agent: runtime.client?.name || "mcp_client",
          tool: "screenshot",
          action: "window",
          args: { query, isExplicitHwnd, engine, hwnd: targetHwnd },
          permission: "standard",
          result: "ok",
          durationMs,
        });

        return {
          ok: true,
          capture_id: captureId,
          mode: "window",
          target_hwnd: targetHwnd,
          matched_title: matchedTitle,
          engine,
          non_intrusive: true,
          focus_stealing: false,
          file_name: fileName,
          file_path: sanitizePath(outputPath, shouldReveal),
          raw_path: shouldReveal ? outputPath : undefined,
          size_bytes: stat.size,
          dimensions: { width, height },
          created_at: new Date().toISOString(),
          message: `Captura de ventana '${matchedTitle}' (${targetHwnd}) realizada con éxito vía ${engine}.`,
        };
      } catch (err) {
        runtime.auditLog?.record({
          agent: runtime.client?.name || "mcp_client",
          tool: "screenshot",
          action: "window",
          args: { query, isExplicitHwnd },
          permission: "standard",
          result: "error",
          error: err.message,
        });
        return { ok: false, error: "WINDOW_CAPTURE_FAILED", message: err.message };
      }
    },
    // ── 4. Inspección de Imagen (inspect) ──────────────────────────────────
    inspect: async ({ path: targetPath, file, filePath } = {}) => {
      const rawPath = targetPath || file || filePath;
      if (!rawPath) return { ok: false, error: "MISSING_ARGUMENT", message: "Se requiere 'path'." };
      const resolved = path.resolve(String(rawPath));
      if (!existsSync(resolved)) {
        return { ok: false, error: "FILE_NOT_FOUND", message: `El archivo '${resolved}' no existe.` };
      }
      try {
        const stat = await fs.stat(resolved);
        const ext = path.extname(resolved).toLowerCase().replace(".", "");
        const fd = await fs.open(resolved, "r");
        const header = Buffer.alloc(64);
        await fd.read(header, 0, 64, 0);
        await fd.close();

        let width = null;
        let height = null;
        let format = ext;

        if (header.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
          format = "png";
          width = header.readUInt32BE(16);
          height = header.readUInt32BE(20);
        } else if (header.subarray(0, 2).toString("hex") === "ffd8") {
          format = "jpeg";
        } else if (header.subarray(0, 2).toString("ascii") === "BM") {
          format = "bmp";
          width = header.readInt32LE(18);
          height = Math.abs(header.readInt32LE(22));
        } else if (header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP") {
          format = "webp";
        }

        return {
          ok: true,
          path: resolved,
          file_name: path.basename(resolved),
          format,
          size_bytes: stat.size,
          dimensions: width && height ? { width, height } : null,
          modified_at: stat.mtime.toISOString(),
        };
      } catch (err) {
        return { ok: false, error: "INSPECT_FAILED", message: err.message };
      }
    },
  };

  // Alias para compatibilidad total con LLMs
  actions.capture_screen = actions.desktop;
  actions.screen = actions.desktop;
  actions.capture_window = actions.window;
  actions.capture_app = actions.app;
  actions.region = actions.desktop;

  const permissions = {
    desktop: "visual_capture_grant",
    app: "visual_capture_grant",
    window: "visual_capture_grant",
    capture_screen: "visual_capture_grant",
    capture_window: "visual_capture_grant",
    capture_app: "visual_capture_grant",
    screen: "visual_capture_grant",
    region: "visual_capture_grant",
    inspect: "standard",
  };

  return domain(
    "screenshot",
    "Captura visual no intrusiva de pantalla, aplicaciones y ventanas en tiempo real mediante WGC, GDI BitBlt y PrintWindow.",
    actions,
    permissions
  );
}
