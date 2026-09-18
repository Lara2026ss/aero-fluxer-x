import { spawn } from "node:child_process";
import readline from "node:readline";
import os from "node:os";
import path from "node:path";

console.log("════════════════════════════════════════════════════════════════");
console.log("🤖 SIMULACIÓN REAL DE CLIENTE MCP CLAUDE DESKTOP SOBRE STDIO");
console.log("════════════════════════════════════════════════════════════════\n");

// Minimal stripped environment (simulating Claude Desktop launched without shell variables)
const home = os.homedir();
const minimalEnv = {
  SystemRoot: process.env.SystemRoot || (process.platform === "win32" ? "C:\\Windows" : "/"),
  TEMP: process.env.TEMP || os.tmpdir(),
  TMP: process.env.TMP || os.tmpdir(),
  USERPROFILE: process.env.USERPROFILE || home,
  APPDATA: process.env.APPDATA || path.join(home, "AppData", "Roaming"),
  LOCALAPPDATA: process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"),
  PATH: process.platform === "win32" ? "C:\\Windows\\System32;C:\\Windows" : "/usr/bin:/bin",
};

const serverProcess = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: minimalEnv,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});

let messageId = 1;
const pending = new Map();

const rl = readline.createInterface({ input: serverProcess.stdout });
rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const json = JSON.parse(line);
    if (json.id && pending.has(json.id)) {
      const { resolve } = pending.get(json.id);
      pending.delete(json.id);
      resolve(json);
    }
  } catch (e) {
    console.error("Non-JSON stdout:", line);
  }
});

serverProcess.stderr.on("data", (d) => {
  // stderr logs
});

function sendRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = messageId++;
    pending.set(id, { resolve, reject });
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    serverProcess.stdin.write(payload);
  });
}

// 1. Initialize
const initRes = await sendRequest("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "claude-desktop-simulator", version: "1.0.0" }
});
console.log("1. Initialize response:", initRes.result ? "SUCCESS" : initRes);

// 2. Call terminal:run_command -> node -v
const nodeShortRes = await sendRequest("tools/call", {
  name: "terminal",
  arguments: {
    action: "run_command",
    args: { command: "node -v" }
  }
});
const nodeShortData = JSON.parse(nodeShortRes.result.content[0].text);
console.log("\n2. terminal:run_command (node -v por nombre corto):");
console.log("   ok:", nodeShortData.ok);
console.log("   stdout:", JSON.stringify(nodeShortData.stdout));
console.log("   exitCode:", nodeShortData.exitCode);
console.log("   error:", nodeShortData.error);

// 3. Call terminal:run_command -> & "C:\Program Files\nodejs\node.exe" -v
const nodeAbsRes = await sendRequest("tools/call", {
  name: "terminal",
  arguments: {
    action: "run_command",
    args: { command: '& "C:\\Program Files\\nodejs\\node.exe" -v' }
  }
});
const nodeAbsData = JSON.parse(nodeAbsRes.result.content[0].text);
console.log("\n3. terminal:run_command (& 'C:\\Program Files\\nodejs\\node.exe' -v por ruta absoluta):");
console.log("   ok:", nodeAbsData.ok);
console.log("   stdout:", JSON.stringify(nodeAbsData.stdout));
console.log("   exitCode:", nodeAbsData.exitCode);

// 4. Call packages:check_manager -> npm
const npmCheckRes = await sendRequest("tools/call", {
  name: "packages",
  arguments: {
    action: "check_manager",
    args: { manager: "npm" }
  }
});
const npmCheckData = JSON.parse(npmCheckRes.result.content[0].text);
console.log("\n4. packages:check_manager (npm):");
console.log("   ok:", npmCheckData.ok);
console.log("   available:", npmCheckData.available);
console.log("   version:", npmCheckData.version);

// 5. Call terminal:run_command -> bash syntax
const bashRes = await sendRequest("tools/call", {
  name: "terminal",
  arguments: {
    action: "run_command",
    args: { command: "echo paso1 && echo paso2" }
  }
});
const bashData = JSON.parse(bashRes.result.content[0].text);
console.log("\n5. terminal:run_command (sintaxis bash &&):");
console.log("   ok:", bashData.ok);
console.log("   code:", bashData.code);
console.log("   error:", bashData.error);

// 6. Call terminal:run_command -> spanish stderr
const errRes = await sendRequest("tools/call", {
  name: "terminal",
  arguments: {
    action: "run_command",
    args: { command: "Get-Process non_existent_proc_xyz" }
  }
});
const errData = JSON.parse(errRes.result.content[0].text);
console.log("\n6. terminal:run_command (stderr en español sin mojibake):");
console.log("   ok:", errData.ok);
console.log("   stderr:\n", errData.stderr);

serverProcess.kill();
process.exit(0);
