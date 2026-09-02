// ══════════════════════════════════════════════════════════════════════════════
// 🧪 FLUXER MCP v6.5 — Suite de Verificación Masiva Completa
// Valida los 10 dominios MCP, plugin flonnet, router, nuevas herramientas y rendimiento
// ══════════════════════════════════════════════════════════════════════════════

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";
import { PluginLoader } from "../core/plugin-loader.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function runVerification() {
  console.log("=================================================================");
  console.log("🚀 FLUXER MCP v6.5 — SUITE DE VERIFICACIÓN MASIVA COMPLETA");
  console.log("=================================================================\n");

  const runtime = await createRuntime({ root: ROOT, version: "6.5.0", brand: "FLUXER" });
  const registry = new Registry(runtime);
  await registry.load();
  const router = new Router({ runtime, registry });

  // Cargar plugins
  const pluginLoader = new PluginLoader({
    pluginsDir: path.join(ROOT, "plugins"),
    runtime,
    registry,
  });
  const { loaded: pluginsLoaded } = await pluginLoader.loadAll();
  console.log(`🔌 Plugins cargados: ${pluginsLoaded.join(", ") || "ninguno"}`);

  let passed = 0;
  let failed = 0;

  async function test(name, tool, action, args = {}) {
    const start = performance.now();
    try {
      const res = await router.execute({ tool, action, args });
      const duration = Math.round(performance.now() - start);
      if (res && res.ok !== false) {
        console.log(`  ✓ [PASS] [${duration}ms] ${name} -> ${tool}.${action}`);
        passed++;
        return res;
      } else {
        console.error(`  ✗ [FAIL] [${duration}ms] ${name} -> ${tool}.${action}:`, res?.note || res?.error || res);
        failed++;
        return null;
      }
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      console.error(`  ✗ [ERROR] [${duration}ms] ${name} -> ${tool}.${action}:`, err.message);
      failed++;
      return null;
    }
  }

  console.log("\n--- 1. Dominio 'files' (Herramientas Core & Nuevas) ---");
  await test("Listar directorio raíz", "files", "list_directory", { path: "." });
  await test("Info de package.json", "files", "get_file_info", { path: "package.json" });
  await test("Leer package.json", "files", "read_text_file", { path: "package.json", maxLines: 15 });
  await test("Leer JSON estructurado", "files", "read_json", { path: "package.json", key: "name" });
  await test("Escribir JSON temporal", "files", "write_json", { path: "storage/test_temp.json", data: { fluxer: "v6.5", active: true } });
  await test("Calcular checksum SHA256", "files", "calculate_checksum", { path: "package.json", algorithm: "sha256" });
  await test("Diff de archivos", "files", "file_diff", { left: "package.json", right: "package.json" });
  await test("Búsqueda segura con comodín y caracteres", "files", "search_files", { path: "core", pattern: "*.mjs", limit: 10 });
  await test("Árbol de directorios", "files", "directory_tree", { path: "core", depth: 1 });

  console.log("\n--- 2. Dominio 'system' (Rendimiento Instantáneo & Nuevas Utilidades) ---");
  await test("Info de CPU instantánea", "system", "get_cpu_info");
  await test("Snapshot integral del sistema (<10ms)", "system", "get_system_snapshot");
  await test("Info de RAM", "system", "get_ram_info");
  await test("IP local", "system", "get_local_ip");
  await test("Variables de entorno (get_env)", "system", "get_env", { name: "PATH" });
  await test("Listar variables de entorno", "system", "list_env", { filter: "NODE" });
  await test("Notificación nativa", "system", "send_notification", { title: "FLUXER 6.5", message: "Verificación de suite masiva" });

  console.log("\n--- 3. Dominio 'terminal' (Comandos & Background Tasks) ---");
  await test("Ejecutar comando simple", "terminal", "run_command", { command: "node -v" });
  const bgRes = await test("Iniciar tarea background", "terminal", "run_background", { command: "node -e 'console.log(\"Hello from background\"); setTimeout(() => {}, 1000)'" });
  if (bgRes?.taskId) {
    await test("Listar tareas background", "terminal", "list_background_tasks");
    await test("Consultar logs de tarea background", "terminal", "get_background_output", { taskId: bgRes.taskId });
    await test("Detener tarea background", "terminal", "stop_background_task", { taskId: bgRes.taskId });
  }

  console.log("\n--- 4. Dominio 'security' (Criptografía, Hashes & UUID) ---");
  await test("Generar UUID v4", "security", "generate_uuid");
  await test("Generar token criptográfico", "security", "generate_token", { bytes: 16 });
  await test("Hash de texto directo", "security", "hash_text", { text: "Fluxer MCP 6.5" });
  const encRes = await test("Cifrado AES-256-GCM", "security", "encrypt_text", { text: "Mensaje Secreto Fluxer", secretKey: "clave-maestra-fluxer-segura" });
  if (encRes?.encrypted) {
    await test("Descifrado AES-256-GCM", "security", "decrypt_text", { encrypted: encRes.encrypted, secretKey: "clave-maestra-fluxer-segura" });
  }
  await test("Permisos activos", "security", "permissions_active");

  console.log("\n--- 5. Dominio 'database' (SQLite, Explain, Export & Import) ---");
  const testDb = "storage/test_verification.sqlite";
  await test("Crear base de datos SQLite", "database", "create_database", { database: testDb });
  await test("Crear tabla y registrar datos", "database", "execute_query", {
    database: testDb,
    query: "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, role TEXT); INSERT INTO users (name, role) VALUES ('Leo', 'Admin'), ('Aether', 'AI');",
  });
  await test("Consultar datos", "database", "execute_query", { database: testDb, query: "SELECT * FROM users;" });
  await test("Analizar base de datos (analyze_database)", "database", "analyze_database", { database: testDb });
  await test("Explicar plan de consulta (explain_query)", "database", "explain_query", { database: testDb, query: "SELECT * FROM users WHERE name='Leo'" });
  await test("Exportar tabla a JSON", "database", "export_table", { database: testDb, table: "users", format: "json" });

  console.log("\n--- 6. Dominio 'web' (Universal HTTP & Markdown) ---");
  await test("Verificar estado de URL (check_url_status)", "web", "check_url_status", { url: "https://httpbin.org/status/200" });
  await test("Búsqueda web", "web", "search_web", { query: "Node.js documentation" });

  console.log("\n--- 7. Dominio 'ai' & Plugin 'flonnet' ---");
  await test("Estado de Flonnet Aether", "ai", "status");
  await test("Contador de tokens estimado", "ai", "count_tokens", { text: "Fluxer MCP v6.5 es un sistema modular de herramientas." });
  await test("Consulta directa a Flonnet (ask)", "ai", "ask", { prompt: "Responde solo con 'OK'." });
  await test("Razonamiento analítico (think)", "ai", "think", { prompt: "Analiza el estado del sistema." });

  console.log("\n--- 8. Dominio 'shortcuts' (Macros & Variables Dinámicas) ---");
  await test("Crear shortcut con variables", "shortcuts", "create", {
    name: "test_suite_macro",
    description: "Macro de prueba",
    steps: [
      { tool: "system", action: "get_system_info" },
      { tool: "files", action: "get_file_info", args: { path: "package.json" } }
    ]
  });
  await test("Listar shortcuts", "shortcuts", "list");
  await test("Exportar shortcuts a JSON", "shortcuts", "export_shortcuts");
  await test("Ejecutar shortcut", "shortcuts", "execute", { name: "test_suite_macro" });

  console.log("\n=================================================================");
  console.log(`📊 RESULTADOS FINALES: ${passed} PASADOS | ${failed} FALLIDOS`);
  console.log("=================================================================\n");

  await runtime.shutdown();
  process.exitCode = failed > 0 ? 1 : 0;
}

runVerification().catch(console.error);
