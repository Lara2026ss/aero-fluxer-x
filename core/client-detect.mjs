import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";


const CLIENT_ENV_SIGNALS = {
  // Google Antigravity CLI vs App
  google_antigravity_cli: ["ANTIGRAVITY_CLI", "AGY_CLI", "ANTIGRAVITY_CLI_VERSION"],
  google_antigravity_app: ["ANTIGRAVITY_AGENT", "ANTIGRAVITY_LS_ADDRESS", "ANTIGRAVITY_CONVERSATION_ID", "ANTIGRAVITY_PROJECT_ID", "GOOGLE_ANTIGRAVITY", "ANTIGRAVITY_APP", "CHROME_DESKTOP"],

  // Antigravity (Genéricos/Legacy)
  antigravity_cli: ["AGY_CLI_VERSION"],
  antigravity_app: ["ANTIGRAVITY_VERSION", "AGY_ENV"],

  // Claude Code CLI vs Claude Desktop App
  claude_code_cli: ["CLAUDE_CODE", "CLAUDE_CODE_ENTRYPOINT"],
  claude_desktop: ["CLAUDE_DESKTOP", "ANTHROPIC_API_KEY", "CLAUDE"],

  // Cursor CLI vs Cursor App
  cursor_cli: ["CURSOR_CLI", "CURSOR_TERMINAL"],
  cursor_app: ["CURSOR_APP_VERSION", "CURSOR_CHANNEL", "CURSOR_VERSION"],

  // Codex CLI vs Codex App
  codex_cli: ["OPENAI_CODEX_CLI", "CODEX_CLI"],
  codex_app: ["OPENAI_CODEX", "CODEX_ENV"],

  // Otros clientes
  chatgpt_desktop: ["CHATGPT_DESKTOP", "OPENAI_DESKTOP"],
  gemini_cli: ["GEMINI_CLI", "GOOGLE_CLOUD_PROJECT"],
  gemini_desktop: ["GEMINI_DESKTOP"],
  roo_code: ["ROO_CODE", "ROO_CLINE"],
  cline: ["CLINE_VERSION", "VSCODE_CLINE"],
  continue: ["CONTINUE_VERSION", "CONTINUE_DEV"],
  windsurf: ["WINDSURF_VERSION", "WINDSURF_ENV"],
  vscode_agent: ["GITHUB_COPILOT_VERSION", "VSCODE_GIT_ASKPASS_NODE"],
  opencode: ["OPENCODE_VERSION"],
  goose: ["GOOSE_VERSION", "GOOSE_ENV"],
  aider: ["AIDER_VERSION", "AIDER_ENV"],
};

const DISPLAY_NAMES = {
  google_antigravity_app: "Google Antigravity (App)",
  google_antigravity_cli: "Google Antigravity (Terminal)",
  antigravity_cli: "Antigravity (Terminal)",
  antigravity_app: "Google Antigravity (App)",
  antigravity: "Google Antigravity",
  claude_code_cli: "Claude Code (Terminal)",
  claude_code: "Claude Code (Terminal)",
  claude_desktop: "Claude Desktop (App)",
  claude: "Claude Desktop (App)",
  cursor_cli: "Cursor (Terminal)",
  cursor_app: "Cursor (App)",
  cursor: "Cursor",
  codex_cli: "Codex (Terminal)",
  codex_app: "Codex (App)",
  codex: "Codex",
  chatgpt_desktop: "ChatGPT (App)",
  gemini_cli: "Gemini (Terminal)",
  gemini_desktop: "Gemini (App)",
  roo_code: "Roo Code",
  cline: "Cline",
  continue: "Continue",
  windsurf: "Windsurf",
  vscode_agent: "VS Code Agent",
  opencode: "OpenCode",
  goose: "Goose",
  aider: "Aider",
  desconocida: "desconocida",
};

