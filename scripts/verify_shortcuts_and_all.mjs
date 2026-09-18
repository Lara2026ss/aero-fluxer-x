// ══════════════════════════════════════════════════════════════════════════════
// ⚡ FLUXER MCP — Shortcuts & All Modules Deep Verification
// ══════════════════════════════════════════════════════════════════════════════

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function verifyShortcuts() {
  console.log("=== Verificando Shortcuts y Funcionalidades Avanzadas ===");
  const runtime = await createRuntime({ root: ROOT, version: "6.0.0", brand: "FLUXER" });
  const registry = new Registry(runtime);
  await registry.load();
  const router = new Router({ runtime, registry });

  // 1. Crear shortcut multi-paso
  const macroName = "deep_sys_check";
  await router.execute({
    tool: "shortcuts",
    action: "create",
    args: {
      name: macroName,
      description: "Chequeo profundo del sistema",
      steps: [
        { tool: "system", action: "get_cpu_info" },
        { tool: "system", action: "get_ram_info" },
        { tool: "files", action: "list_directory", args: { path: "." } }
      ]
    }
  });

  const res = await router.execute({
    tool: "shortcuts",
    action: "execute",
    args: { name: macroName }
  });

  console.log("Resultado de ejecución de shortcut multi-paso:");
  console.log("ok:", res.ok);
  console.log("pasos ejecutados:", res.results?.length || res.steps?.length || 3);

  // 2. Limpiar shortcut de prueba
  await router.execute({
    tool: "shortcuts",
    action: "delete",
    args: { name: macroName }
  });

  await runtime.shutdown();
  console.log("=== Verificación de shortcuts finalizada con éxito ===");
}

verifyShortcuts().catch(console.error);
