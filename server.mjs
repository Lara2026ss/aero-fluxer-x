#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { exec, execSync } from "node:child_process";
import { assertWindows } from "./core/platform/windows.mjs";
import { CURRENT_VERSION, APP_NAME, BRAND_NAME } from "./core/version.mjs";
import { createRuntime } from "./core/runtime.mjs";
import { Registry } from "./core/registry.mjs";
import { Router } from "./core/router.mjs";
import { startDashboardApi } from "./core/dashboard-api.mjs";
import { PluginLoader } from "./core/plugin-loader.mjs";
import { sendNativeNotification } from "./core/notify.mjs";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import {
  parseResilientJson,
  unwrapArgs,
  sanitizeAndPrune,
  compactFormatter,
  smartTruncate,
} from "./core/json-utils.mjs";

assertWindows({ strict: false });

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VERSION = CURRENT_VERSION;
const SERVER_NAME = BRAND_NAME;

let inProcessLastConnect = 0;
let inProcessLastDisconnect = 0;
let inProcessConnectTime = 0;

function notifyClient(clientName, event = "connect", version = VERSION, options = {}, runtime = null) {
  if (runtime?.notifications && !runtime.notifications.isConnectionEnabled()) {
    return;
  }

  const now = Date.now();
  // Cooldown de 30 minutos (1,800,000 ms) para evitar cualquier molestia o repetición
  const DEBOUNCE_MS = 1800000;
  const isConnectEvent = event === "connect" || event === "login";
  const isDisconnectEvent = event === "disconnect" || event === "logout";

  // Suprimir alertas de desconexión si la conexión fue fugaz (menos de 2 minutos)
  if (isDisconnectEvent && inProcessConnectTime > 0 && (now - inProcessConnectTime < 120000)) {
    return;
  }

  // 1. In-process cooldown
  if (isConnectEvent && now - inProcessLastConnect < DEBOUNCE_MS) {
    return;
  }
  if (isDisconnectEvent && now - inProcessLastDisconnect < DEBOUNCE_MS) {
    return;
  }

  // 2. Cross-process lock file debounce (evita repetición entre múltiples procesos/reconexiones)
  let lockFile = null;
  try {
    const storageDir = runtime?.dirs?.storage || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "FluxerX", "storage") : null);
    if (storageDir) {
      mkdirSync(storageDir, { recursive: true });
      lockFile = path.join(storageDir, "connection_notification_lock.json");
      if (existsSync(lockFile)) {
        const raw = readFileSync(lockFile, "utf8");
        const lock = JSON.parse(raw);
        if (isConnectEvent && lock.lastConnectTs && (now - lock.lastConnectTs < DEBOUNCE_MS)) {
          return;
        }
        if (isDisconnectEvent && lock.lastDisconnectTs && (now - lock.lastDisconnectTs < DEBOUNCE_MS)) {
          return;
        }
      }
    }
  } catch {}

  if (isConnectEvent) {
    inProcessLastConnect = now;
    inProcessConnectTime = now;
  }
  if (isDisconnectEvent) inProcessLastDisconnect = now;

  try {
    if (lockFile) {
      let existing = {};
      try { existing = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, "utf8")) : {}; } catch {}
      if (isConnectEvent) {
        existing.lastConnectTs = now;
        existing.lastConnectClient = clientName;
      }
      if (isDisconnectEvent) {
        existing.lastDisconnectTs = now;
        existing.lastDisconnectClient = clientName;
      }
      writeFileSync(lockFile, JSON.stringify(existing, null, 2), "utf8");
    }
  } catch {}

  // Texto ultra-compacto, minimalista, minúsculas y sin sonido ni popups invasivos
  const rawClient = String(clientName || "").replace(/["']/g, "").trim().toLowerCase();
  const displayAI = (rawClient && rawClient !== "ia" && rawClient !== "cliente mcp" && rawClient !== "desconocido")
    ? ` · ${rawClient}`
    : "";
  const title = "fluxer xz";
  const msg = isConnectEvent
    ? `conectado${displayAI}`
    : `desconectado${displayAI}`;

  sendNativeNotification(title, msg, {
    ...options,
    silent: true,
    noModal: true,
    connectionEvent: true,
    subtle: true,
  });
}

function mcpText(value, options = {}) {
  let text;
  if (typeof value === "string") {
    text = value;
  } else {
    // Sanitización inteligente preservando siempre errores, timestamps y permisos
    const pruned = sanitizeAndPrune(value, options);
    const format = options.format || (options.compact ? "json" : null);

    if (format === "jsonl" || format === "table") {
      text = compactFormatter(pruned, format);
    } else if (options.compact) {
      text = JSON.stringify(pruned);
    } else {
      const pretty = JSON.stringify(pruned, null, 2);
      text = pretty.length > 2048 ? JSON.stringify(pruned) : pretty;
    }
  }

  const MAX_LENGTH = 64 * 1024; // 64KB limit
  if (text.length > MAX_LENGTH) {
    text = smartTruncate(text, MAX_LENGTH, options.prefer || "tail");
  }

  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

function toolSchema(name, description, actions) {
  return {
    name,
    description: `Dominio modular '${name}'. Ejecuta subherramientas especificando 'action'.\nPuedes enviar los argumentos de la subherramienta directamente como propiedades raíz (ej: { action: '...', path: '...' }) o agrupados en 'args': { ... }.\n${description}`,
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: actions,
          description: `Nombre de la subherramienta a ejecutar en el dominio '${name}'. Opciones: ${actions.slice(0, 15).join(', ')}...`,
        },
        path: {
          type: "string",
          description: "Ruta de archivo o carpeta (para files, developer, database).",
        },
        command: {
          type: "string",
          description: "Comando a ejecutar en terminal o powershell.",
        },
        query: {
          type: "string",
          description: "Texto o consulta SQL/paquete a buscar o ejecutar.",
        },
        name: {
          type: "string",
          description: "Nombre del paquete, shortcut, variable, servicio o proceso.",
        },
        content: {
          type: "string",
          description: "Contenido de texto o datos para escribir, editar o guardar.",
        },
        database: {
          type: "string",
          description: "Base de datos a consultar (ej: ':memory:' o ruta a archivo SQLite).",
        },
        version: {
          type: "string",
          description: "Versión específica a consultar o verificar.",
        },
        host: {
          type: "string",
          description: "Host o dirección IP para diagnóstico de red.",
        },
        port: {
          type: "number",
          description: "Puerto de red a comprobar o conectar.",
        },
        args: {
          type: "object",
          description: "Objeto opcional con argumentos específicos de la subherramienta.",
        },
      },
      required: ["action"],
      additionalProperties: true,
    },
  };
}

