/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔄 AERON FLUXER X — core/process-lifecycle.mjs
 * Gestor Centralizado del Ciclo de Vida de Procesos Hijos y Limpieza de Recursos
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { spawn, exec } from "node:child_process";
import { promisify } from "node:util";
import { FluxerError, ERROR_CODES } from "./errors.mjs";

const execAsync = promisify(exec);

export class ProcessLifecycleManager {
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.activeProcesses = new Map();
    this.activeTimers = new Set();
    this._isShuttingDown = false;

    this._installShutdownHooks();
  }

  _installShutdownHooks() {
    const cleanup = () => this.cleanupAll();
    process.once("exit", cleanup);
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
  }

  /**
   * Registra y gestiona un timer asegurando su desregistro al finalizar.
   */
  registerTimer(fn, ms) {
    if (this._isShuttingDown) return null;
    const timerId = setTimeout(async () => {
      this.activeTimers.delete(timerId);
      try {
        await fn();
      } catch (e) {
        this.logger.warn?.("timer_callback_failed", { error: e.message });
      }
    }, ms);

    timerId.unref?.();
    this.activeTimers.add(timerId);
    return timerId;
  }

  clearManagedTimer(timerId) {
    if (timerId && this.activeTimers.has(timerId)) {
      clearTimeout(timerId);
      this.activeTimers.delete(timerId);
    }
  }

  /**
   * Ejecuta un comando en un proceso hijo gestionado con timeout, cancelación y tracking.
   */
  async runManagedCommand(command, {
    cwd = process.cwd(),
    timeoutMs = 30000,
    shell = "powershell.exe",
    env = process.env,
    signal = null,
  } = {}) {
    if (this._isShuttingDown) {
      throw new FluxerError("El servidor está en proceso de apagado. Operación cancelada.", {
        code: ERROR_CODES.PROCESS_FAILED
      });
    }

    return new Promise((resolve, reject) => {
      const child = spawn(shell, ["-NoProfile", "-NonInteractive", "-Command", command], {
        cwd,
        env,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"]
      });

      const procRecord = {
        pid: child.pid,
        command,
        startedAt: Date.now(),
        status: "running"
      };

      this.activeProcesses.set(child.pid, procRecord);

      let stdout = "";
      let stderr = "";
      let isTimedOut = false;

      child.stdout.on("data", (d) => { stdout += d.toString("utf8"); });
      child.stderr.on("data", (d) => { stderr += d.toString("utf8"); });

      const timeoutId = timeoutMs > 0 ? setTimeout(() => {
        isTimedOut = true;
        this.killProcessTree(child.pid).catch(() => {});
      }, timeoutMs) : null;
      timeoutId?.unref?.();

      const onAbort = () => {
        this.killProcessTree(child.pid).catch(() => {});
        reject(new FluxerError("Comando abortado por señal externa.", {
          code: ERROR_CODES.TIMEOUT,
          retryable: true
        }));
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      child.on("error", (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        this.activeProcesses.delete(child.pid);
        reject(new FluxerError(`Fallo al iniciar proceso: ${err.message}`, {
          code: ERROR_CODES.PROCESS_FAILED,
          details: { error: err.message, command }
        }));
      });

      child.on("close", (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        this.activeProcesses.delete(child.pid);
        if (signal) signal.removeEventListener("abort", onAbort);

        if (isTimedOut) {
          reject(new FluxerError(`Comando excedió el tiempo límite de ${timeoutMs}ms.`, {
            code: ERROR_CODES.TIMEOUT,
            retryable: true,
            details: { timeoutMs, command }
          }));
          return;
        }

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code,
          ok: code === 0
        });
      });
    });
  }

  /**
   * Termina de forma segura y completa un proceso y todo su árbol de descendientes.
   */
  async killProcessTree(pid) {
    if (!pid || pid === 0 || pid === 4 || pid === process.pid) return;

    try {
      if (process.platform === "win32") {
        await execAsync(`taskkill /F /T /PID ${pid}`).catch(() => {});
      } else {
        process.kill(-pid, "SIGKILL");
      }
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    } finally {
      this.activeProcesses.delete(pid);
    }
  }

  /**
   * Limpieza forzada de todos los procesos y timers activos durante el shutdown.
   */
  cleanupAll() {
    this._isShuttingDown = true;

    for (const timer of this.activeTimers) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();

    for (const pid of this.activeProcesses.keys()) {
      try {
        if (process.platform === "win32") {
          exec(`taskkill /F /T /PID ${pid}`);
        } else {
          process.kill(pid, "SIGKILL");
        }
      } catch {}
    }
    this.activeProcesses.clear();
  }

  getSnapshot() {
    return {
      activeProcessesCount: this.activeProcesses.size,
      activeTimersCount: this.activeTimers.size,
      processes: Array.from(this.activeProcesses.values())
    };
  }
}
