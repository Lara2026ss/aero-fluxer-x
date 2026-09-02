import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";

const runtime = await createRuntime({ root: ".", version: "9.0.0", brand: "Aeron Fluxer X" });
const registry = new Registry(runtime);
await registry.load();
const router = new Router({ runtime, registry });

let pass = 0; let fail = 0;
const check = (label, cond, detail) => {
  if (cond) { console.log(`  PASS: ${label}`); pass++; }
  else { console.error(`  FAIL: ${label}`, detail || ""); fail++; }
};

console.log("=== BUG #1 - set_env_var / remove_env_var scope:process ===");

const set1 = await router.execute({ tool: "system", action: "set_env_var", args: { name: "AERON_TEST_VAR", value: "hello_fluxer", scope: "process" } });
check("set_env_var process ok", set1.ok, JSON.stringify(set1));
check("set_env_var tiene nota explicativa", Boolean(set1.note));

const get1 = await router.execute({ tool: "system", action: "get_env_vars", args: { filter: "AERON_TEST_VAR" } });
const found = get1.vars && get1.vars["AERON_TEST_VAR"] === "hello_fluxer";
check("get_env_vars lee variable recien seteada", found, JSON.stringify(get1.vars));

const del1 = await router.execute({ tool: "system", action: "remove_env_var", args: { name: "AERON_TEST_VAR", scope: "process" } });
check("remove_env_var process ok y existed=true", del1.ok && del1.existed === true, JSON.stringify(del1));

const get2 = await router.execute({ tool: "system", action: "get_env_vars", args: { filter: "AERON_TEST_VAR" } });
const gone = !get2.vars || !get2.vars["AERON_TEST_VAR"];
check("variable eliminada correctamente", gone, JSON.stringify(get2.vars));

console.log("\n=== BUG #2 - list_scheduled_tasks filtro sin coincidencias ===");

const noMatch = await router.execute({ tool: "system", action: "list_scheduled_tasks", args: { filter: "ZZZZZ_IMPOSIBLE_XYZ_NEVER" } });
check("filtro sin coincidencias devuelve count:0, tasks:[]", noMatch.ok && noMatch.count === 0 && Array.isArray(noMatch.tasks), JSON.stringify(noMatch));
check("filtro sin coincidencias NO tiene raw", !("raw" in noMatch), JSON.stringify(noMatch));

const withMatch = await router.execute({ tool: "system", action: "list_scheduled_tasks", args: { filter: "OneDrive" } });
check("filtro con coincidencias devuelve count>0 y tasks[]", withMatch.ok && withMatch.count > 0 && Array.isArray(withMatch.tasks), JSON.stringify({ count: withMatch.count }));

console.log("\n=== BUG #3 - read_registry normalizacion de hive ===");

const r1 = await router.execute({ tool: "system", action: "read_registry", args: { key: "HKCU\\Control Panel\\Desktop" } });
check("HKCU\\ (sin :) normaliza y lee ok", r1.ok && r1.key && r1.key.includes("HKCU:\\"), JSON.stringify({ ok: r1.ok, key: r1.key, error: r1.error }));

const r2 = await router.execute({ tool: "system", action: "read_registry", args: { key: "HKCU:\\Control Panel\\Desktop" } });
check("HKCU:\\ (con :) sigue funcionando", r2.ok && r2.key, JSON.stringify({ ok: r2.ok, key: r2.key }));

check("Ambos formatos producen la misma clave normalizada", r1.key === r2.key, `r1: ${r1.key} / r2: ${r2.key}`);

const r3 = await router.execute({ tool: "system", action: "read_registry", args: { key: "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", value: "ProductName" } });
check("HKLM\\ normaliza y lee ProductName", r3.ok && r3.data, JSON.stringify({ ok: r3.ok, data: r3.data?.substring(0, 50) }));

console.log(`\nResultado: ${fail === 0 ? "PASS" : "FAIL"} (${pass} pass, ${fail} fail)`);
if (fail > 0) process.exit(1);