export async function startServer() {
  const runtime = await createRuntime({
    root: ROOT,
    version: VERSION,
    brand: SERVER_NAME,
  });
  const registry = new Registry(runtime);
  await registry.load();
  // Expose registry on runtime for health checks and cross-domain access
  runtime._registry = registry;

  const router = new Router({ runtime, registry });
  let dashboard = await startDashboardApi({ runtime, registry, router });

  // Sistema de plugins dinámicos (Fase 5)
  const PLUGINS_DIR = path.join(ROOT, "plugins");
  const pluginLoader = new PluginLoader({
    pluginsDir: PLUGINS_DIR,
    runtime,
    registry,
  });
  const { loaded: pluginsLoaded, failed: pluginsFailed } =
    await pluginLoader.loadAll();
  if (pluginsFailed.length) {
    for (const f of pluginsFailed)
      await runtime.logger.warn("plugin_load_failed", f);
  }

  const refreshState = () =>
    runtime.persistState({
      toolsLoaded: registry.moduleNames().length,
      modulesLoaded: registry.actionCount(),
      pluginsLoaded: pluginLoader.snapshot().length,
      connectedClients: 1,
      connectedClientNames: [runtime.client.name],
    });

  runtime.control.reload = async () => {
    await registry.load();
    dashboard?.close?.();
    dashboard = await startDashboardApi({ runtime, registry, router });
    await refreshState();
    return { ok: true, reloaded: true, tools: registry.moduleNames().length };
  };
  runtime.control.shutdown = async () => {
    await runtime.shutdown("fluxer.shutdown");
    process.exit(0);
  };
  runtime.control.check = async () => ({
    ok: true,
    health: registry.health(),
    state: await runtime.readState(),
  });

  // Exponer plugin loader en el control para hot-reload de plugins
  runtime.control.loadPlugin = (name) => pluginLoader.load(name);
  runtime.control.unloadPlugin = (name) => pluginLoader.unload(name);
  runtime.control.plugins = () => pluginLoader.snapshot();

  const tools = registry.capabilityRegistry
    ? registry.capabilityRegistry.toMcpTools({ compact: true })
    : registry.moduleNames().map((name) => toolSchema(name, "", registry.actionsFor(name)));

  const server = new Server(
    { name: SERVER_NAME, version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    if (runtime.waitForReady) {
      await runtime.waitForReady(60000);
    }
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      if (runtime.waitForReady) {
        await runtime.waitForReady(60000);
      }
      let rawArgs = req.params.arguments || {};
      if (typeof rawArgs === "string") {
        const parsed = parseResilientJson(rawArgs);
        if (parsed && typeof parsed === "object") rawArgs = parsed;
      }

      // Normalizar nombre de herramienta limpiando prefijos de clientes MCP
      let toolName = String(req.params.name || "").trim();
      toolName = toolName
        .replace(/^aeron[_\s-]?fluxer[_\s-]?x[:_\s-]*/i, "")
        .replace(/^(fluxer|mcp)[:_\s-]*/i, "")
        .trim();

      const normalized = registry.capabilityRegistry.normalizeCall({
        tool: toolName,
        ...rawArgs,
      });

      const response = await router.execute({
        capability: normalized.capability,
        operation: normalized.operation,
        target: normalized.target,
        options: normalized.options,
        tool: normalized.capability,
        action: normalized.operation,
        args: normalized.options,
      });

      const isCompact = normalized.options?.compact !== false &&
        rawArgs?.compact !== false &&
        rawArgs?.compact_mode !== false;

      return mcpText(response, {
        compact: isCompact,
        format: normalized.options?.format || rawArgs?.format,
        prefer: normalized.options?.prefer || rawArgs?.prefer || "tail",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error ?? "unknown_error");
      const actionName = req.params.arguments?.operation || req.params.arguments?.action;
      try {
        await runtime.logger.error("fluxer_call_failed", {
          tool: req.params.name,
          action: actionName,
          error: message,
          code: error?.code,
        });
      } catch {}
      return mcpText({
        ok: false,
        capability: req.params.name,
        operation: actionName || "unknown",
        operationId: error?.operationId || undefined,
        tool: req.params.name,
        action: actionName,
        error: message,
        code: error?.code || "INTERNAL_ERROR",
        summary: `Execution of '${req.params.name}.${actionName || "op"}' failed: ${message}`,
        suggestion: error?.suggestion || "Revise la sintaxis de la llamada y los parámetros enviados.",
        recoverable: error?.recoverable !== undefined ? error.recoverable : true,
      });
    }
  });

  await refreshState();
  
  const getClientName = () => {
    const name = runtime.client?.name;
    return (name && name !== "desconocida") ? name : "Agente IA";
  };
  
  await runtime.logger.info(`La Inteligencia Artificial "${getClientName()}" se conectó a Aeron Fluxer X v${VERSION}`, {
    version: VERSION,
    root: ROOT,
    tools: tools.length,
    plugins: pluginsLoaded.length,
    client: getClientName(),
  });

  let hasConnected = false;
  const notifyConnect = (eventType = "connect") => {
    if (hasConnected) return;
    hasConnected = true;
    notifyClient(getClientName(), eventType, VERSION, { sync: false }, runtime);
  };
  notifyConnect("connect");

  let hasDisconnected = false;
  const notifyDisconnect = (reason = "shutdown") => {
    if (hasDisconnected) return;
    hasDisconnected = true;
    const cName = getClientName();
    const eventType = (reason === "session_close" || reason === "logout") ? "logout" : "disconnect";
    try { notifyClient(cName, eventType, VERSION, { sync: true }, runtime); } catch {}
  };

  const shutdown = async (signal) => {
    notifyDisconnect(signal);
    dashboard?.close?.();
    const cName = getClientName();
    await runtime.logger.info(`La Inteligencia Artificial "${cName}" se desconectó de Aeron Fluxer X v${VERSION} (${signal})`);
    await runtime.shutdown(signal);
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGHUP", async () => {
    await runtime.control.reload();
  });

  process.stdin.on("end", () => {
    notifyDisconnect("stdin_end");
  });
  process.stdin.on("close", () => {
    notifyDisconnect("stdin_close");
  });
  process.on("exit", () => {
    notifyDisconnect("process_exit");
  });

  const transport = new StdioServerTransport();
  if (typeof transport.onclose === "function") {
    const origOnClose = transport.onclose;
    transport.onclose = () => {
      notifyDisconnect("transport_close");
      origOnClose();
    };
  } else {
    transport.onclose = () => {
      notifyDisconnect("transport_close");
    };
  }

  await server.connect(transport);

  // Reintentar feedbacks del outbox local en background (sin bloquear el startup)
  setImmediate(() => retryOutbox(runtime.root));
}

