/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🖥️ FLUXER CORE — core/terminal-manager.mjs
 * Motor de Terminal Windows 11 Production-Grade
 *
 * - Detección priorizada de shell (pwsh 7 -> powershell 5.1 -> cmd.exe)
 * - Codificación UTF-8 estricta sin mojibake ([Console]::OutputEncoding)
 * - Drenado continuo de streams para evitar deadlocks de búfer de 64KB
 * - Terminación de árboles de procesos con taskkill /T /F (sin procesos zombies)
 * - Timeouts adaptativos (30s default, 120s para tests/compilación)
 * - Mapeo amigable de errores comunes de Windows
 * ══════════════════════════════════════════════════════════════════════════════
 */

import path from "node:path";
import fs from "node:fs";
import { spawn, execSync } from "node:child_process";
import { killProcessTree, cleanCliXml } from "./platform/windows.mjs";

let cachedShell = null;

/**
 * Detecta y devuelve la mejor shell disponible en el sistema.
 * 1. pwsh.exe (PowerShell 7 Core) si está en PATH o Program Files.
 * 2. powershell.exe (Windows PowerShell 5.1).
 * 3. cmd.exe como fallback final.
 */
export function detectBestShell() {
  if (cachedShell) return cachedShell;

  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";

  // 1. Probar PowerShell 7 (pwsh)
  const candidatePwsh = [
    path.join(programFiles, "PowerShell", "7", "pwsh.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "PowerShell", "7", "pwsh.exe"),
  ];

  for (const c of candidatePwsh) {
    if (fs.existsSync(c)) {
      cachedShell = { bin: c, type: "pwsh", name: "PowerShell 7 Core" };
      return cachedShell;
    }
  }

  try {
    const pwshWhich = execSync("where pwsh 2>nul", { encoding: "utf8" }).trim();
    if (pwshWhich) {
      const first = pwshWhich.split(/\r?\n/)[0].trim();
      if (fs.existsSync(first)) {
        cachedShell = { bin: first, type: "pwsh", name: "PowerShell 7 Core" };
        return cachedShell;
      }
    }
  } catch {}

  // 2. Probar Windows PowerShell 5.1
  const winPs = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (fs.existsSync(winPs)) {
    cachedShell = { bin: winPs, type: "powershell", name: "Windows PowerShell 5.1" };
    return cachedShell;
  }

  // 3. Fallback a powershell.exe genérico
  cachedShell = { bin: "powershell.exe", type: "powershell", name: "PowerShell (Default)" };
  return cachedShell;
}

/**
 * Detecta si una cadena contiene mojibake común de Windows.
 */
export function containsMojibake(str) {
  if (!str || typeof str !== "string") return false;
  return /[\uFFFD]|\u00C3[\u00A0-\u00BF]|\u00C2[\u00A0-\u00BF]/.test(str);
}

/**
 * Corrige mojibake convirtiendo de vuelta la secuencia errónea.
 */
export function fixMojibake(str) {
  if (!str) return str;
  try {
    return Buffer.from(str, "latin1").toString("utf8");
  } catch {
    return str;
  }
}

/**
 * Genera el script PowerShell con preámbulo UTF-8 estricto y configuración de entorno.
 */
export function buildUtf8Script(command, envPath, envPathext) {
  const lines = [
    "$ErrorActionPreference = 'Continue'",
    "[Console]::InputEncoding = [Console]::OutputEncoding = $OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
  ];

  if (envPath) {
    const escaped = envPath.replace(/'/g, "''");
    lines.push(`$env:PATH = '${escaped}'`);
  }
  if (envPathext) {
    const escapedExt = envPathext.replace(/'/g, "''");
    lines.push(`$env:PATHEXT = '${escapedExt}'`);
  }

  lines.push(command);
  return lines.join("\n");
}

/**
 * Mapea códigos de salida y mensajes de error de Windows a sugerencias útiles.
 */
export function mapWindowsError(command, code, stderr) {
  const lowerErr = (stderr || "").toLowerCase();
  if (
    code === 9009 ||
    lowerErr.includes("commandnotfoundexception") ||
    lowerErr.includes("is not recognized as the name of a cmdlet") ||
    lowerErr.includes("no se reconoce como nombre de un cmdlet") ||
    lowerErr.includes("is not recognized as an internal or external command") ||
    lowerErr.includes("no se reconoce como un comando")
  ) {
    const cmdName = command.trim().split(/\s+/)[0];
    return `Comando '${cmdName}' no encontrado en PATH de Windows. Sugerencia: verifique si la herramienta está instalada o instálela vía winget (ej: winget install ${cmdName}).`;
  }

  if (code === 5 || lowerErr.includes("access is denied") || lowerErr.includes("acceso denegado") || lowerErr.includes("unauthorizedaccessexception")) {
    return "Acceso denegado al ejecutar el comando. Sugerencia: Se requieren permisos elevados. Inicie un workflow elevado con security.start_workflow({ level: 'poweruser' }).";
  }

  return null;
}

/**
 * Determina el timeout adaptativo según el tipo de comando.
 */
export function getAdaptiveTimeout(command, userTimeout) {
  if (typeof userTimeout === "number" && userTimeout > 0) return userTimeout;
  const isHeavy = /(npm\s+(test|run|install|build)|cargo\s+(test|build)|mvn\s|gradle\s|pytest|python\s+-m\s+unittest)/i.test(command);
  return isHeavy ? 120000 : 30000;
}

/**
 * Ejecuta un comando en Windows con las garantías del Pilar 2.
 */
export async function executeWindowsTerminal(command, options = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    shell: requestedShell = "auto",
    timeout: userTimeout,
    signal,
    maxOutputChars = 500000,
  } = options;

  const startTime = Date.now();
  const timeout = getAdaptiveTimeout(command, userTimeout);

  let shellInfo;
  let spawnBin;
  let spawnArgs;

  if (requestedShell === "cmd") {
    shellInfo = { type: "cmd", name: "cmd.exe" };
    spawnBin = process.env.ComSpec || "cmd.exe";
    spawnArgs = ["/d", "/s", "/c", `chcp 65001 >nul && ${command}`];
  } else {
    shellInfo = detectBestShell();
    spawnBin = shellInfo.bin;
    const script = buildUtf8Script(command, env.PATH, env.PATHEXT);
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    spawnArgs = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded];
  }

  return new Promise((resolve) => {
    let stdoutChunks = [];
    let stderrChunks = [];
    let stdoutLen = 0;
    let stderrLen = 0;
    let timedOut = false;
    let timer = null;

    const child = spawn(spawnBin, spawnArgs, {
      cwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      ...(signal ? { signal } : {}),
    });

    if (timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          if (child.pid) killProcessTree(child.pid);
          child.kill("SIGKILL");
        } catch {}
      }, timeout);
    }

    child.stdout?.on("data", (chunk) => {
      stdoutLen += chunk.length;
      if (stdoutLen <= maxOutputChars * 2) {
        stdoutChunks.push(chunk);
      }
    });

    child.stderr?.on("data", (chunk) => {
      stderrLen += chunk.length;
      if (stderrLen <= maxOutputChars * 2) {
        stderrChunks.push(chunk);
      }
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);

      let stdout = Buffer.concat(stdoutChunks).toString("utf8");
      let stderr = Buffer.concat(stderrChunks).toString("utf8");

      stdout = cleanCliXml(stdout).trim();
      stderr = cleanCliXml(stderr).trim();

      if (containsMojibake(stdout)) {
        stdout = fixMojibake(stdout);
      }
      if (containsMojibake(stderr)) {
        stderr = fixMojibake(stderr);
      }

      const durationMs = Date.now() - startTime;
      const ok = code === 0 && !timedOut;
      const suggestion = mapWindowsError(command, code, stderr);

      resolve({
        ok,
        stdout,
        stderr,
        code: code ?? (ok ? 0 : 1),
        exit_code: code ?? (ok ? 0 : 1),
        exitCode: code ?? (ok ? 0 : 1),
        durationMs,
        effectiveShell: shellInfo.name,
        effectiveCwd: cwd,
        resolvedCommand: command,
        timedOut,
        ...(suggestion ? { suggestion } : {}),
      });
    });

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      resolve({
        ok: false,
        stdout: "",
        stderr: err.message,
        error: err.message,
        code: 1,
        exit_code: 1,
        exitCode: 1,
        durationMs,
        effectiveShell: shellInfo.name,
        effectiveCwd: cwd,
        resolvedCommand: command,
        timedOut,
      });
    });
  });
}