const PROFILES = {
  claude_desktop: { maxResponseChars: 12000, timeoutMs: 30000, supportsImages: false },
  claude: { maxResponseChars: 12000, timeoutMs: 30000, supportsImages: false },
  claude_code_cli: { maxResponseChars: 14000, timeoutMs: 45000, supportsImages: true },
  claude_code: { maxResponseChars: 14000, timeoutMs: 45000, supportsImages: true },
  cursor_app: { maxResponseChars: 10000, timeoutMs: 30000, supportsImages: false },
  cursor_cli: { maxResponseChars: 10000, timeoutMs: 30000, supportsImages: false },
  cursor: { maxResponseChars: 10000, timeoutMs: 30000, supportsImages: false },
  codex_cli: { maxResponseChars: 16000, timeoutMs: 45000, supportsImages: true },
  codex_app: { maxResponseChars: 16000, timeoutMs: 45000, supportsImages: true },
  codex: { maxResponseChars: 16000, timeoutMs: 45000, supportsImages: true },
  google_antigravity_app: { maxResponseChars: 14000, timeoutMs: 45000, supportsImages: true },
  google_antigravity_cli: { maxResponseChars: 14000, timeoutMs: 45000, supportsImages: true },
  antigravity_app: { maxResponseChars: 14000, timeoutMs: 45000, supportsImages: true },
  antigravity_cli: { maxResponseChars: 10000, timeoutMs: 30000, supportsImages: false },
  antigravity: { maxResponseChars: 14000, timeoutMs: 45000, supportsImages: true },
  chatgpt_desktop: { maxResponseChars: 14000, timeoutMs: 35000, supportsImages: true },
  gemini_cli: { maxResponseChars: 11000, timeoutMs: 30000, supportsImages: true },
  gemini_desktop: { maxResponseChars: 11000, timeoutMs: 30000, supportsImages: true },
  roo_code: { maxResponseChars: 10000, timeoutMs: 30000, supportsImages: true },
  cline: { maxResponseChars: 11000, timeoutMs: 30000, supportsImages: true },
  continue: { maxResponseChars: 9000, timeoutMs: 25000, supportsImages: false },
  windsurf: { maxResponseChars: 11000, timeoutMs: 30000, supportsImages: true },
  vscode_agent: { maxResponseChars: 10000, timeoutMs: 30000, supportsImages: false },
  opencode: { maxResponseChars: 10000, timeoutMs: 30000, supportsImages: true },
  goose: { maxResponseChars: 10000, timeoutMs: 30000, supportsImages: false },
  aider: { maxResponseChars: 10000, timeoutMs: 30000, supportsImages: false },
  desconocida: { maxResponseChars: 10000, timeoutMs: 30000, supportsImages: false },
};

