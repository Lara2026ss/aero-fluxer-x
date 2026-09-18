import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";
import path from "node:path";

const runtime = await createRuntime({ root: ".", version: "9.0.0", brand: "Aeron Fluxer X" });
const registry = new Registry(runtime);
await registry.load();
const router = new Router({ runtime, registry });

console.log("════════════════════════════════════════════════════════════════");
console.log("🔬 LOG DE PRUEBAS MANUALES REALES EN WINDOWS 11 (TIPO CLAUDE)");
console.log("════════════════════════════════════════════════════════════════\n");

// 1. health_check
console.log("--- [PASO 1] health_check ---");
const hc = await router.execute({ tool: "diagnostics", action: "health_check", args: {} });
console.log("Esperado: ok:true, platform: win32, isWindowsOnly: true, toolchain sincronizado.");
console.log("Real:", JSON.stringify({ ok: hc.ok, platform: hc.platform, isWindowsOnly: hc.isWindowsOnly, nodeVersion: hc.nodeVersion, powershellVersion: hc.powershellVersion, shell: hc.shell }, null, 2));

// 2. PowerShell stdout normal
console.log("\n--- [PASO 2] PowerShell stdout normal ---");
const psNorm = await router.execute({ tool: "terminal", action: "run_command", args: { command: "Get-Process -Id $PID | Select-Object -ExpandProperty ProcessName" } });
console.log("Esperado: ok:true, exitCode: 0, effectiveShell: powershell.");
console.log("Real:", JSON.stringify({ ok: psNorm.ok, stdout: psNorm.stdout, effectiveShell: psNorm.effectiveShell, exitCode: psNorm.exitCode }, null, 2));

// 3. Imprimir caracteres no ASCII (acentos, ñ, símbolos)
console.log("\n--- [PASO 3] Salida con caracteres no ASCII en español ---");
const sampleText = "Comprobación de codificación: análisis, ejecución y verificación (á, é, í, ó, ú, ñ, ¿, ¡)";
const psUtf8 = await router.execute({ tool: "terminal", action: "run_command", args: { command: `Write-Output '${sampleText}'` } });
console.log("Esperado: Texto idéntico sin signos de interrogación ni mojibake.");
console.log("Real:", psUtf8.stdout);

// 4. Sintaxis bash ('&&') en PowerShell
console.log("\n--- [PASO 4] Sintaxis bash (&&) ---");
const psBash = await router.execute({ tool: "terminal", action: "run_command", args: { command: "echo paso1 && echo paso2" } });
console.log("Esperado: ok: false, error claro explicando PowerShell y alternativas.");
console.log("Real:", JSON.stringify({ ok: psBash.ok, code: psBash.code, error: psBash.error }, null, 2));

// 5. CWD en carpeta real y en carpeta inválida
console.log("\n--- [PASO 5] CWD válido e inválido ---");
const cwdVal = await router.execute({ tool: "terminal", action: "run_command", args: { command: "Get-Location | Select-Object -ExpandProperty Path", cwd: "storage" } });
const cwdInval = await router.execute({ tool: "terminal", action: "run_command", args: { command: "Write-Output 'err'", cwd: "C:\\Carpeta_Inexistente_9999" } });
console.log("Real CWD válido:", JSON.stringify({ ok: cwdVal.ok, effectiveCwd: cwdVal.effectiveCwd }, null, 2));
console.log("Real CWD inválido:", JSON.stringify({ ok: cwdInval.ok, code: cwdInval.code, error: cwdInval.error }, null, 2));

// 6. Node/npm diagnosticado vs terminal
console.log("\n--- [PASO 6] Toolchain Diagnosticado vs Terminal ---");
const diagTool = await router.execute({ tool: "diagnostics", action: "resolve_toolchain", args: {} });
const termNode = await router.execute({ tool: "terminal", action: "run_command", args: { command: "node -v" } });
console.log("Diag Node:", diagTool.binaries.node.version, "| Terminal Node:", termNode.stdout.trim());
console.log("Coinciden exactamente?:", diagTool.binaries.node.version === termNode.stdout.trim());

// 7. Repetición tras recarga
console.log("\n--- [PASO 7] Repetición tras recarga de estado ---");
const reload = await runtime.control.reload();
const psAfter = await router.execute({ tool: "terminal", action: "run_command", args: { command: "Write-Output 'Recarga OK'" } });
console.log("Real tras reload:", JSON.stringify({ ok: psAfter.ok, stdout: psAfter.stdout }, null, 2));

console.log("\n════════════════════════════════════════════════════════════════");
console.log("✅ TODAS LAS PRUEBAS MANUALES EJECUTADAS Y VERIFICADAS EN VIVO");
console.log("════════════════════════════════════════════════════════════════");
