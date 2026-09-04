import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";

const runtime = await createRuntime({ root: process.cwd() });
const registry = new Registry(runtime);
await registry.load();
runtime._registry = registry;
const router = new Router({ runtime, registry });

const tests = [
  // 1. files
  { tool: "files", action: "list_directory", args: { path: "." } },
  { tool: "files", action: "file_exists", args: { path: "server.mjs" } },
  { tool: "files", action: "read_text_file", args: { path: "package.json", maxLines: 5 } },
  
  // 2. system
  { tool: "system", action: "get_system_snapshot" },
  { tool: "system", action: "get_cpu_info" },
  { tool: "system", action: "clean_ram" },
  { tool: "system", action: "analyze_memory" },
  { tool: "system", action: "analyze_memory_usage" },
  { tool: "system", action: "manage_disks" },

  // 3. terminal
  { tool: "terminal", action: "run_command", args: { command: "node -v" } },
  { tool: "terminal", action: "list_processes" },

  // 4. packages
  { tool: "packages", action: "list_installed_packages", args: {} },

  // 5. database
  { tool: "database", action: "list_tables", args: { database: ":memory:" } },

  // 6. security
  { tool: "security", action: "get_elevation_status" },
  { tool: "security", action: "grant_elevation", args: { durationMinutes: 1 } },
  { tool: "security", action: "revoke_elevation" },

  // 7. shortcuts
  { tool: "shortcuts", action: "list_shortcuts" },

  // 8. network
  { tool: "network", action: "test_connection", args: { host: "127.0.0.1", port: 80 } },

  // 9. diagnostics
  { tool: "diagnostics", action: "health_check" },

  // 10. developer
  { tool: "developer", action: "detect_project", args: { path: "." } },
  { tool: "developer", action: "list_skills" },
  { tool: "developer", action: "upd_check" },
  { tool: "developer", action: "upd_info" },
  { tool: "developer", action: "upd_data" },

  // 11. upd (unificado)
  { tool: "upd", action: "check" },
  { tool: "upd", action: "info" },
  { tool: "upd", action: "data" },
];

console.log(`Ejecutando batería de diagnóstico sobre ${tests.length} acciones...`);
let passed = 0;
let failed = 0;
const errors = [];

for (const t of tests) {
  try {
    const res = await router.execute(t);
    if (res && res.ok !== false) {
      console.log(`  ✓ [PASS] ${t.tool}.${t.action}`);
      passed++;
    } else {
      console.log(`  ✗ [FAIL] ${t.tool}.${t.action} ->`, res?.error || res?.message || res?.code);
      errors.push({ tool: t.tool, action: t.action, error: res?.error || res?.message || res?.code });
      failed++;
    }
  } catch (err) {
    console.log(`  💥 [EXCEPTION] ${t.tool}.${t.action} ->`, err.message);
    errors.push({ tool: t.tool, action: t.action, error: err.message });
    failed++;
  }
}

console.log("\n==============================");
console.log(`DIAGNÓSTICO COMPLETO: ${passed} PASARON, ${failed} FALLARON`);
console.log("==============================");
if (errors.length > 0) {
  console.log("ERRORES DETECTADOS:", JSON.stringify(errors, null, 2));
}
