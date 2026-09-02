// ============================================================================
// FLUXER MCP — Elevate (Cross-Platform)
// Linux: polkit (pkexec) / kdesu / sudo
// Windows: PowerShell Start-Process -Verb RunAs (UAC prompt)
// ============================================================================

import { promisify } from "node:util";
import { exec } from "node:child_process";

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
    } else if (agent === "powershell-runas") {
      if (/canceled|cancelled|denied/i.test(result.stderr || "")) {
        result.stderr =
          `${result.stderr || ""}\nEl diálogo de UAC fue cancelado. Intenta de nuevo y confirma en la ventana de Control de Cuentas de Usuario.`.trim();
      }
    } else if (
      /dismissed|not authorized|authentication/i.test(result.stderr || "")
    ) {
      result.stderr =
        `${result.stderr || ""}\nEl diálogo de autenticación fue cancelado o falló. Intenta de nuevo y confirma tu contraseña en el diálogo de ${agent}.`.trim();
    }
  }
  return result;
}

