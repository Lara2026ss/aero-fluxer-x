import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";

const runtime = await createRuntime({ root: ".", version: "9.0.0", brand: "Aeron Fluxer X" });
const registry = new Registry(runtime);
await registry.load();
const router = new Router({ runtime, registry });

let pass = 0; let fail = 0;
const check = (label, cond, detail = "") => { if (cond) { console.log(`  PASS: ${label}`); pass++; } else { console.error(`  FAIL: ${label} ${detail}`); fail++; } };

// 1. AntiLoop completely gone
check("antiLoop eliminado del runtime", runtime.antiLoop === undefined);

// 2. Shortcuts domain loads
const list = await router.execute({ tool: "shortcuts", action: "list", args: {} });
check("shortcuts:list funciona", list.ok !== false, JSON.stringify(list));
console.log(`       storedAt: ${list.storedAt}`);

// 3. Create shortcut with all new fields
const created = await router.execute({ tool: "shortcuts", action: "create", args: {
  name: "_test_shortcut_",
  description: "Test de verificacion",
  category: "tests",
  tags: ["verificacion"],
  steps: [{ tool: "system", action: "get_system_snapshot", args: {} }]
}});
check("shortcuts:create funciona con categoria y tags", created.ok && created.storedAt);

// 4. Execute shortcut
const exec = await router.execute({ tool: "shortcuts", action: "execute", args: { name: "_test_shortcut_" } });
check("shortcuts:execute funciona", exec.ok && exec.executedSteps === 1);

// 5. Inspect
const inspect = await router.execute({ tool: "shortcuts", action: "get", args: { name: "_test_shortcut_" } });
check("shortcuts:get devuelve detalles + historial", inspect.ok && inspect.history && inspect.history.length >= 1);

// 6. Rename
const renamed = await router.execute({ tool: "shortcuts", action: "rename", args: { name: "_test_shortcut_", newName: "_test_v2_" } });
check("shortcuts:rename funciona", renamed.ok && renamed.newName === "_test_v2_");

// 7. Update
const updated = await router.execute({ tool: "shortcuts", action: "update", args: { name: "_test_v2_", description: "Actualizado" } });
check("shortcuts:update funciona", updated.ok);

// 8. Delete
const del = await router.execute({ tool: "shortcuts", action: "delete", args: { name: "_test_v2_" } });
check("shortcuts:delete funciona", del.ok && del.deleted);

// 9. system new tools
const sysActs = registry.actionsFor("system");
check("system:get_env_vars presente", sysActs.includes("get_env_vars"));
check("system:get_disk_info presente", sysActs.includes("get_disk_info"));
check("system:get_battery_info presente", sysActs.includes("get_battery_info"));
check("system:read_registry presente", sysActs.includes("read_registry"));
check("system:write_registry presente", sysActs.includes("write_registry"));
check("system:list_scheduled_tasks presente", sysActs.includes("list_scheduled_tasks"));
check("system:get_defender_status presente", sysActs.includes("get_defender_status"));
check("system:set_env_var presente", sysActs.includes("set_env_var"));
check("system:remove_env_var presente", sysActs.includes("remove_env_var"));

// 10. terminal new tools
const termActs = registry.actionsFor("terminal");
check("terminal:open_url presente", termActs.includes("open_url"));
check("terminal:open_file_explorer presente", termActs.includes("open_file_explorer"));
check("terminal:run_as_admin presente", termActs.includes("run_as_admin"));

// 11. security no longer has anti_loop_status
const secActs = registry.actionsFor("security");
check("security:anti_loop_status eliminado", !secActs.includes("anti_loop_status"));

// 12. get_env_vars live
const envRes = await router.execute({ tool: "system", action: "get_env_vars", args: { filter: "PATH" } });
check("system:get_env_vars live (filtro PATH)", envRes.ok && envRes.vars);

// 13. get_disk_info live
const diskRes = await router.execute({ tool: "system", action: "get_disk_info", args: {} });
check("system:get_disk_info live", diskRes.ok);

// Summary
console.log(`\nResultado: ${fail === 0 ? "PASS" : "FAIL"} (${pass} pass, ${fail} fail)`);
console.log(`Total acciones system: ${sysActs.length}`);
console.log(`Total acciones terminal: ${termActs.length}`);
if (fail > 0) process.exit(1);
