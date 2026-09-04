/**
 * FLUXER MCP — core/registry.mjs
 * Compositor delgado: importa dominios de tools/ y los registra.
 * Toda la lógica de negocio vive en tools/*.mjs — este archivo solo orquesta.
 *
 * @version 8.0.0
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import dns from "node:dns/promises";
import net from "node:net";
import { sendNativeNotification } from "./notify.mjs";

import { createFilesDomain } from "../tools/files.mjs";
import { createSystemDomain } from "../tools/system.mjs";
import { createTerminalDomain } from "../tools/terminal.mjs";
import { createPackagesDomain } from "../tools/packages.mjs";
import { createDatabaseDomain } from "../tools/database.mjs";
import { createSecurityDomain } from "../tools/security.mjs";
import { createShortcutsDomain } from "../tools/shortcuts.mjs";
import { createGuideDomain } from "../tools/guide.mjs";

// ── Utilidades compartidas ───────────────────────────────────────────────────

async function httpFetchText(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 20000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        ...(options.headers || {}),
      },
      redirect: "follow",
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, url: res.url };
  } catch (err) {
    return { ok: false, error: err.message, text: "" };
  } finally {
    clearTimeout(timeoutId);
  }
}

function escapeRegex(string) {
  return String(string).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePkgLines(stdout) {
  const text = String(stdout || "")
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/\r/g, "\n");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      if (/^[-—=\s\u2500-\u257F\u2580-\u259F]+$/.test(l)) return false;
      if (/^\s*\d+%\s*/.test(l) || /^[████\u2580-\u259F]+/.test(l)) return false;
      if (/^(\+--|`--|\|--|[+\-|`]\s)/.test(l)) return true; // npm tree lines
      const lower = l.toLowerCase();
      if (lower.startsWith("nombre ") || lower.startsWith("name ") || lower.startsWith("id ") || lower.startsWith("paquete ") || lower.startsWith("package ") || lower.startsWith("version ") || lower.startsWith("directory ")) return false;
      if (lower.includes("search_agreements") || lower.includes("source_agreements") || lower.includes("buscando") || lower.includes("searching") || lower.includes("se encontró") || lower.includes("found ") || lower.includes("installed package")) return false;
      return true;
    })
    .slice(0, 100);
}