/**
 * Reintenta feedbacks del outbox local que no pudieron enviarse al Gateway.
 * Se ejecuta silenciosamente en background al arrancar el servidor MCP.
 * @param {string} repoRoot
 */
async function retryOutbox(repoRoot) {
  try {
    const { getStorageStructure } = await import("./core/storage-paths.mjs");
    const { readdir, readFile, unlink } = await import("node:fs/promises");
    const { default: https } = await import("node:https");
    const { default: http } = await import("node:http");
    const { default: pathMod } = await import("node:path");

    const storage = getStorageStructure(repoRoot);
    const outboxDir = storage.feedbackOutboxDir;

    let files;
    try {
      files = (await readdir(outboxDir)).filter((f) => f.endsWith(".json"));
    } catch {
      return; // No outbox dir = nada que reintentar
    }

    if (!files.length) return;

    // Leer config para obtener el endpoint
    let endpoint = process.env.AERON_FEEDBACK_ENDPOINT ||
      "https://aero-fluxer-feedback-gateway-4rp0.onrender.com/api/v1/feedback";
    try {
      const cfgPath = pathMod.join(repoRoot, "aeron.config.json");
      const cfg = JSON.parse(await readFile(cfgPath, "utf8"));
      if (cfg?.feedback?.endpoint) endpoint = cfg.feedback.endpoint;
    } catch { /* config no disponible, usar default */ }

    for (const file of files) {
      const filePath = pathMod.join(outboxDir, file);
      try {
        const payload = JSON.parse(await readFile(filePath, "utf8"));
        if (!payload.created_at) payload.created_at = new Date().toISOString();

        const payloadStr = JSON.stringify(payload);
        const url = new URL(endpoint);
        const client = url.protocol === "https:" ? https : http;

        const statusCode = await new Promise((resolve) => {
          const req = client.request(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payloadStr),
              "User-Agent": `Aero-Fluxer-X/v${VERSION}`,
            },
            timeout: 8000,
          }, (res) => {
            res.resume(); // Drenar body
            resolve(res.statusCode);
          });
          req.on("timeout", () => { req.destroy(); resolve(null); });
          req.on("error", () => resolve(null));
          req.write(payloadStr);
          req.end();
        });

        if (statusCode === 200 || statusCode === 201 || statusCode === 409) {
          await unlink(filePath).catch(() => {});
        }
      } catch { /* Error en un archivo individual — continuar con los demás */ }
    }
  } catch { /* Error inesperado en retryOutbox — no debe afectar el servidor */ }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  startServer().catch((error) => {
    console.error("[AERON FLUXER X] Fatal startup error:");
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  });
}
