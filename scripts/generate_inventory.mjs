import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import fs from "node:fs/promises";
import path from "node:path";

console.log("==================================================================");
console.log("🔍 FASE 1: INVENTARIO AUTOMÁTICO DE HERRAMIENTAS (AERON FLUXER X v9.0)");
console.log("==================================================================\n");

const runtime = await createRuntime({ root: ".", version: "9.0.0", brand: "Aeron Fluxer X" });
const registry = new Registry(runtime);
await registry.load();

const inventory = [];
const domainSummary = {};

const domainNames = registry.moduleNames();

// Categorías de riesgo basadas en el nombre del dominio y acción
function classifyRisk(domain, action, permLevel) {
  if (permLevel === "admin") return "PRIVILEGED";
  if (["kill_process", "kill_process_tree", "run_as_admin", "write_registry", "remove_env_var", "clear_all"].includes(action)) return "HIGH";
  if (["delete", "remove", "write_file", "delete_file", "delete_directory", "move_file", "copy_file", "set_env_var", "set_power_profile"].includes(action)) return "MEDIUM";
  if (["run_command", "run_script", "run_inline_script"].includes(action)) return "MEDIUM";
  if (["list", "get", "read", "check", "info", "status", "search", "hash", "encrypt", "decrypt"].some(k => action.includes(k))) return "SAFE";
  return "LOW";
}

for (const domainName of domainNames) {
  const actions = registry.actionsFor(domainName);
  const signatures = registry.actionSignatures(domainName);
  domainSummary[domainName] = actions.length;

  for (const actionName of actions) {
    const resolved = registry.resolve(domainName, actionName);
    const signature = signatures[actionName] || "{}";
    const permLevel = resolved?.unit?.permissions?.[actionName] || "user";
    const risk = classifyRisk(domainName, actionName, permLevel);

    inventory.push({
      domain: domainName,
      action: actionName,
      tool: `${domainName}.${actionName}`,
      signature,
      permissionLevel: permLevel,
      risk,
      description: resolved?.unit?.description || `${domainName} domain action`,
    });
  }
}

const inventoryPath = path.join("reports", "inventory.json");
await fs.writeFile(inventoryPath, JSON.stringify({
  version: "9.0.0",
  generatedAt: new Date().toISOString(),
  totalActions: inventory.length,
  domainSummary,
  inventory
}, null, 2), "utf8");

console.log(`✅ Inventario generado exitosamente con ${inventory.length} acciones registradas.`);
console.log("\n── Resumen por Dominio ──");
let totalCheck = 0;
for (const [dom, count] of Object.entries(domainSummary)) {
  console.log(`  • Domain [${dom.padEnd(12)}]: ${count} acciones`);
  totalCheck += count;
}
console.log(`\nTOTAL ACCIONES REGISTRADAS: ${totalCheck}`);
console.log(`Archivo guardado en: ${inventoryPath}`);