function splitLines(value) {
  return String(value ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function detectPkgManager() {
  return process.platform === "win32" ? "winget" : "apt";
}

function buildPkgCmd(operation, mgr = "winget", name, runtime) {
  const m = String(mgr || (process.platform === "win32" ? "winget" : "apt")).toLowerCase();
  const q = name ? runtime.shellQuote(name) : "";
  switch (operation) {
    case "install":
      if (m === "winget") return `winget install --id ${q} --accept-source-agreements --accept-package-agreements -e`;
      if (m === "choco") return `choco install ${q} -y`;
      if (m === "scoop") return `scoop install ${q}`;
      if (m === "npm") return `npm install -g ${q}`;
      if (m === "pnpm") return `pnpm add -g ${q}`;
      if (m === "pip" || m === "pip3") return `pip install ${q}`;
      if (m === "cargo") return `cargo install ${q}`;
      if (m === "go") return `go install ${q}`;
      if (m === "brew") return `brew install ${q}`;
      if (m === "dnf") return `dnf install -y ${q}`;
      if (m === "pacman") return `pacman -S --noconfirm ${q}`;
      return `apt-get install -y ${q}`;
    case "remove":
      if (m === "winget") return `winget uninstall --id ${q} -e`;
      if (m === "choco") return `choco uninstall ${q} -y`;
      if (m === "scoop") return `scoop uninstall ${q}`;
      if (m === "npm") return `npm uninstall -g ${q}`;
      if (m === "pnpm") return `pnpm remove -g ${q}`;
      if (m === "pip" || m === "pip3") return `pip uninstall -y ${q}`;
      if (m === "cargo") return `cargo uninstall ${q}`;
      if (m === "brew") return `brew uninstall ${q}`;
      if (m === "dnf") return `dnf remove -y ${q}`;
      if (m === "pacman") return `pacman -R --noconfirm ${q}`;
      return `apt-get remove -y ${q}`;
    case "update":
      if (m === "winget") return name ? `winget upgrade --id ${q} -e` : `winget upgrade --all`;
      if (m === "choco") return name ? `choco upgrade ${q} -y` : `choco upgrade all -y`;
      if (m === "scoop") return name ? `scoop update ${q}` : `scoop update *`;
      if (m === "npm") return name ? `npm update -g ${q}` : `npm update -g`;
      if (m === "pnpm") return name ? `pnpm update -g ${q}` : `pnpm update -g`;
      if (m === "pip" || m === "pip3") return `pip install --upgrade ${q || "pip"}`;
      if (m === "cargo") return `cargo install-update -a`;
      if (m === "brew") return name ? `brew upgrade ${q}` : `brew upgrade`;
      if (m === "dnf") return name ? `dnf upgrade -y ${q}` : `dnf upgrade -y`;
      if (m === "pacman") return `pacman -Syu --noconfirm`;
      return `apt-get upgrade -y ${q}`;
    case "search":
      if (m === "winget") return `winget search ${q} --accept-source-agreements`;
      if (m === "choco") return `choco search ${q}`;
      if (m === "scoop") return `scoop search ${q}`;
      if (m === "npm") return `npm search ${q}`;
      if (m === "pnpm") return `pnpm search ${q}`;
      if (m === "pip" || m === "pip3") return `pip search ${q}`;
      if (m === "cargo") return `cargo search ${q}`;
      if (m === "brew") return `brew search ${q}`;
      if (m === "dnf") return `dnf search ${q}`;
      if (m === "pacman") return `pacman -Ss ${q}`;
      return `apt-cache search ${q}`;
    case "info":
      if (m === "winget") return `winget show --id ${q}`;
      if (m === "choco") return `choco info ${q}`;
      if (m === "scoop") return `scoop info ${q}`;
      if (m === "npm") return `npm view ${q}`;
      if (m === "pnpm") return `pnpm view ${q}`;
      if (m === "pip" || m === "pip3") return `pip show ${q}`;
      if (m === "cargo") return `cargo info ${q}`;
      if (m === "brew") return `brew info ${q}`;
      if (m === "dnf") return `dnf info ${q}`;
      if (m === "pacman") return `pacman -Si ${q}`;
      return `apt-cache show ${q}`;
    case "list":
      if (m === "winget") return `winget list`;
      if (m === "choco") return `choco list --local-only`;
      if (m === "scoop") return `scoop list`;
      if (m === "npm") return `npm list -g --depth=0`;
      if (m === "pnpm") return `pnpm list -g --depth=0`;
      if (m === "pip" || m === "pip3") return `pip list`;
      if (m === "cargo") return `cargo install --list`;
      if (m === "brew") return `brew list`;
      if (m === "dnf") return `dnf list installed`;
      if (m === "pacman") return `pacman -Q`;
      return `apt list --installed`;
    default:
      return `${m} list`;
  }
}

function extractParamHint(fn) {
  if (typeof fn !== "function") return "";
  const str = fn.toString();
  const match = str.match(/(?:async\s*)?(?:function\s*)?(?:[^(]*)\(\s*\{([^}]*)\}/);
  if (!match) return "{}";
  const params = match[1]
    .split(",")
    .map((item) => {
      const noDefault = item.split("=")[0].trim();
      const propKey = noDefault.split(":")[0].trim();
      return propKey.replace(/[^a-zA-Z0-9_]/g, "");
    })
    .filter(Boolean);
  return params.length ? `{ ${params.join(", ")} }` : "{}";
}

class DomainCache {
  constructor(defaultTtlMs = 4000, actionTtls = {}) {
    this.defaultTtlMs = defaultTtlMs;
    this.actionTtls = actionTtls;
    this.map = new Map();
  }
  ttlFor(action) { return this.actionTtls[action] ?? this.defaultTtlMs; }
  key(action, args) { return `${action}:${JSON.stringify(args ?? {})}`; }
  get(action, args) {
    const k = this.key(action, args);
    const entry = this.map.get(k);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > this.ttlFor(action)) { this.map.delete(k); return undefined; }
    return entry.value;
  }
  set(action, args, value) { this.map.set(this.key(action, args), { value, ts: Date.now() }); }
  invalidate(action, args) {
    if (action && args !== undefined) { this.map.delete(this.key(action, args)); }
    else if (action) { for (const k of this.map.keys()) { if (k.startsWith(`${action}:`)) this.map.delete(k); } }
    else { this.map.clear(); }
  }
}

function domain(name, description, actions, permissions = {}, opts = {}) {
  const actionSignatures = {};
  for (const [key, fn] of Object.entries(actions)) {
    actionSignatures[key] = extractParamHint(fn);
  }
  return {
    name,
    description,
    actions,
    permissions,
    actionSignatures,
    cache: new DomainCache(opts.cacheTtlMs ?? 4000, opts.actionTtls ?? {}),
    cacheableActions: new Set(opts.cacheable ?? []),
  };
}

// Helpers compartidos para dominios de archivos
async function getDirectoryTreeHelper(dir, maxDepth = 2, currDepth = 0) {
  if (currDepth > maxDepth) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const tree = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const children = currDepth < maxDepth ? await getDirectoryTreeHelper(full, maxDepth, currDepth + 1) : [];
      tree.push({ name: entry.name, type: "directory", children });
    } else {
      tree.push({ name: entry.name, type: "file" });
    }
  }
  return tree;
}

