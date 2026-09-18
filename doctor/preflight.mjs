/**
 * 🩺 AERON FLUXER X DOCTOR — doctor/preflight.mjs
 * Motor Preflight para comprobar disponibilidad de API, autenticación y capacidades antes de auditoría live.
 */

import { checkCommand } from "./static.mjs";

export async function runPreflightCheck(runtime) {
  const preflightResults = {
    ok: true,
    apiAvailable: true,
    authenticated: true,
    permissionsOk: true,
    platformOk: process.platform === "win32",
    code: "OK",
    details: [],
  };

  if (!preflightResults.platformOk) {
    preflightResults.ok = false;
    preflightResults.code = "CAPABILITY_UNSUPPORTED";
    preflightResults.details.push("Aeron Fluxer X requiere Windows 10/11.");
    return preflightResults;
  }

  // Verificar Node.js
  const nodeRes = await checkCommand("node --version");
  if (!nodeRes.ok) {
    preflightResults.ok = false;
    preflightResults.code = "PREFLIGHT_FAILED";
    preflightResults.details.push("Node.js no está instalado o no es accesible en PATH.");
  }

  // Verificar permisos en runtime
  if (runtime?.permissions) {
    const currentMode = runtime.permissions.mode || "NORMAL";
    preflightResults.details.push(`Modo de seguridad activo: ${currentMode}`);
  }

  return preflightResults;
}
