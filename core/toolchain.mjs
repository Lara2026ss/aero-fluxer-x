/**
 * 🪟 AERON FLUXER X — Unified Windows Toolchain & Environment Snapshot
 * Única fuente de verdad para PATH, resolución determinista de binarios y estado del entorno en Windows 10/11.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";

const execFileAsync = promisify(execFile);

let _cachedSnapshot = null;
let _lastSnapshotTime = 0;
const SNAPSHOT_TTL_MS = 60000; // 1 minuto de cache para evitar sobrecarga

/**
 * Garantiza la lista completa de extensiones ejecutables estándar de Windows (PATHEXT).
 */
export function getWindowsPathext(rawPathext = process.env.PATHEXT || "") {
  const defaultExts = [".COM", ".EXE", ".BAT", ".CMD", ".VBS", ".VBE", ".JS", ".JSE", ".WSF", ".WSH", ".MSC", ".CPL", ".PS1"];
  const parts = (rawPathext || "").split(";").map(e => e.trim().toUpperCase()).filter(Boolean);
  for (const ext of defaultExts) {
    if (!parts.includes(ext)) parts.push(ext);
  }
  return parts.join(";");
}

/**
 * Normaliza y sanea el PATH de Windows:
 * - Divide por ';'
 * - Remueve rutas vacías y comillas
 * - Deduplica entradas preservando el orden (case-insensitive)
 * - Garantiza que directorios críticos del sistema estén presentes
 */
export function normalizeWindowsPath(rawPath = process.env.PATH || "") {
  const parts = rawPath.split(";").map(p => p.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const seen = new Set();
  const normalized = [];

  for (const part of parts) {
    const clean = part.replace(/[\\\/]+$/, "");
    const norm = path.normalize(clean);
    const key = norm.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(norm);
    }
  }

  // Asegurar directorios críticos del sistema y del toolchain de desarrollo de Windows
  const systemRoot = process.env.SystemRoot || (process.platform === "win32" ? "C:\\Windows" : "/");
  const userProfile = process.env.USERPROFILE || os.homedir();
  const appData = process.env.APPDATA || path.join(userProfile, "AppData", "Roaming");
  const localAppData = process.env.LOCALAPPDATA || path.join(userProfile, "AppData", "Local");
  const nodeDir = path.dirname(process.execPath);

  const criticalDirs = [
    nodeDir,
    path.join(appData, "npm"),
    "C:\\Program Files\\nodejs",
    path.join(systemRoot, "System32"),
    systemRoot,
    path.join(systemRoot, "System32", "Wbem"),
    path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0"),
    path.join(systemRoot, "System32", "OpenSSH"),
    "C:\\Program Files\\Git\\cmd",
    "C:\\Program Files\\Git\\bin",
    path.join(localAppData, "Programs", "Python", "Python312"),
    path.join(localAppData, "Programs", "Python", "Python312", "Scripts"),
    path.join(localAppData, "Programs", "Python", "Launcher"),
    path.join(localAppData, "Microsoft", "WinGet", "Links"),
    path.join(localAppData, "Microsoft", "WinGet", "Packages", "Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe", "cmd"),
    path.join(userProfile, ".cargo", "bin"),
    path.join(userProfile, ".dotnet", "tools"),
    "C:\\Program Files\\dotnet",
    "C:\\ProgramData\\chocolatey\\bin",
    path.join(userProfile, "scoop", "shims"),
  ];

  for (const crit of criticalDirs) {
    if (!crit) continue;
    const clean = crit.replace(/[\\\/]+$/, "");
    const norm = path.normalize(clean);
    const key = norm.toLowerCase();
    if (!seen.has(key) && existsSync(norm)) {
      seen.add(key);
      normalized.push(norm);
    }
  }

  return normalized.join(";");
}

const _binaryCache = new Map();
const BINARY_CACHE_TTL_MS = 60000;

export function invalidateToolchainCache() {
  _cachedSnapshot = null;
  _lastSnapshotTime = 0;
  _binaryCache.clear();
}

/**
 * Resuelve la ruta absoluta de un ejecutable en Windows usando búsqueda rápida en PATH y caché
 */