async function searchFilesHelper(dir, pattern, excludePatterns = [], limit = 100, results = []) {
  if (results.length >= limit) return results;
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (results.length >= limit) break;
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (excludePatterns.some((p) => full.includes(p) || entry.name.includes(p))) continue;
    let matches = true;
    if (pattern && pattern !== "*") {
      try {
        const regexStr = "^" + pattern.split("*").map((s) => s.split("?").map(escapeRegex).join(".")).join(".*") + "$";
        matches = new RegExp(regexStr, "i").test(entry.name);
      } catch {
        matches = entry.name.toLowerCase().includes(pattern.toLowerCase());
      }
    }
    if (entry.isDirectory()) {
      if (matches) results.push({ name: entry.name, path: full, isDirectory: true });
      await searchFilesHelper(full, pattern, excludePatterns, limit, results);
    } else {
      if (matches) results.push({ name: entry.name, path: full, isDirectory: false });
    }
  }
  return results;
}

async function grepFilesHelper(targetPath, query, limit = 50, options = {}, results = []) {
  if (results.length >= limit) return results;
  const { isRegex = false, caseInsensitive = true, includePattern = null, maxFileSize = 20 * 1024 * 1024 } = options;

  let matcher;
  if (isRegex) {
    try {
      matcher = new RegExp(query, caseInsensitive ? "i" : "");
    } catch {
      // Fallback seguro a búsqueda literal si la regex es inválida
      const escaped = escapeRegex(query);
      matcher = new RegExp(escaped, caseInsensitive ? "i" : "");
    }
  }

  const binaryExts = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".exe", ".dll", ".so", ".dylib",
    ".bin", ".zip", ".tar", ".gz", ".7z", ".pdf", ".sqlite", ".sqlite-shm", ".sqlite-wal",
    ".mp3", ".mp4", ".wav", ".avi", ".mov", ".woff", ".woff2", ".ttf", ".eot"
  ]);

  function isGlobMatch(fileName, pattern) {
    if (!pattern || pattern === "*") return true;
    try {
      const regexStr = "^" + pattern.split("*").map((s) => s.split("?").map(escapeRegex).join(".")).join(".*") + "$";
      return new RegExp(regexStr, "i").test(fileName);
    } catch {
      return fileName.toLowerCase().includes(pattern.toLowerCase());
    }
  }

  async function searchInFile(filePath) {
    if (results.length >= limit) return;
    const ext = path.extname(filePath).toLowerCase();
    if (binaryExts.has(ext)) return;
    if (includePattern && !isGlobMatch(path.basename(filePath), includePattern)) return;

    try {
      const stat = await fs.stat(filePath);
      if (stat.size > maxFileSize) return;

      const content = await fs.readFile(filePath, "utf8").catch(() => "");
      if (content.includes("\0")) return; // Detección de archivo binario

      const lines = content.split(/\r?\n/);
      const qLower = caseInsensitive ? String(query).toLowerCase() : String(query);

      for (let i = 0; i < lines.length; i++) {
        if (results.length >= limit) break;
        const line = lines[i];
        let matched = false;

        if (matcher) {
          matched = matcher.test(line);
        } else if (caseInsensitive) {
          matched = line.toLowerCase().includes(qLower);
        } else {
          matched = line.includes(query);
        }

        if (matched) {
          results.push({
            file: filePath,
            lineNumber: i + 1,
            lineContent: line.trim().slice(0, 300),
          });
        }
      }
    } catch {}
  }

  try {
    const stat = await fs.stat(targetPath);
    if (stat.isFile()) {
      await searchInFile(targetPath);
      return results;
    }

    if (stat.isDirectory()) {
      const entries = await fs.readdir(targetPath, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (results.length >= limit) break;
        if (["node_modules", ".git", "dist", "build", ".next", ".cache", ".gemini"].includes(entry.name)) continue;
        const full = path.join(targetPath, entry.name);
        if (entry.isDirectory()) {
          await grepFilesHelper(full, query, limit, options, results);
        } else {
          await searchInFile(full);
        }
      }
    }
  } catch {}

  return results;
}

