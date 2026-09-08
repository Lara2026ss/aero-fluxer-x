/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚀 AERON FLUXER CORE — launcher.mjs
 * Supervisor de Proceso y Reinicio Automático (Hot-Reload) para Servidor MCP
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = path.join(__dirname, "server.js");

const HOT_RELOAD_EXIT_CODE = 75;
const MAX_FAST_RESTARTS = 5;
const FAST_RESTART_WINDOW_MS = 10000;

let restartTimes = [];
let childProcess = null;
let isShuttingDown = false;

function startServer() {
  const now = Date.now();
  restartTimes = restartTimes.filter((t) => now - t < FAST_RESTART_WINDOW_MS);
  restartTimes.push(now);

  if (restartTimes.length > MAX_FAST_RESTARTS) {
    console.error(
      `[FLUXER LAUNCHER] 🛑 Demasiados reinicios rápidos (${restartTimes.length} en 10s). Pausando supervisor.`
    );
    process.exit(1);
  }

  childProcess = spawn(process.execPath, [SERVER_SCRIPT, ...process.argv.slice(2)], {
    cwd: __dirname,
    stdio: "inherit",
    env: process.env,
  });

  childProcess.on("exit", (code, signal) => {
    childProcess = null;

    if (isShuttingDown) {
      process.exit(0);
      return;
    }

    if (code === HOT_RELOAD_EXIT_CODE) {
      console.error(
        `[FLUXER LAUNCHER] 🔄 Señal de actualización detectada (código 75). Reiniciando servidor MCP de inmediato...`
      );
      setTimeout(startServer, 300);
      return;
    }

    if (code === 0) {
      process.exit(0);
      return;
    }

    console.error(
      `[FLUXER LAUNCHER] ⚠️ El proceso MCP finalizó de forma inesperada (código ${code}, señal ${signal}).`
    );
    process.exit(code || 1);
  });

  childProcess.on("error", (err) => {
    console.error(`[FLUXER LAUNCHER] ❌ Error al lanzar servidor MCP: ${err.message}`);
    process.exit(1);
  });
}

function handleShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.error(`[FLUXER LAUNCHER] 🛑 Recibida señal ${signal}. Cierre elegante del proceso supervisor...`);

  if (childProcess) {
    childProcess.kill(signal);
  }
  setTimeout(() => process.exit(0), 1000);
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

startServer();
