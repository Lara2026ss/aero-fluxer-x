import { assertWindows } from "../core/platform/windows.mjs";
import { createRuntime } from "../core/runtime.mjs";

console.log("=== SUITE 1: SMOKE DE PLATAFORMA WINDOWS-ONLY ===");

// 1. Verificar que assertWindows no falla en Windows
let winPass = false;
try {
  assertWindows();
  winPass = true;
  console.log("  ✓ assertWindows() pasa exitosamente en win32");
} catch (e) {
  console.error("  ✗ Falló assertWindows() en win32:", e.message);
}

// 2. Simular rechazo en no-Windows (linux / darwin)
let nonWinRejected = false;
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
try {
  Object.defineProperty(process, "platform", { value: "linux" });
  try {
    assertWindows();
  } catch (err) {
    if (err.message.includes("EXCLUSIVAMENTE para Windows 10/11")) {
      nonWinRejected = true;
      console.log("  ✓ Plataforma no-Windows rechazada con mensaje claro y temprano:", err.message);
    }
  }
} finally {
  Object.defineProperty(process, "platform", originalPlatform);
}

// 3. Verificar arranque de Runtime en Windows
let runtimePass = false;
try {
  const runtime = await createRuntime({ root: ".", version: "9.0.0", brand: "Aeron Fluxer X" });
  if (runtime && runtime.env.PATH) {
    runtimePass = true;
    console.log("  ✓ Runtime inicializado correctamente con PATH saneado:", runtime.env.PATH.slice(0, 60) + "...");
  }
} catch (e) {
  console.error("  ✗ Error inicializando runtime:", e.message);
}

const allPassed = winPass && nonWinRejected && runtimePass;
console.log(`\nResultado Suite 1: ${allPassed ? "PASS (3/3)" : "FAIL"}`);
if (!allPassed) process.exit(1);
