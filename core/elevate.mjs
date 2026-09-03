// ============================================================================
// FLUXER MCP — Elevate (Cross-Platform)
// Linux: polkit (pkexec) / kdesu / sudo
// Windows: PowerShell Start-Process -Verb RunAs (UAC prompt)
// ============================================================================

import { promisify } from "node:util";
import { exec } from "node:child_process";
import os from "node:os";
import path from "node:path";

const execAsync = promisify(exec);

let cachedAgent = null;

async function commandExists(bin) {
  try {
    if (process.platform === "win32") {
      await execAsync(`where ${bin}`, { shell: "cmd.exe" });
    } else {
      await execAsync(`command -v ${bin}`);
    }
    return true;
  } catch {
    return false;
  }
}

export async function isProcessElevated() {
  if (process.platform !== "win32") {
    return process.getuid ? process.getuid() === 0 : false;
  }
  try {
    const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -Command "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"`);
    return stdout.trim().toLowerCase() === "true";
  } catch {
    return false;
  }
}

export async function detectElevationAgent() {
  if (cachedAgent) return cachedAgent;

  if (process.platform === "win32") {
    cachedAgent = "powershell-runas";
    return cachedAgent;
  }

  if (await commandExists("pkexec")) {
    cachedAgent = "pkexec";
  } else if (await commandExists("kdesu")) {
    cachedAgent = "kdesu";
  } else {
    cachedAgent = "none";
  }
  return cachedAgent;
}

export async function buildElevatedCommand(command) {
  const agent = await detectElevationAgent();

  if (agent === "powershell-runas") {
    // Windows UAC: lanza un nuevo PowerShell elevado que ejecuta el comando
    const escaped = command.replace(/'/g, "''");
    return `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command','${escaped}'"`;
  }

  const inner = `bash -c ${JSON.stringify(command)}`;

  if (agent === "pkexec") {
    return `pkexec env DISPLAY="$DISPLAY" WAYLAND_DISPLAY="$WAYLAND_DISPLAY" XAUTHORITY="$XAUTHORITY" ${inner}`;
  }
  if (agent === "kdesu") {
    return `kdesu -c ${JSON.stringify(command)}`;
  }
  return `sudo ${inner}`;
}

export async function runElevated(runtime, command, options = {}) {
  const isElevated = await isProcessElevated();
  if (isElevated) {
    // Si ya somos administrador, ejecutar directamente para capturar stdout/stderr sin popups
    return runtime.run(command, options);
  }

  if (process.platform === "win32") {
    const tmpOut = path.join(os.tmpdir(), `fluxer_elevated_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.log`);
    const escapedCmd = command.replace(/'/g, "''");
    const script = `Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command','& { ${escapedCmd} } *>&1 | Out-File -FilePath ''${tmpOut}'' -Encoding utf8'; if (Test-Path '${tmpOut}') { Get-Content -Raw '${tmpOut}'; Remove-Item '${tmpOut}' -Force -ErrorAction SilentlyContinue }`;
    const wrapped = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${script}"`;
    const result = await runtime.run(wrapped, {
      ...options,
      queue: options.queue ?? true,
    });
    if (!result.ok || /Solicitud no compatible|InvalidOperationException/i.test(result.stderr || "")) {
      if (/Solicitud no compatible|InvalidOperationException/i.test(result.stderr || "")) {
        const fallback = await runtime.run(command, options);
        if (fallback.ok) {
          fallback.note = "Ejecutado con credenciales de la sesión actual (UAC interactivo no disponible en el entorno del proceso host).";
          return fallback;
        }
      }
      if (/canceled|cancelled|denied/i.test(result.stderr || "")) {
        result.stderr = `${result.stderr || ""}\nEl diálogo de UAC fue cancelado. Intenta de nuevo y confirma en la ventana de Control de Cuentas de Usuario.`.trim();
      }
    }
    return result;
  }

  const wrapped = await buildElevatedCommand(command);
  const result = await runtime.run(wrapped, {
    ...options,
    queue: options.queue ?? true,
  });
  if (!result.ok) {
    const agent = await detectElevationAgent();
    if (agent === "none") {
      result.stderr =
        `${result.stderr || ""}\nNo se encontró pkexec/kdesu/sudo interactivo disponible. Instala 'polkit' (pkexec) para permitir el diálogo gráfico de contraseña.`.trim();
    } else if (
      /dismissed|not authorized|authentication/i.test(result.stderr || "")
    ) {
      result.stderr =
        `${result.stderr || ""}\nEl diálogo de autenticación fue cancelado o falló. Intenta de nuevo y confirma tu contraseña en el diálogo de ${agent}.`.trim();
    }
  }
  return result;
}

