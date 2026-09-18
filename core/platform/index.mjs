export * as windows from "./windows.mjs";
export { assertWindows, killProcessTree, cleanCliXml, getWindowsHardwareSnapshot, buildUtf8PowerShellScript } from "./windows.mjs";
export const isWindows = process.platform === "win32";
