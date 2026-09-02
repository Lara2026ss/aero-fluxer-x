import { spawn } from "node:child_process";

const scriptWithInputEncoding = `
try {
  [Console]::InputEncoding = [System.Text.Encoding]::UTF8
  Write-Output "InputEncoding Success"
} catch {
  Write-Output "InputEncoding Threw: $($_.Exception.Message)"
}
`;

const encoded = Buffer.from(scriptWithInputEncoding, "utf16le").toString("base64");
const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let out = [];
ps.stdout.on("data", d => out.push(d));
ps.on("close", () => {
  console.log("OUTPUT:", Buffer.concat(out).toString("utf8"));
});
