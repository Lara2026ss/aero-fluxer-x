import { spawn } from "node:child_process";

async function testWithEnv(customEnv) {
  const wrapped = `
Write-Output "PATHEXT is: $env:PATHEXT"
try {
  node -v
} catch {
  Write-Output "node failed: $($_.Exception.Message)"
}
try {
  npm -v
} catch {
  Write-Output "npm failed: $($_.Exception.Message)"
}
`;
  const encoded = Buffer.from(wrapped, "utf16le").toString("base64");
  const psExe = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  return new Promise((resolve) => {
    const ps = spawn(psExe, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
      env: customEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = [], err = [];
    ps.stdout.on("data", d => out.push(d));
    ps.stderr.on("data", d => err.push(d));
    ps.on("close", (code) => {
      resolve({ code, out: Buffer.concat(out).toString("utf8"), err: Buffer.concat(err).toString("utf8") });
    });
  });
}

// Case A: Missing PATHEXT
const envWithoutPathext = {
  SystemRoot: process.env.SystemRoot || "C:\\Windows",
  PATH: "C:\\Windows\\System32;C:\\Windows\\System32\\WindowsPowerShell\\v1.0;C:\\Program Files\\nodejs",
  Path: "C:\\Windows\\System32;C:\\Windows\\System32\\WindowsPowerShell\\v1.0;C:\\Program Files\\nodejs",
};
console.log("=== CASE A: WITHOUT PATHEXT ===");
const resA = await testWithEnv(envWithoutPathext);
console.log("OUT A:\n", resA.out);
console.log("ERR A:\n", resA.err);

// Case B: With PATHEXT
const envWithPathext = {
  ...envWithoutPathext,
  PATHEXT: ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC;.CPL;.PS1",
  PathExt: ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC;.CPL;.PS1",
};
console.log("=== CASE B: WITH PATHEXT ===");
const resB = await testWithEnv(envWithPathext);
console.log("OUT B:\n", resB.out);
console.log("ERR B:\n", resB.err);
