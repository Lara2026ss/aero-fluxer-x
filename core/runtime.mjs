import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertWindows, killProcessTree, cleanCliXml, buildUtf8PowerShellScript } from "./platform/windows.mjs";
import { executeWindowsTerminal } from "./terminal-manager.mjs";
import { normalizeWindowsPath, getWindowsPathext, getToolchainSnapshot, resolveBinary } from "./toolchain.mjs";
import { Logger } from "./logger.mjs";
import { MemoryStore } from "./memory.mjs";
import { Session } from "./session.mjs";
import { detectClient } from "./client-detect.mjs";
import { PermissionEngine } from "./permissions.mjs";
import { Metrics } from "./metrics.mjs";
import { TaskQueue } from "./task-queue.mjs";
import { CircuitBreaker } from "./retry.mjs";
import { compactValue } from "./compact.mjs";
import { loadBuildMeta } from "./build-meta.mjs";
import { runElevated, detectElevationAgent } from "./elevate.mjs";
import { ConfirmationStore } from "./confirmation.mjs";
import { loadConfig } from "./config.mjs";
import { existsSync } from "node:fs";
import { AuditLog } from "./audit-log.mjs";
import { CURRENT_VERSION, BRAND_NAME } from "./version.mjs";
import { ensureUserDataInitialized } from "./storage-paths.mjs";
import { FirstRunBootstrap } from "./bootstrap.mjs";
import { OperationEngine } from "./operation-engine.mjs";
import { ProcessLifecycleManager } from "./process-lifecycle.mjs";
import { CachePolicyEngine } from "./cache-policy.mjs";
import { Validator } from "./validator.mjs";
import { FluxerError, ERROR_CODES } from "./errors.mjs";

