// ══════════════════════════════════════════════════════════════════════════════
// 🔄 FLUXER MCP — Schema & Contract Synchronizer
// Sincroniza esquemas JSON entre config/mcp-schemas, contracts/ y Antigravity MCP
// ══════════════════════════════════════════════════════════════════════════════

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { CURRENT_VERSION, BRAND_NAME } from "../core/version.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCHEMAS_DIR = path.join(ROOT, "config", "mcp-schemas");
const CONTRACTS_DIR = path.join(ROOT, "contracts");
const AGY_MCP_DIRS = [
  process.env.ANTIGRAVITY_MCP_DIR,
  path.join(os.homedir(), ".gemini", "antigravity", "mcp", "Aeron_Fluxer_X"),
  path.join(os.homedir(), ".gemini", "antigravity", "mcp", "fluxer"),
].filter(Boolean);

async function sync() {
  console.log("=== Sincronizando esquemas de Fluxer MCP ===");
  await fs.mkdir(SCHEMAS_DIR, { recursive: true });
  await fs.mkdir(CONTRACTS_DIR, { recursive: true });

  const runtime = await createRuntime({ root: ROOT, version: CURRENT_VERSION, brand: BRAND_NAME });
  const registry = new Registry(runtime);
  await registry.load();

  const modules = registry.moduleNames();
  const toolsContract = [];

  for (const name of modules) {
    const actions = registry.actionsFor(name);
    const signatures = registry.actionSignatures(name);
    const modDesc = registry.snapshot().modules.find((m) => m.name === name)?.description || `FLUXER ${name} domain router`;

    const actionsCheatSheet = actions
      .map((action) => `${action}${signatures[action] ? " " + signatures[action] : ""}`)
      .join(" | ");

    const toolDef = {
      name,
      description: `${modDesc}\nAcciones y argumentos (usar en args): ${actionsCheatSheet}`,
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: actions,
            description: `Acción a ejecutar en el dominio ${name}`,
          },
          args: {
            type: "object",
            description: "Argumentos específicos de la acción",
          },
        },
        required: ["action"],
        additionalProperties: false,
      },
    };

    toolsContract.push(toolDef);

    // Guardar en config/mcp-schemas/<name>.json
    const schemaFile = path.join(SCHEMAS_DIR, `${name}.json`);
    await fs.writeFile(schemaFile, JSON.stringify(toolDef, null, 2), "utf8");

    // Guardar en Antigravity MCP directories si existen
    for (const agyDir of AGY_MCP_DIRS) {
      try {
        await fs.mkdir(agyDir, { recursive: true });
        const agyFile = path.join(agyDir, `${name}.json`);
        await fs.writeFile(agyFile, JSON.stringify(toolDef, null, 2), "utf8");
      } catch {}
    }

    console.log(`✓ Sincronizado dominio: ${name} (${actions.length} acciones)`);
  }

  // Guardar contrato maestro
  const contractFile = path.join(CONTRACTS_DIR, "fluxer_mcp_tools.json");
  await fs.writeFile(contractFile, JSON.stringify({ version: CURRENT_VERSION, tools: toolsContract }, null, 2), "utf8");
  console.log(`✓ Contrato maestro guardado: ${contractFile}`);

  await runtime.shutdown();
  console.log("=== Sincronización completada con éxito ===");
}

sync().catch(console.error);
