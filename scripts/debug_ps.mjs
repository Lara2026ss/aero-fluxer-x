import { spawn } from "node:child_process";

async function testPs(cmd, customEnv = null) {
  const wrapped = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
${cmd}
`;
  const encoded = Buffer.from(wrapped, "utf16le").toString("base64");
  const envToUse = customEnv || process.env;
  
  return new Promise((resolve) => {
    const ps = spawn("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-EncodedCommand", encoded
    ], {
      env: envToUse,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let out = [], err = [];
    ps.stdout.on("data", d => out.push(d));
    ps.stderr.on("data", d => err.push(d));
    ps.on("close", code => {
      console.log("=== CMD:", cmd, "===");
      console.log("EXIT CODE:", code);
      console.log("STDOUT RAW BYTES:", Buffer.concat(out).length);
      console.log("STDOUT TEXT:", JSON.stringify(Buffer.concat(out).toString("utf8")));
      console.log("STDERR TEXT:", JSON.stringify(Buffer.concat(err).toString("utf8")));
      resolve();
    });
  });
}

console.log("Testing with process.env:");
await testPs("node -v");
await testPs("& 'C:\\Program Files\\nodejs\\node.exe' -v");
await testPs("npm -v");
await testPs("Get-ChildItem non_existent_file_xyz");