export async function createRuntime({ root, version = CURRENT_VERSION, brand = BRAND_NAME }) {
  // Guardia de plataforma adaptativa (Windows 10/11 preferido)
  assertWindows({ strict: false });

  // Cargar configuración centralizada primero
  const config = await loadConfig(root);

  // Inicializar almacenamiento local aislado del usuario (%APPDATA% o ~/.config)
  const userStorage = await ensureUserDataInitialized(root);
  const home = os.homedir();
  const dirs = {
    root,
    home,
    storage: userStorage.base,
    runtime: userStorage.runtimeDir,
    memory: userStorage.memoryDir,
    logs: userStorage.logsDir,
    cache: userStorage.cacheDir,
    shortcuts: userStorage.shortcutsDir,
    config: userStorage.configDir,
    downloads: userStorage.downloads,
    documents: userStorage.documents,
    skills: path.join(home, ".gemini", "skills"),
    skillsConfig: path.join(home, ".gemini", "config", "skills"),
  };

  for (const dir of Object.values(dirs)) {
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
  }

  // Limpieza automática de almacenamiento temporal y rotación de logs
  const cleanStorageGarbage = async () => {
    try {
      const tempDir = path.join(dirs.cache, "temp_scripts");
      if (existsSync(tempDir)) {
        const files = await fs.readdir(tempDir);
        const now = Date.now();
        for (const file of files) {
          const filePath = path.join(tempDir, file);
          const stat = await fs.stat(filePath).catch(() => null);
          if (stat && now - stat.mtimeMs > 3600000) {
            await fs.unlink(filePath).catch(() => {});
          }
        }
      }
      const mainLog = path.join(dirs.logs, "fluxer.log");
      const logStat = await fs.stat(mainLog).catch(() => null);
      if (logStat && logStat.size > 5 * 1024 * 1024) {
        const content = await fs.readFile(mainLog, "utf8").catch(() => "");
        const lines = content.split(/\r?\n/);
        const trimmed = lines.slice(-2000).join("\n");
        await fs.writeFile(mainLog, trimmed, "utf8").catch(() => {});
      }
    } catch {}
  };
  await cleanStorageGarbage();

  // Entorno unificado y saneado con PATH y PATHEXT normalizados de Windows
  const normalizedPath = normalizeWindowsPath(process.env.PATH || process.env.Path || "");
  const normalizedPathext = getWindowsPathext(process.env.PATHEXT || process.env.PathExt || "");
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!/^path$/i.test(k) && !/^pathext$/i.test(k)) {
      env[k] = v;
    }
  }
  env.PATH = normalizedPath;
  env.Path = normalizedPath;
  env.PATHEXT = normalizedPathext;
  env.PathExt = normalizedPathext;
  env.PYTHONIOENCODING = "utf-8";
  env.NODE_ENV = process.env.NODE_ENV || "production";

  const logger = new Logger({ dir: dirs.logs, version, brand });
  logger.file = path.join(dirs.logs, "fluxer.log");

  const memory = new MemoryStore({
    file: path.join(dirs.memory, "fluxer-memory.sqlite"),
    legacyFile: path.join(dirs.memory, "memory.json"),
  });
  await memory.load();

  const bootstrap = new FirstRunBootstrap({ root, version, brand, logger });
  await bootstrap.initialize();

  const client = detectClient(env, memory);
  const session = new Session({ memory, logger });
  const permissions = new PermissionEngine({ memory, logger, config });
  permissions.cacheTtlMs = 60000;

  // Sistema de confirmación puntual: cuando una acción requiere más nivel
  // del que hay activo, en vez de fallar directo se crea una solicitud
  // pendiente que el cliente MCP (Claude) muestra al humano antes de
  // reintentar vía security.approve_request.
  const confirmations = new ConfirmationStore({ logger });

  const metrics = new Metrics({ memory });
  const taskQueue = new TaskQueue({
    concurrency: Number(process.env.FLUXER_CONCURRENCY || config.taskQueue?.concurrency || 4),
    maxQueue: Number(process.env.FLUXER_QUEUE_MAX || config.taskQueue?.maxQueue || 250),
  });
  const circuitBreaker = new CircuitBreaker({
    threshold: 5,
    cooldownMs: 30000,
  });

  // Audit log — registro inmutable de auditoría separado del log general
  const auditLog = new AuditLog({
    dir: dirs.logs,
    enabled: config.logging?.auditEnabled !== false,
  });
  await auditLog.init();

  // Project X: Gestor de Ciclo de Vida de Procesos, Caché y Operation Engine
  const processes = new ProcessLifecycleManager({ logger });
  const cache = new CachePolicyEngine({ runtime: null });
  const operations = new OperationEngine({ runtime: null });

  const buildMeta = await loadBuildMeta(root);
  const stateFile = path.join(dirs.runtime, "status.json");

  async function persistState(extra = {}) {
    const payload = {
      brand,
      version,
      build: buildMeta.release.build ?? 1,
      pid: process.pid,
      startedAt: new Date(
        Date.now() - Math.round(process.uptime() * 1000),
      ).toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      client: client.name,
      toolsLoaded: 0,
      pluginsLoaded: 0,
      connectedClients: 1,
      connectedClientNames: [client.name],
      memoryUsage: process.memoryUsage().rss,
      cpuLoad: os.loadavg()[0],
      ...extra,
    };
    await fs
      .writeFile(stateFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
      .catch(() => {});
    return payload;
  }

  async function run(command, options = {}) {
    const startTime = Date.now();
    const timeout = Math.min(
      Number(options.timeout ?? client.timeoutMs ?? 30000),
      600000,
    );
    const signal = options.signal ?? null;
    const priority = options.priority ?? "NORMAL";
    const requestedShell = String(options.shell || "powershell").toLowerCase();

    // 1. Validación estricta y canónica de CWD
    const effectiveCwd = options.cwd ? path.resolve(root, options.cwd) : home;
    if (!existsSync(effectiveCwd)) {
      return {
        ok: false,
        error: `El directorio de trabajo especificado no existe: '${options.cwd}' (resuelto a '${effectiveCwd}').`,
        stdout: "",
        stderr: `Directorio inexistente: ${effectiveCwd}`,
        code: "CWD_NOT_FOUND",
        exitCode: 1,
        durationMs: Date.now() - startTime,
        effectiveShell: requestedShell,
        effectiveCwd,
        resolvedCommand: command,
        effectiveEnvPath: env.PATH,
        encoding: "utf-8",
      };
    }

    // 2. Detección y rechazo controlado de sintaxis bash en PowerShell
    if (requestedShell === "powershell") {
      const hasBashAndOr = /(&&|\|\|)/.test(command);
      if (hasBashAndOr) {
        return {
          ok: false,
          error: "El comando contiene sintaxis de bash ('&&' o '||'), pero esta herramienta está ejecutando PowerShell. En PowerShell use ';' para ejecución secuencial, o 'if ($?) { ... }' / 'if ($LASTEXITCODE -eq 0) { ... }' para condicional, o configure explícitamente shell: 'cmd'.",
          stdout: "",
          stderr: "Sintaxis de bash no soportada en PowerShell",
          code: "INVALID_SHELL_SYNTAX",
          exitCode: 1,
          durationMs: Date.now() - startTime,
          effectiveShell: "powershell",
          effectiveCwd,
          resolvedCommand: command,
          effectiveEnvPath: env.PATH,
          encoding: "utf-8",
        };
      }
    }

    const execute = async () => {
      if (signal?.aborted) throw signal.reason ?? new Error("aborted");

      return await executeWindowsTerminal(command, {
        cwd: effectiveCwd,
        env: { ...env, ...(options.env || {}) },
        shell: requestedShell,
        timeout,
        signal,
      });
    };

    try {
      const result =
        options.queue === false
          ? await execute()
          : await taskQueue.run(execute, { priority, signal });

      return {
        ...result,
        durationMs: Date.now() - startTime,
        resolvedCommand: command,
        effectiveEnvPath: env.PATH,
        encoding: "utf-8",
      };
    } catch (error) {
      const isAbort =
        error.name === "AbortError" ||
        String(error.message).toLowerCase().includes("abort");
      const cleanOut = cleanCliXml(String(error.stdout ?? "")).trim();
      const cleanErr = cleanCliXml(String(error.stderr ?? error.message ?? "")).trim();
      return {
        ok: false,
        stdout: cleanOut,
        stderr: cleanErr,
        error: cleanErr || cleanOut || error.message,
        code: error.code ?? 1,
        exit_code: error.code ?? 1,
        exitCode: error.code ?? 1,
        durationMs: Date.now() - startTime,
        effectiveShell: requestedShell,
        effectiveCwd,
        resolvedCommand: command,
        effectiveEnvPath: env.PATH,
        encoding: "utf-8",
        ...(isAbort && { aborted: true }),
      };
    }
  }

  const bgTasks = new Map();

  function bg(command, options = {}) {
    const requestedShell = String(options.shell || "powershell").toLowerCase();
    const effectiveCwd = options.cwd ? path.resolve(root, options.cwd) : home;
    
    if (!existsSync(effectiveCwd)) {
      return { taskId: null, pid: null, command, status: "failed", error: `Directorio de trabajo inexistente: ${effectiveCwd}` };
    }

    let shellBin = "powershell.exe";
    let shellArgs = [];

    if (requestedShell === "cmd") {
      shellBin = "cmd.exe";
      shellArgs = ["/d", "/s", "/c", `chcp 65001 >nul && ${command}`];
    } else {
      const wrapped = buildUtf8PowerShellScript(command);
      const encoded = Buffer.from(wrapped, "utf16le").toString("base64");
      shellBin = "powershell.exe";
      shellArgs = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded];
    }

    const taskId = `bg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const startedAt = new Date().toISOString();
    
    let child;
    const taskRecord = {
      id: taskId,
      pid: null,
      command,
      shell: requestedShell,
      cwd: effectiveCwd,
      startedAt,
      status: "running",
      exitCode: null,
      logs: [],
    };

    try {
      child = spawn(shellBin, shellArgs, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        cwd: options.cwd ?? home,
        env: { ...env, ...(options.env || {}) },
      });

      taskRecord.pid = child.pid;
      child.stdout?.on("data", (chunk) => {
        const text = chunk.toString();
        taskRecord.logs.push({ stream: "stdout", text, ts: new Date().toISOString() });
        if (taskRecord.logs.length > 200) taskRecord.logs.shift();
      });
      child.stderr?.on("data", (chunk) => {
        const text = chunk.toString();
        taskRecord.logs.push({ stream: "stderr", text, ts: new Date().toISOString() });
        if (taskRecord.logs.length > 200) taskRecord.logs.shift();
      });

      child.once("exit", (code) => {
        taskRecord.status = code === 0 ? "completed" : "failed";
        taskRecord.exitCode = code;
      });

      bgTasks.set(taskId, { child, record: taskRecord });
      bgTasks.set(String(child.pid), { child, record: taskRecord });
      return { taskId, pid: child.pid, command, status: "running" };
    } catch (err) {
      taskRecord.status = "failed";
      taskRecord.error = err.message;
      return { taskId, pid: null, command, status: "failed", error: err.message };
    }
  }

  function getBgTasks() {
    const list = [];
    const seen = new Set();
    for (const item of bgTasks.values()) {
      if (!seen.has(item.record.id)) {
        seen.add(item.record.id);
        list.push({ ...item.record, logCount: item.record.logs.length });
      }
    }
    return list;
  }

  function getBgTaskLogs(idOrPid) {
    const item = bgTasks.get(String(idOrPid));
    if (!item) return null;
    return item.record;
  }

  function killBgTask(idOrPid) {
    const item = bgTasks.get(String(idOrPid));
    if (!item) return false;
    try {
      if (item.child) {
        try {
          if (item.child.pid) killProcessTree(item.child.pid);
          item.child.kill();
        } catch {}
      }
      item.record.status = "killed";
      return true;
    } catch {
      return false;
    }
  }

  function hp(value = ".") {
    let raw = String(value ?? ".").trim() || ".";
    raw = raw.replace(/\0/g, "").replace(/^["']|["']$/g, "").trim();
    if (raw.startsWith("file://")) {
      try {
        raw = fileURLToPath(raw);
      } catch {
        raw = raw.replace(/^file:\/\/\/?/, "");
      }
    }
    if (raw === "~") return home;
    if (raw.startsWith("~/") || raw.startsWith("~\\")) return path.join(home, raw.slice(2));
    if (path.isAbsolute(raw)) return path.normalize(raw);
    return path.resolve(root, raw);
  }

  function shellQuote(value) {
    return `'${String(value ?? "").replace(/'/g, "''")}'`;
  }

  function trim(value, max = client.maxResponseChars ?? 12000) {
    const text = String(value ?? "");
    return text.length > max ? `${text.slice(0, max)}...` : text;
  }

  function compact(value, args = {}) {
    return compactValue(value, {
      longTrue: Boolean(args.long_true),
      maxChars: client.maxResponseChars ?? 12000,
    });
  }

  async function readState() {
    try {
      return JSON.parse(await fs.readFile(stateFile, "utf8"));
    } catch {
      return null;
    }
  }

  async function shutdown(reason = "shutdown") {
    await logger.info("fluxer_shutdown", { reason });
    const visited = new Set();
    for (const item of bgTasks.values()) {
      try {
        if (item.child && !visited.has(item.child)) {
          visited.add(item.child);
          try {
            if (item.child.pid) killProcessTree(item.child.pid);
            item.child.kill();
          } catch {}
        }
      } catch {}
    }
    processes.cleanupAll();
    await logger.close();
    auditLog.close();
    memory.close();
    taskQueue.shutdown();
  }

  return {
    brand,
    root,
    version,
    config,
    dirs,
    env,
    home,
    logger,
    memory,
    session,
    permissions,
    bootstrap,
    hostId: bootstrap.hostId,
    displayHostname: bootstrap.displayHostname,
    isReady: bootstrap.isReady,
    waitForReady: (timeout) => bootstrap.waitForReady(timeout),
    confirmations,
    metrics,
    taskQueue,
    circuitBreaker,
    auditLog,
    processes,
    cache,
    operations,
    validator: Validator,
    errors: { FluxerError, ERROR_CODES },
    client,
    buildMeta,
    stateFile,
    run,
    runElevated: (command, options) => runElevated({ run }, command, options),
    elevationAgent: detectElevationAgent,
    bg,
    getBgTasks,
    getBgTaskLogs,
    killBgTask,
    hp,
    shellQuote,
    trim,
    compact,
    persistState,
    readState,
    shutdown,
    control: {
      reload: async () => ({ ok: false, reason: "not_ready" }),
      shutdown: async () => ({ ok: false, reason: "not_ready" }),
    },
  };

  operations.runtime = runtime;
  cache.runtime = runtime;
  return runtime;
}
