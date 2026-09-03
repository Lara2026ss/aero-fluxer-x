/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔄 AERON FLUXER X — core/client-restart.mjs
 * Detección dinámica del cliente host y generación de instrucciones de reinicio
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { detectClient } from "./client-detect.mjs";

/**
 * Resuelve el identificador simplificado del cliente host
 * inspeccionando runtime.client, variables de entorno y handshake.
 */
export function resolveClientHost(runtime = null, clientInfo = null) {
  const env = process.env;
  const client = runtime?.client || null;
  const clientId = (client?.id || "").toLowerCase();
  const clientName = (client?.name || "").toLowerCase();
  const handshakeName = (clientInfo?.name || "").toLowerCase();

  // 1. Si runtime.client tiene una detección concreta (diferente de 'desconocida'), usarla prioritariamente:
  if (clientId && clientId !== "desconocida") {
    if (clientId.includes("claude_desktop") || clientId === "claude") return "claude_desktop";
    if (clientId.includes("claude_code")) return "claude_code";
    if (clientId.includes("antigravity") || clientId.includes("agy")) return "antigravity";
    if (clientId.includes("codex")) return "codex";
    if (clientId.includes("cursor")) return "cursor";
    if (clientId.includes("windsurf")) return "windsurf";
    if (clientId.includes("cline") || clientId.includes("roo") || clientId.includes("continue") || clientId.includes("vscode")) return "vscode";
  }

  // 2. Comprobar handshake del cliente MCP si está disponible
  if (handshakeName) {
    if (handshakeName.includes("claude desktop") || handshakeName.includes("claude")) return "claude_desktop";
    if (handshakeName.includes("antigravity") || handshakeName.includes("agy")) return "antigravity";
    if (handshakeName.includes("codex")) return "codex";
    if (handshakeName.includes("cursor")) return "cursor";
    if (handshakeName.includes("windsurf")) return "windsurf";
    if (handshakeName.includes("vscode")) return "vscode";
  }

  // 3. Comprobar variables de entorno del cliente host
  if (env.CLAUDE_DESKTOP) return "claude_desktop";
  if (env.CLAUDE_CODE) return "claude_code";
  if (
    env.ANTIGRAVITY_AGENT ||
    env.ANTIGRAVITY_CONVERSATION_ID ||
    env.ANTIGRAVITY_PROJECT_ID ||
    env.ANTIGRAVITY_CLI ||
    env.AGY_CLI ||
    env.GOOGLE_ANTIGRAVITY
  ) {
    return "antigravity";
  }
  if (env.OPENAI_CODEX || env.CODEX_CLI || env.CODEX_ENV) return "codex";
  if (env.CURSOR_APP_VERSION || env.CURSOR_CHANNEL || env.CURSOR_VERSION) return "cursor";
  if (env.WINDSURF_VERSION) return "windsurf";

  // 4. Intentar detección profunda de procesos si no se detectó por env
  const fallbackClient = detectClient(env);
  if (fallbackClient && fallbackClient.id && fallbackClient.id !== "desconocida") {
    const fId = fallbackClient.id.toLowerCase();
    if (fId.includes("claude_desktop") || fId === "claude") return "claude_desktop";
    if (fId.includes("claude_code")) return "claude_code";
    if (fId.includes("antigravity") || fId.includes("agy")) return "antigravity";
    if (fId.includes("codex")) return "codex";
    if (fId.includes("cursor")) return "cursor";
    if (fId.includes("windsurf")) return "windsurf";
  }

  return "unknown";
}

/**
 * Genera la notificación y la instrucción exacta de reinicio
 * requerida por el cliente host detectado.
 */
export function getClientRestartNotice(runtime = null, clientInfo = null) {
  const host = resolveClientHost(runtime, clientInfo);

  switch (host) {
    case "antigravity":
      return {
        detected_client: "Google Antigravity",
        user_action_required: "Espera unos minutos y recarga la lista de MCP en antigravity.",
        message: "Espera unos minutos y recarga la lista de MCP en antigravity (pulsa el botón de recargar 🔄 en Installed MCP Servers o en la configuración de MCPs).",
        quick_action: "Recargar lista de MCP en Antigravity (botón 🔄)",
      };

    case "claude_desktop":
      return {
        detected_client: "Claude Desktop",
        user_action_required: "Reinicia Claude desktop para aplicar los cambios.",
        message: "Reinicia Claude desktop para aplicar los cambios (cierra y vuelve a abrir Claude Desktop).",
        quick_action: "Reiniciar Claude Desktop",
      };

    case "claude_code":
      return {
        detected_client: "Claude Code",
        user_action_required: "Reinicia tu sesión de Claude Code para aplicar los cambios.",
        message: "Reinicia tu sesión de Claude Code para reconectar el servidor MCP actualizado.",
        quick_action: "Reiniciar sesión de Claude Code",
      };

    case "codex":
      return {
        detected_client: "Codex",
        user_action_required: "Reinicia Codex para aplicar los cambios.",
        message: "Reinicia Codex para aplicar los cambios y reconectar el servidor MCP.",
        quick_action: "Reiniciar Codex",
      };

    case "cursor":
      return {
        detected_client: "Cursor",
        user_action_required: "Recarga la ventana de Cursor (Ctrl+Shift+P > Developer: Reload Window) o reinicia Cursor para aplicar los cambios.",
        message: "Recarga la ventana de Cursor (Ctrl+Shift+P > Developer: Reload Window) o pulsa reconectar en Configuración > Features > MCP.",
        quick_action: "Ctrl+Shift+P > Developer: Reload Window",
      };

    case "windsurf":
      return {
        detected_client: "Windsurf",
        user_action_required: "Recarga la ventana de Windsurf o reinicia la aplicación para aplicar los cambios.",
        message: "Recarga la ventana de Windsurf (Ctrl+Shift+P > Developer: Reload Window) para reconectar el servidor MCP.",
        quick_action: "Ctrl+Shift+P > Developer: Reload Window",
      };

    case "vscode":
      return {
        detected_client: "VS Code",
        user_action_required: "Recarga la ventana de VS Code o reconecta el servidor MCP.",
        message: "Recarga la ventana de VS Code (Ctrl+Shift+P > Developer: Reload Window) para aplicar los cambios.",
        quick_action: "Ctrl+Shift+P > Developer: Reload Window",
      };

    default:
      return {
        detected_client: null,
        user_action_required: "reinicia tu aplicación o entorno.",
        message: "Reinicia tu aplicación o entorno para aplicar los cambios y reconectar el servidor MCP.",
        quick_action: "Reiniciar aplicación o entorno host",
      };
  }
}
