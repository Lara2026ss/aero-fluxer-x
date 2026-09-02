/**
 * 🪟 AERON FLUXER X — core/tool-contracts.mjs
 * Registro de Contratos Formales por Subherramienta.
 * Define requerimientos de entrada, mutaciones, políticas de caché y evidencias requeridas.
 */

const TOOL_CONTRACTS = new Map();

// Definiciones estándar de contratos para herramientas conocidas
const CONTRACT_DEFINITIONS = [
  // Terminal Domain
  { name: "run_command", domain: "terminal", mutation: true, async: false, requires: ["command"], produces: ["stdout", "stderr", "exitCode"], verification: ["processCompleted"], cachePolicy: "bypass", evidence: ["stdout", "exitCode"] },
  { name: "run_inline_script", domain: "terminal", mutation: true, async: false, requires: ["code"], produces: ["stdout", "stderr", "exitCode"], verification: ["processCompleted"], cachePolicy: "bypass", evidence: ["stdout", "exitCode"] },
  { name: "open_url", domain: "terminal", mutation: true, async: true, requires: ["url"], produces: ["url"], verification: ["processLaunched"], cachePolicy: "bypass", evidence: ["url"] },
  { name: "open_file_explorer", domain: "terminal", mutation: true, async: true, requires: ["path"], produces: ["opened"], verification: ["processLaunched"], cachePolicy: "bypass", evidence: ["opened"] },
  
  // Files Domain
  { name: "write_file", domain: "files", mutation: true, async: false, requires: ["path", "content"], produces: ["bytesWritten"], verification: ["fileExists", "contentMatches"], cachePolicy: "bypass", evidence: ["path", "size"] },
  { name: "write_text", domain: "files", mutation: true, async: false, requires: ["path", "content"], produces: ["bytesWritten"], verification: ["fileExists", "contentMatches"], cachePolicy: "bypass", evidence: ["path", "size"] },
  { name: "write_json", domain: "files", mutation: true, async: false, requires: ["path", "data"], produces: ["bytesWritten"], verification: ["fileExists", "jsonValid"], cachePolicy: "bypass", evidence: ["path", "size"] },
  { name: "delete_file", domain: "files", mutation: true, async: false, requires: ["path"], produces: ["deleted"], verification: ["fileNotExist"], cachePolicy: "bypass", evidence: ["path"] },
  { name: "create_directory", domain: "files", mutation: true, async: false, requires: ["path"], produces: ["created"], verification: ["dirExists"], cachePolicy: "bypass", evidence: ["path"] },
  { name: "read_file", domain: "files", mutation: false, async: false, requires: ["path"], produces: ["content"], verification: ["fileExists"], cachePolicy: "normal", evidence: ["path"] },
  
  // System Domain
  { name: "set_env_var", domain: "system", mutation: true, async: false, requires: ["name", "value"], produces: ["name", "scope"], verification: ["envVarMatches"], cachePolicy: "bypass", evidence: ["name", "value"] },
  { name: "remove_env_var", domain: "system", mutation: true, async: false, requires: ["name"], produces: ["name", "scope"], verification: ["envVarNotExist"], cachePolicy: "bypass", evidence: ["name"] },
  { name: "write_registry", domain: "system", mutation: true, async: false, requires: ["key", "name", "data"], produces: ["key", "name"], verification: ["registryMatches"], cachePolicy: "bypass", evidence: ["key", "name"] },
  { name: "get_system_snapshot", domain: "system", mutation: false, async: false, requires: [], produces: ["platform", "cpuModel", "memory"], verification: ["snapshotValid"], cachePolicy: "normal", evidence: ["cpuModel"] },
  
  // Shortcuts Domain
  { name: "create", domain: "shortcuts", mutation: true, async: false, requires: ["name", "steps"], produces: ["name", "storedAt"], verification: ["shortcutPersisted"], cachePolicy: "bypass", evidence: ["name", "storedAt"] },
  { name: "execute", domain: "shortcuts", mutation: true, async: true, requires: ["name"], produces: ["executedSteps", "results"], verification: ["stepsVerified"], cachePolicy: "bypass", evidence: ["executedSteps"] },
  { name: "delete", domain: "shortcuts", mutation: true, async: false, requires: ["name"], produces: ["deleted"], verification: ["shortcutDeleted"], cachePolicy: "bypass", evidence: ["name"] },

  // Database Domain
  { name: "execute_query", domain: "database", mutation: true, async: false, requires: ["query"], produces: ["rows", "changes"], verification: ["queryExecuted"], cachePolicy: "bypass", evidence: ["changes"] },
];

for (const c of CONTRACT_DEFINITIONS) {
  TOOL_CONTRACTS.set(`${c.domain}.${c.name}`, Object.freeze(c));
}

export function getToolContract(domain, action) {
  const key = `${domain}.${action}`;
  if (TOOL_CONTRACTS.has(key)) return TOOL_CONTRACTS.get(key);

  // Generar contrato dinámico por defecto si no está explícito
  const isMutating = ["write", "create", "delete", "remove", "set", "update", "run", "execute", "clear"].some(k => action.includes(k));
  return Object.freeze({
    name: action,
    domain,
    mutation: isMutating,
    async: false,
    requires: [],
    produces: [],
    verification: isMutating ? ["stateVerified"] : ["dataFetched"],
    cachePolicy: isMutating ? "bypass" : "normal",
    evidence: [],
  });
}

export function getAllContracts() {
  return Array.from(TOOL_CONTRACTS.values());
}
