import assert from "node:assert";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";

async function runTests() {
  console.log("🧪 Iniciando validación de hotfix para pruebas de Claude Desktop (v11.0.9)...");

  const root = path.resolve(".");
  const runtime = await createRuntime({ root });
  const registry = new Registry(runtime);
  await registry.load();
  const router = new Router({ runtime, registry });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: diagnostics.test y diagnostics.mcp_test (Bug de ruteo resuelto)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST 1] Verificando ruteo de diagnostics.test y mcp_test...");
  const testRes = await router.execute("diagnostics", "test", {});
  assert.equal(testRes.ok, true, "diagnostics.test debe resolver y retornar ok: true");
  assert.equal(testRes.action, "test", "Acción debe ser 'test'");
  console.log("  ✓ diagnostics.test resolvió exitosamente:", testRes.summary || "OK");

  const mcpTestRes = await router.execute("diagnostics", "mcp_test", {});
  assert.equal(mcpTestRes.ok, true, "diagnostics.mcp_test debe resolver y retornar ok: true");
  console.log("  ✓ diagnostics.mcp_test resolvió exitosamente:", mcpTestRes.summary || "OK");

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: files.list_directory en ~/Desktop con OneDrive Known Folder Redirection
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST 2] Verificando resolución de Desktop con redirección de OneDrive...");
  const resolvedDesktop = runtime.hp("~/Desktop");
  console.log("  → runtime.hp('~/Desktop') resolvió a:", resolvedDesktop);
  
  // Debe existir físicamente en disco (evita ENOENT)
  const exists = await fs.access(resolvedDesktop).then(() => true).catch(() => false);
  assert.equal(exists, true, `La ruta resuelta '${resolvedDesktop}' debe existir físicamente en disco`);

  // Probar ejecución a través del router de files
  const listRes = await router.execute("files", "list_directory", { path: "~/Desktop" });
  assert.equal(listRes.ok, true, `files.list_directory en ~/Desktop falló: ${listRes.error}`);
  const entries = listRes.entries || listRes.data?.entries;
  assert(Array.isArray(entries), "entries debe ser un array");
  console.log(`  ✓ files.list_directory en ~/Desktop exitoso: ${entries.length} entradas encontradas (sin ENOENT)`);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: guide.search con relevancia semántica precisa
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST 3] Verificando relevancia semántica en guide.search...");
  const searchTerminal = await router.execute("guide", "search", { query: "terminal" });
  assert.equal(searchTerminal.ok, true);
  const resultsT = searchTerminal.results || searchTerminal.data?.results;
  const topResult = resultsT?.[0];
  assert.equal(topResult?.tool_name, "terminal", "El resultado principal para 'terminal' debe apuntar al dominio terminal");
  assert.equal(topResult?.relevance, "HIGH", "La relevancia debe ser HIGH");
  console.log("  ✓ guide.search('terminal') retornó como #1:", topResult.tool_name, `[${topResult.relevance}] -`, topResult.summary);

  const searchSqlite = await router.execute("guide", "search", { query: "sqlite" });
  const resultsS = searchSqlite.results || searchSqlite.data?.results;
  assert.equal(resultsS?.[0]?.tool_name, "database", "Búsqueda de 'sqlite' debe apuntar a database");
  console.log("  ✓ guide.search('sqlite') retornó:", resultsS?.[0]?.tool_name);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Refinamiento de Memoria en diagnostics.health_check
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST 4] Verificando diagnóstico de memoria RAM...");
  const healthRes = await router.execute("diagnostics", "health_check", {});
  assert.equal(healthRes.ok, true);
  const checks = healthRes.diagnostics?.checks || healthRes.data?.diagnostics?.checks;
  const memCheck = checks?.find(c => c.name === "Memory Pressure");
  assert(memCheck, "El check de Memory Pressure debe existir");
  console.log("  ✓ Check de Memoria:", memCheck.name, "-> Status:", memCheck.status, "| Valor:", memCheck.value);

  console.log("\n🎉 TODOS LOS CASOS DE PRUEBA DE CLAUDE DESKTOP PASARON EXITOSAMENTE (4/4)!");
}

runTests().catch(err => {
  console.error("❌ Fallo en las pruebas:", err);
  process.exit(1);
});