export async function resolveBinary(binaryName, customPath = null) {
  if (!binaryName) return null;
  const envPath = customPath || process.env.PATH || "";
  const cacheKey = `${binaryName}:${envPath}`;

  // Verificar caché en memoria
  const cached = _binaryCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts < BINARY_CACHE_TTL_MS)) {
    if (cached.path && existsSync(cached.path)) return cached.path;
  }

  // Si ya es una ruta absoluta y existe
  if (path.isAbsolute(binaryName) && existsSync(binaryName)) {
    const norm = path.normalize(binaryName);
    _binaryCache.set(cacheKey, { path: norm, ts: Date.now() });
    return norm;
  }

  // 1. Búsqueda directa manual en directorios de PATH (instantánea, sin spawn)
  const extensions = [".exe", ".cmd", ".bat", ".ps1", ""];
  const searchDirs = envPath.split(";").map(d => d.trim().replace(/^["']|["']$/g, "")).filter(Boolean);

  for (const dir of searchDirs) {
    for (const ext of extensions) {
      const candidate = path.join(dir, binaryName.endsWith(ext) ? binaryName : `${binaryName}${ext}`);
      if (existsSync(candidate)) {
        const norm = path.normalize(candidate);
        _binaryCache.set(cacheKey, { path: norm, ts: Date.now() });
        return norm;
      }
    }
  }

  // 2. Fallback a where.exe nativo de Windows si no se encontró en la búsqueda directa
  try {
    const { stdout } = await execFileAsync("where.exe", [binaryName], {
      env: { ...process.env, PATH: envPath },
      timeout: 3000,
      windowsHide: true,
    });
    const firstMatch = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean)[0];
    if (firstMatch && existsSync(firstMatch)) {
      const norm = path.normalize(firstMatch);
      _binaryCache.set(cacheKey, { path: norm, ts: Date.now() });
      return norm;
    }
  } catch {}

  _binaryCache.set(cacheKey, { path: null, ts: Date.now() });
  return null;
}

/**
 * Obtiene el snapshot integral del toolchain y entorno de ejecución
 */
export async function getToolchainSnapshot(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _cachedSnapshot && (now - _lastSnapshotTime < SNAPSHOT_TTL_MS)) {
    return _cachedSnapshot;
  }

  const effectivePath = normalizeWindowsPath(process.env.PATH);
  const probeExec = async (cmd, args = ["--version"]) => {
    try {
      const { stdout } = await execFileAsync(cmd, args, {
        env: { ...process.env, PATH: effectivePath },
        timeout: 4000,
        windowsHide: true,
      });
      return stdout.trim().split(/\r?\n/)[0];
    } catch {
      return null;
    }
  };

  const [
    nodePath,
    npmPath,
    gitPath,
    pythonPath,
    powershellPath,
    pwshPath,
    wingetPath,
  ] = await Promise.all([
    resolveBinary("node.exe", effectivePath),
    resolveBinary("npm.cmd", effectivePath) || resolveBinary("npm", effectivePath),
    resolveBinary("git.exe", effectivePath),
    resolveBinary("python.exe", effectivePath),
    resolveBinary("powershell.exe", effectivePath),
    resolveBinary("pwsh.exe", effectivePath),
    resolveBinary("winget.exe", effectivePath),
  ]);

  const [
    nodeVer,
    npmVer,
    gitVer,
    pythonVer,
    psVer,
    wingetVer,
  ] = await Promise.all([
    probeExec("node", ["--version"]),
    probeExec("npm", ["--version"]),
    probeExec("git", ["--version"]),
    probeExec("python", ["--version"]),
    probeExec("powershell.exe", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]),
    probeExec("winget", ["--version"]),
  ]);

  _cachedSnapshot = {
    platform: "win32",
    arch: process.arch,
    isWindowsOnly: true,
    effectivePath,
    binaries: {
      node: { path: nodePath, version: nodeVer || process.version, available: Boolean(nodePath) },
      npm: { path: npmPath, version: npmVer, available: Boolean(npmPath) },
      git: { path: gitPath, version: gitVer, available: Boolean(gitPath) },
      python: { path: pythonPath, version: pythonVer, available: Boolean(pythonPath) },
      powershell: { path: pwshPath || powershellPath, version: psVer, available: Boolean(pwshPath || powershellPath), isCore: Boolean(pwshPath) },
      winget: { path: wingetPath, version: wingetVer, available: Boolean(wingetPath) },
    },
    system: {
      systemRoot: process.env.SystemRoot || (process.platform === "win32" ? "C:\\Windows" : "/"),
      temp: process.env.TEMP || process.env.TMP || os.tmpdir(),
      userProfile: process.env.USERPROFILE || os.homedir(),
      computerName: process.env.COMPUTERNAME || os.hostname() || "Unknown",
    },
    snapshotAt: new Date().toISOString(),
  };

  _lastSnapshotTime = now;
  return _cachedSnapshot;
}