function generateSimpleDiff(oldStr, newStr, leftPath = "a", rightPath = "b") {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const diffLines = [`--- ${leftPath}`, `+++ ${rightPath}`];
  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      diffLines.push(` ${oldLines[i]}`); i++; j++;
    } else {
      if (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) { diffLines.push(`-${oldLines[i]}`); i++; }
      if (j < newLines.length && (i >= oldLines.length || oldLines[i - 1] !== newLines[j])) { diffLines.push(`+${newLines[j]}`); j++; }
    }
  }
  return diffLines.join("\n");
}

// ── Registry Class ───────────────────────────────────────────────────────────

export class Registry {
  constructor(runtime) {
    this.runtime = runtime;
    this.modules = new Map();
  }

  async load() {
    const runtime = this.runtime;

    // Cargar shortcuts persistidos
    if (!runtime._shortcuts) {
      runtime._shortcuts = new Map();
      try {
        const file = path.join(runtime.dirs.storage, "shortcuts.json");
        const raw = await fs.readFile(file, "utf8");
        const parsed = JSON.parse(raw);
        for (const [k, v] of Object.entries(parsed)) runtime._shortcuts.set(k, v);
      } catch (e) {
        if (e.code !== "ENOENT") {
          process.stderr.write(`[Registry] Error cargando shortcuts.json: ${e.message}\n`);
        }
      }
    }

    // Contexto compartido para todos los dominios
    const helpers = { getDirectoryTreeHelper, searchFilesHelper, grepFilesHelper, generateSimpleDiff, splitLines };

    // Dynamic import con cache busting para soportar recarga en caliente
    const ts = Date.now();
    const [
      { createFilesDomain: filesFactory },
      { createSystemDomain: systemFactory },
      { createTerminalDomain: terminalFactory },
      { createPackagesDomain: packagesFactory },
      { createDatabaseDomain: databaseFactory },
      { createSecurityDomain: securityFactory },
      { createShortcutsDomain: shortcutsFactory },
      { createNetworkDomain: networkFactory } = {},
      { createDiagnosticsDomain: diagnosticsFactory } = {},
      { createDeveloperDomain: developerFactory } = {},
      { createGuideDomain: guideFactory } = {},
    ] = await Promise.all([
      import(`../tools/files.mjs?t=${ts}`).catch(() => ({})),
      import(`../tools/system.mjs?t=${ts}`).catch(() => ({})),
      import(`../tools/terminal.mjs?t=${ts}`).catch(() => ({})),
      import(`../tools/packages.mjs?t=${ts}`).catch(() => ({})),
      import(`../tools/database.mjs?t=${ts}`).catch(() => ({})),
      import(`../tools/security.mjs?t=${ts}`).catch(() => ({})),
      import(`../tools/shortcuts.mjs?t=${ts}`).catch(() => ({})),
      import(`../tools/network.mjs?t=${ts}`).catch(() => ({})),
      import(`../tools/diagnostics.mjs?t=${ts}`).catch(() => ({})),
      import(`../tools/developer.mjs?t=${ts}`).catch(() => ({})),
      import(`../tools/guide.mjs?t=${ts}`).catch(() => ({})),
    ]);

    const domains = [
      (filesFactory || createFilesDomain)({ runtime, path, fs, crypto, domain, helpers }),
      (systemFactory || createSystemDomain)({ runtime, os, dns, net, domain, httpFetchText, sendNativeNotification }),
      (terminalFactory || createTerminalDomain)({ runtime, path, fs, crypto, domain }),
      (packagesFactory || createPackagesDomain)({ runtime, domain, parsePkgLines, buildPkgCmd, detectPkgManager }),
      (databaseFactory || createDatabaseDomain)({ runtime, path, fs, domain, splitLines }),
      (securityFactory || createSecurityDomain)({ runtime, fs, crypto, domain, splitLines }),
      (shortcutsFactory || createShortcutsDomain)({ runtime, path, fs, domain }),
      ...(networkFactory ? [networkFactory({ runtime, dns, net, domain })] : []),
      ...(diagnosticsFactory ? [diagnosticsFactory({ runtime, domain, fs })] : []),
      ...(developerFactory ? [developerFactory({ runtime, domain, fs, path })] : []),
      ...(guideFactory ? [guideFactory({ runtime, domain })] : []),
    ];

    this.modules = new Map(domains.map((d) => [d.name, d]));
  }


