import { execSync, spawn } from "node:child_process";
import os from "node:os";

/**
 * Valida o inspecciona el entorno de ejecución.
 * Optimizado nativamente para Windows 10/11 (win32) con compatibilidad adaptativa multiplataforma.
 */
export function assertWindows(options = {}) {
  const { strict = false } = options;
  if (process.platform !== "win32") {
    const msg = `[AERON FLUXER X] Plataforma detectada: '${process.platform}'. Aeron Fluxer X está optimizado para Windows 10/11; funcionando en modo adaptativo multiplataforma.`;
    if (strict) {
      console.error(msg);
      throw new Error(msg);
    }
    return false;
  }
  return true;
}

export function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
    } else {
      execSync(`kill -9 -${pid} 2>/dev/null || kill -9 ${pid} 2>/dev/null`, { stdio: "ignore" });
    }
  } catch {}
}

export function cleanCliXml(text) {
  if (!text || typeof text !== "string") return "";
  // Eliminar bloques de progreso de PowerShell que se filtran en stderr
  let cleaned = text
    .replace(/<Obj S="progress"[^>]*>.*?<\/Obj>/gs, "")
    .replace(/<PR[^>]*>.*?<\/PR>/gs, "");

  if (!cleaned.includes("<Objs") && !cleaned.includes("#< CLIXML") && !cleaned.includes("_x00")) {
    return cleaned.trim();
  }
  const stringRegex = /<S S="(?:Error|Warning|Information|Verbose)">(.*?)<\/S>/gs;
  const matches = [];
  let match;
  while ((match = stringRegex.exec(cleaned)) !== null) {
    let unescaped = match[1]
      .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, "\"")
      .replace(/&apos;/g, "'");
    matches.push(unescaped);
  }
  if (matches.length > 0) {
    return matches.join("").trim();
  }
  return cleaned
    .replace(/#<\s*CLIXML/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

export function getWindowsHardwareSnapshot() {
  return {
    platform: "win32",
    release: os.release(),
    arch: os.arch(),
    cpus: os.cpus(),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: os.uptime()
  };
}

/**
 * Prepara un script de PowerShell con codificación UTF-8 estricta sin BOM, inyección de PATH/PATHEXT garantizado y preferencias silenciosas.
 */
export function buildUtf8PowerShellScript(scriptBody, effectivePath = "", effectivePathext = "") {
  const pathInjection = effectivePath ? `$env:PATH = '${effectivePath.replace(/'/g, "''")}';\n` : "";
  const pathextInjection = effectivePathext
    ? `$env:PATHEXT = '${effectivePathext.replace(/'/g, "''")}';\n`
    : `$env:PATHEXT = '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC;.CPL;.PS1';\n`;
  return `
${pathInjection}${pathextInjection}[Console]::InputEncoding = [Console]::OutputEncoding = $OutputEncoding = [System.Text.Encoding]::UTF8;
$ProgressPreference = 'SilentlyContinue';
$WarningPreference = 'SilentlyContinue';
$InformationPreference = 'SilentlyContinue';
${scriptBody}
`;
}
