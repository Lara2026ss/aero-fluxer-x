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
import { CURRENT_VERSION, APP_NAME } from "./core/version.mjs";
import { createRuntime } from "./core/runtime.mjs";
import { Registry } from "./core/registry.mjs";
import { Router } from "./core/router.mjs";
import { startDashboardApi } from "./core/dashboard-api.mjs";
import { PluginLoader } from "./core/plugin-loader.mjs";
import { sendNativeNotification } from "./core/notify.mjs";

assertWindows({ strict: false });

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VERSION = CURRENT_VERSION;
const SERVER_NAME = APP_NAME;

function notifyClient(clientName, event = "connect", version = VERSION, options = {}) {
  const displayAI = (clientName || "desconocida").replace(/"/g, "'").trim();
  const actionText = event === "connect" ? "conectó exitosamente a" : "desconectó exitosamente de";
  const msg = `La Inteligencia Artificial "${displayAI}" se ${actionText} Aeron Fluxer X v${version}`;
  sendNativeNotification("AERON FLUXER X MCP", msg, options);
}


function mcpText(value) {
  return {
    content: [
      {
        type: "text",
        text:
          typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function toolSchema(name, description, actions) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: actions },
        args: { type: "object" },
      },
      required: ["action"],
      additionalProperties: false,
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

  const tools = registry.moduleNames().map((name) => {
    const baseDescription =
      registry.snapshot().modules.find((m) => m.name === name)?.description ??
      `${SERVER_NAME} ${name} domain router`;
    const signatures = registry.actionSignatures(name);
    const actionsCheatSheet = registry
      .actionsFor(name)
      .map(
        (action) =>
          `${action}${signatures[action] ? " " + signatures[action] : ""}`,
      )
      .join(" | ");
    const description = `${baseDescription}\nAcciones y argumentos (usar en args): ${actionsCheatSheet}`;
    return toolSchema(name, description, registry.actionsFor(name));
  });
  const server = new Server(
    { name: SERVER_NAME, version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      const rawArgs = req.params.arguments || {};
      const action = rawArgs.action;
      let args = rawArgs.args;

      if (!args || typeof args !== "object") {
        const { action: _, ...rest } = rawArgs;
        args = rest;
      } else {
        const { action: _, args: nested, ...rest } = rawArgs;
        args = { ...rest, ...nested };
      }

      const response = await router.execute({
        tool: req.params.name,
        action,
        args,
      });
      return mcpText(response);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error ?? "unknown_error");
      const actionName = req.params.arguments?.action;
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
        tool: req.params.name,
        action: actionName,
        error: message,
        code: error?.code || "INTERNAL_ERROR",
        suggestion: error?.suggestion || "Revise la sintaxis de la llamada y los parámetros enviados.",
        recoverable: error?.recoverable !== undefined ? error.recoverable : true,
      });
    }
  });

  await refreshState();
  
  const clientName = runtime.client?.name || "desconocida";
  await runtime.logger.info(`La Inteligencia Artificial "${clientName}" se conectó a Aeron Fluxer X v${VERSION}`, {
    version: VERSION,
    root: ROOT,
    tools: tools.length,
    plugins: pluginsLoaded.length,
    client: clientName,
  });
  notifyClient(clientName, "connect", VERSION, { sync: false });

  let hasDisconnected = false;
  const notifyDisconnect = (reason = "shutdown") => {
    if (hasDisconnected) return;
    hasDisconnected = true;
    try { notifyClient(clientName, "disconnect", VERSION, { sync: false }); } catch {}
  };

  const shutdown = async (signal) => {
    notifyDisconnect(signal);
    dashboard?.close?.();
    await runtime.logger.info(`La Inteligencia Artificial "${clientName}" se desconectó de Aeron Fluxer X v${VERSION}`);
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