export function formatClientDisplayName(rawName) {
  if (!rawName || String(rawName).toLowerCase() === "desconocida") return "desconocida";
  const normalized = String(rawName).trim();
  const key = normalized.toLowerCase().replace(/ /g, "_");
  if (DISPLAY_NAMES[key]) return DISPLAY_NAMES[key];
  return normalized
    .split(/[_\- ]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getProcessAncestry() {
  const chain = [];
  try {
    let currentPid = process.ppid;
    if (process.platform === "win32") {
      try {
        const out = execSync(`powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress"`, { stdio: ["ignore", "pipe", "ignore"], timeout: 2500 }).toString("utf8");
        const procs = JSON.parse(out);
        const map = new Map();
        if (Array.isArray(procs)) {
          for (const p of procs) map.set(p.ProcessId, p);
        } else if (procs && procs.ProcessId) {
          map.set(procs.ProcessId, procs);
        }
        while (currentPid && currentPid > 0 && chain.length < 5) {
          const info = map.get(currentPid);
          if (!info) break;
          if (info.CommandLine) chain.push(String(info.CommandLine).toLowerCase());
          currentPid = info.ParentProcessId;
        }
      } catch {}
      return chain;
    }

    while (currentPid && currentPid > 1 && chain.length < 5) {
      try {
        const cmd = fs.readFileSync(`/proc/${currentPid}/cmdline`, "utf8").replace(/\0/g, " ").trim().toLowerCase();
        if (cmd) chain.push(cmd);
        const stat = fs.readFileSync(`/proc/${currentPid}/stat`, "utf8");
        const closingParenIndex = stat.lastIndexOf(")");
        if (closingParenIndex !== -1) {
          const rest = stat.slice(closingParenIndex + 2).split(" ");
          currentPid = parseInt(rest[1], 10);
        } else {
          break;
        }
      } catch {
        break;
      }
    }
  } catch {}
  return chain;
}


function getClientSignature(env, parentCmds) {
  for (const [clientId, envVars] of Object.entries(CLIENT_ENV_SIGNALS)) {
    if (envVars.some((varName) => varName in env)) {
      return `env_signal:${clientId}`;
    }
  }
  for (const k of Object.keys(env)) {
    if (
      k.startsWith("AI_") ||
      k.startsWith("LLM_") ||
      k.includes("CLAUDE") ||
      k.includes("CURSOR") ||
      k.includes("CODEX") ||
      k.includes("ANTIGRAVITY")
    ) {
      return `env:${k}`;
    }
  }
  if (parentCmds.length > 0) {
    const parentCmd = parentCmds[0];
    const parts = parentCmd.split(" ").filter(Boolean);
    const bin = parts[0] || "";
    const arg1 = parts[1] || "";
    if ((bin.endsWith("node") || bin.endsWith("python") || bin.endsWith("python3")) && arg1) {
      return `cmd:${path.basename(bin)}_${path.basename(arg1)}`;
    }
    return `cmd:${path.basename(bin)}`;
  }
  return `ppid:${process.ppid || "unknown"}`;
}

export function detectClient(env = process.env, memory = null) {
  const parentCmds = getProcessAncestry();
  const signature = getClientSignature(env, parentCmds);
  const fullCmds = parentCmds.join(" ");

  // 1. Consultar registro guardado previamente en memoria SQLite si existe
  if (memory?.get) {
    const registeredName = memory.get("registered_clients", signature);
    if (registeredName && typeof registeredName === "string" && registeredName !== "desconocida") {
      const formatted = formatClientDisplayName(registeredName);
      const profile = PROFILES[registeredName.toLowerCase()] ?? PROFILES.desconocida;
      return {
        id: registeredName.toLowerCase(),
        name: formatted,
        brand: "FLUXER",
        signature,
        capabilities: { tools: true, resources: false, prompts: false },
        responseMode: profile.maxResponseChars <= 10000 ? "tight" : "normal",
        ...profile,
      };
    }
  }

  // 2. Detección por variables de entorno explícitas
  for (const [clientId, envVars] of Object.entries(CLIENT_ENV_SIGNALS)) {
    if (envVars.some((varName) => varName in env)) {
      const displayName = DISPLAY_NAMES[clientId] ?? formatClientDisplayName(clientId);
      const profile = PROFILES[clientId] ?? PROFILES.desconocida;
      if (memory?.set) {
        try {
          memory.set("registered_clients", signature, displayName);
        } catch {}
      }
      return {
        id: clientId,
        name: displayName,
        brand: "FLUXER",
        signature,
        capabilities: { tools: true, resources: false, prompts: false },
        responseMode: profile.maxResponseChars <= 10000 ? "tight" : "normal",
        ...profile,
      };
    }
  }

  // 3. Detección por línea de comandos / jerarquía de procesos
  if (fullCmds) {
    let matchedId = null;

    // Google Antigravity / AGY
    if (fullCmds.includes("antigravity") || fullCmds.includes("agy")) {
      const isCli = fullCmds.includes("antigravity-cli") || fullCmds.includes("agy cli") || fullCmds.includes("antigravity_cli");
      matchedId = isCli ? "google_antigravity_cli" : "google_antigravity_app";
    }
    // Claude Code CLI / Claude Desktop App
    else if (fullCmds.includes("claude")) {
      const isCli = fullCmds.includes("claude-code") || fullCmds.includes("claude_code") || fullCmds.includes("claude code") || fullCmds.includes("@anthropic-ai/claude-code");
      matchedId = isCli ? "claude_code_cli" : "claude_desktop";
    }
    // Cursor CLI / Cursor App
    else if (fullCmds.includes("cursor")) {
      const isCli = fullCmds.includes("cursor-cli") || fullCmds.includes("cursor_cli") || fullCmds.includes("cursor --cli") || fullCmds.includes("cursor cli");
      matchedId = isCli ? "cursor_cli" : "cursor_app";
    }
    // Codex CLI / Codex App
    else if (fullCmds.includes("codex")) {
      const isCli = fullCmds.includes("codex-cli") || fullCmds.includes("codex_cli") || fullCmds.includes("codex cli");
      matchedId = isCli ? "codex_cli" : "codex_app";
    }
    // Otros clientes
    else if (fullCmds.includes("windsurf")) matchedId = "windsurf";
    else if (fullCmds.includes("cline")) matchedId = "cline";
    else if (fullCmds.includes("roo")) matchedId = "roo_code";
    else if (fullCmds.includes("continue")) matchedId = "continue";

    if (matchedId) {
      const displayName = DISPLAY_NAMES[matchedId] ?? formatClientDisplayName(matchedId);
      const profile = PROFILES[matchedId] ?? PROFILES.desconocida;
      if (memory?.set) {
        try {
          memory.set("registered_clients", signature, displayName);
        } catch {}
      }
      return {
        id: matchedId,
        name: displayName,
        brand: "FLUXER",
        signature,
        capabilities: { tools: true, resources: false, prompts: false },
        responseMode: profile.maxResponseChars <= 10000 ? "tight" : "normal",
        ...profile,
      };
    }
  }

  // 4. Fallback estricto: "desconocida"
  const profile = PROFILES.desconocida;
  return {
    id: "desconocida",
    name: "desconocida",
    brand: "FLUXER",
    signature,
    capabilities: { tools: true, resources: false, prompts: false },
    responseMode: "tight",
    ...profile,
  };
}