  // ── API pública — usada por router.mjs, server.mjs, dashboard-api.mjs ──────

  moduleNames() {
    return [...this.modules.keys()];
  }

  actionsFor(name) {
    return Object.keys(this.modules.get(name)?.actions ?? {}).sort();
  }

  actionSignatures(name) {
    const unit = this.modules.get(name);
    return unit ? (unit.actionSignatures || {}) : {};
  }

  actionCount() {
    return [...this.modules.values()].reduce((sum, unit) => sum + Object.keys(unit.actions).length, 0);
  }

  resolve(tool, action) {
    const unit = this.modules.get(tool);
    const handler = unit?.actions?.[action];
    if (!unit || typeof handler !== "function") return null;
    return { scope: "domain", unit, handler };
  }

  async runCached(tool, action, args, handler, runtime) {
    const unit = this.modules.get(tool);
    if (unit?.cacheableActions?.has(action)) {
      const cached = unit.cache.get(action, args);
      if (cached !== undefined) {
        runtime?.metrics?.cacheHit?.(tool, action);
        return cached;
      }
      runtime?.metrics?.cacheMiss?.(tool, action);
      const value = await handler();
      unit.cache.set(action, args, value);
      return value;
    }
    return handler();
  }

  registerDomain(domainObj) {
    if (this.modules.has(domainObj.name)) throw new Error(`Domain "${domainObj.name}" already registered.`);
    if (!domainObj.cache) domainObj.cache = new DomainCache(4000);
    if (!domainObj.cacheableActions) domainObj.cacheableActions = new Set();
    if (!domainObj.permissions) domainObj.permissions = {};
    this.modules.set(domainObj.name, domainObj);
  }

  unregisterDomain(toolName) {
    this.modules.delete(toolName);
  }

  snapshot() {
    const modules = [...this.modules.values()].map((unit) => ({
      name: unit.name,
      description: unit.description,
      actions: Object.keys(unit.actions).sort(),
      signatures: unit.actionSignatures || {},
    }));
    return { modules, plugins: [], duplicates: [], errors: [] };
  }

  health() {
    return {
      ok: true,
      modules: this.modules.size,
      plugins: 0,
      actions: this.actionCount(),
      errors: [],
      duplicates: [],
    };
  }
}
