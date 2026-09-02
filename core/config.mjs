/**
 * FLUXER Config Loader v7.0
 * Lee fluxer.config.json y provee configuración central a todos los subsistemas.
 * Soporta override por variables de entorno.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { CURRENT_VERSION } from "./version.mjs";
import { getStorageStructure } from "./storage-paths.mjs";

const DEFAULTS = {
  version: CURRENT_VERSION,
  mcp: { transport: "stdio" },
  http: { port: 8765, host: "127.0.0.1", enabled: true },
  security: { mode: "NORMAL", trustedClient: false, confirmDangerousActions: true },
  logging: { level: "info", auditEnabled: true, maxLogLines: 1000 },
  tools: {
    files: true,
    system: true,
    terminal: true,
    packages: true,
    database: true,
    security: true,
    shortcuts: true,
    network: true,
    diagnostics: true,
    developer: true,
  },
  timeouts: { filesystem: 10000, http: 15000, terminal: 30000, diagnostics: 15000 },
  compact: { enabled: true, level: "normal", maxChars: 15000, paginationEnabled: true, pageSize: 100 },
  ai: { provider: "auto", ollamaUrl: "http://127.0.0.1:11434", defaultModel: "llama3" },
  taskQueue: { concurrency: 4, maxQueue: 250 },
  workspace: { path: null, autoDetect: true },
};

function deepMerge(base, override) {
  if (!override || typeof override !== "object") return base;
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (override[key] !== null && typeof override[key] === "object" && !Array.isArray(override[key])) {
      result[key] = deepMerge(base[key] ?? {}, override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

/**
 * Carga la configuración de FLUXER desde fluxer.config.json.
 * Si no existe, usa los valores por defecto.
 * Variables de entorno sobrescriben valores del archivo.
 */
export async function loadConfig(root) {
  const aeronPath = path.join(root, "aeron.config.json");
  const fluxerPath = path.join(root, "fluxer.config.json");
  let fileConfig = {};

  try {
    const raw = await fs.readFile(aeronPath, "utf8");
    fileConfig = JSON.parse(raw);
  } catch {
    try {
      const raw = await fs.readFile(fluxerPath, "utf8");
      fileConfig = JSON.parse(raw);
    } catch {}
  }

  // Cargar configuración local de usuario si existe (separa repo vs usuario)
  let userConfig = {};
  try {
    const userStructure = getStorageStructure(root);
    if (existsSync(userStructure.configFile)) {
      const rawUser = await fs.readFile(userStructure.configFile, "utf8");
      userConfig = JSON.parse(rawUser);
    }
  } catch {}

  const merged = deepMerge(DEFAULTS, fileConfig);
  const config = deepMerge(merged, userConfig);

  // Override por variables de entorno (AERON_* prioritarias, FLUXER_* legacy)
  const envPort = process.env.AERON_HTTP_PORT || process.env.FLUXER_HTTP_PORT;
  if (envPort) config.http.port = Number(envPort);
  const envSec = process.env.AERON_SECURITY_MODE || process.env.FLUXER_SECURITY_MODE;
  if (envSec) config.security.mode = envSec;
  if (process.env.AERON_TRUSTED_CLIENT === "true" || process.env.FLUXER_TRUSTED_CLIENT === "true") config.security.trustedClient = true;
  const envConc = process.env.AERON_CONCURRENCY || process.env.FLUXER_CONCURRENCY;
  if (envConc) config.taskQueue.concurrency = Number(envConc);
  const envQueue = process.env.AERON_QUEUE_MAX || process.env.FLUXER_QUEUE_MAX;
  if (envQueue) config.taskQueue.maxQueue = Number(envQueue);
  if (process.env.OLLAMA_URL) config.ai.ollamaUrl = process.env.OLLAMA_URL;
  const envLog = process.env.AERON_LOG_LEVEL || process.env.FLUXER_LOG_LEVEL;
  if (envLog) config.logging.level = envLog;

  return config;
}

/**
 * Carga la configuración de forma síncrona (para uso en startup crítico).
 */
export function loadConfigSync(root) {
  const aeronPath = path.join(root, "aeron.config.json");
  const fluxerPath = path.join(root, "fluxer.config.json");
  let fileConfig = {};
  try {
    if (existsSync(aeronPath)) {
      fileConfig = JSON.parse(readFileSync(aeronPath, "utf8"));
    } else if (existsSync(fluxerPath)) {
      fileConfig = JSON.parse(readFileSync(fluxerPath, "utf8"));
    }
  } catch {}

  let userConfig = {};
  try {
    const userStructure = getStorageStructure(root);
    if (existsSync(userStructure.configFile)) {
      userConfig = JSON.parse(readFileSync(userStructure.configFile, "utf8"));
    }
  } catch {}

  const merged = deepMerge(DEFAULTS, fileConfig);
  return deepMerge(merged, userConfig);
}
