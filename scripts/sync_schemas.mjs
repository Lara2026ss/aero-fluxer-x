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
const AGY_MCP_DIR_FLUXER = path.join(os.homedir(), ".gemini", "antigravity", "mcp", "fluxer");
const AGY_MCP_DIR_AERON = path.join(os.homedir(), ".gemini", "antigravity", "mcp", "Aeron_Fluxer_X");

async function sync() {
  console.log(`=== Sincronizando esquemas de Fluxer MCP v${CURRENT_VERSION} ===`);
  await fs.mkdir(SCHEMAS_DIR, { recursive: true });
  await fs.mkdir(CONTRACTS_DIR, { recursive: true });
  await fs.mkdir(AGY_MCP_DIR_FLUXER, { recursive: true }).catch(() => {});
  await fs.mkdir(AGY_MCP_DIR_AERON, { recursive: true }).catch(() => {});

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
      parameters: {
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
      },
    };

    toolsContract.push(toolDef);

    // Guardar en config/mcp-schemas/<name>.json
    const schemaFile = path.join(SCHEMAS_DIR, `${name}.json`);
    await fs.writeFile(schemaFile, JSON.stringify(toolDef, null, 2), "utf8");

    // Guardar en ambos directorios de Antigravity MCP
    for (const agyDir of [AGY_MCP_DIR_FLUXER, AGY_MCP_DIR_AERON]) {
      try {
        const agyFile = path.join(agyDir, `${name}.json`);
        await fs.writeFile(agyFile, JSON.stringify(toolDef, null, 2), "utf8");
      } catch {}
    }

    console.log(`✓ Sincronizado dominio: ${name} (${actions.length} acciones)`);
  }

  // Sincronizar herramienta 'upd'
  const updToolDef = {
    name: "upd",
    description: "Centro unificado de actualización de Fluxer X. Ejecuta subherramientas mediante 'action': 'check', 'info', 'apply', 'status'.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["check", "info", "apply", "update", "data", "status"],
          description: "Subherramienta de actualización",
        },
        version: { type: "string" },
        force: { type: "boolean" },
        args: { type: "object" }
      },
      required: ["action"],
    }
  };
  toolsContract.push(updToolDef);
  for (const agyDir of [AGY_MCP_DIR_FLUXER, AGY_MCP_DIR_AERON, SCHEMAS_DIR]) {
    try {
      await fs.writeFile(path.join(agyDir, "upd.json"), JSON.stringify(updToolDef, null, 2), "utf8");
    } catch {}
  }

  // Guardar contrato maestro
  const contractFile = path.join(CONTRACTS_DIR, "fluxer_mcp_tools.json");
  await fs.writeFile(contractFile, JSON.stringify({ version: CURRENT_VERSION, tools: toolsContract }, null, 2), "utf8");
  console.log(`✓ Contrato maestro guardado: ${contractFile}`);

  await runtime.shutdown();
  console.log("=== Sincronización completada con éxito ===");
}

sync().catch(console.error);
