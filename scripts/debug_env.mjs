import { spawn } from "node:child_process";

console.log("Keys in process.env matching /path/i:");
for (const k of Object.keys(process.env)) {
  if (/^path$/i.test(k)) {
    console.log(`Key: "${k}" -> length: ${process.env[k].length}`);
  }
}

// Test with dual keys
const brokenEnv = {
  ...process.env,
  Path: "C:\\Windows\\System32", // old/incomplete
  PATH: "C:\\Windows\\System32;C:\\Program Files\\nodejs", // what we set
};

const wrapped = `
Write-Output "PowerShell env:Path is: $env:Path"
Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
`;
const encoded = Buffer.from(wrapped, "utf16le").toString("base64");

const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
  env: brokenEnv,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"]
});

let out = [];
ps.stdout.on("data", d => out.push(d));
ps.on("close", () => {
  console.log("\nPowerShell output when both Path and PATH exist in env object:");
  console.log(Buffer.concat(out).toString("utf8"));
});
