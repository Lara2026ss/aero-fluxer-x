/**
 * AERON FLUXER X - tools/shortcuts.mjs
 * Motor universal de macros / atajos multi-paso optimizado para IA con:
 * - Intercambio dinámico de variables entre pasos (captureAs, pipeTo)
 * - Ejecución condicional (when / condition)
 * - Reintentos por paso (retries)
 * - Modo simulación (dryRun)
 * - Plantillas predefinidas (templates)
 * - Persistencia local (USERPROFILE)
 */
import fsSync from "node:fs";
import nodePath from "node:path";
import os from "node:os";
import { getStorageStructure } from "../core/storage-paths.mjs";

function getLocalShortcutsFile(runtime) {
  if (runtime?.dirs?.shortcuts) {
    return nodePath.join(runtime.dirs.shortcuts, "shortcuts.json");
  }
  const storage = getStorageStructure(runtime?.dirs?.root);
  return storage.shortcutsFile;
}

export function createShortcutsDomain({ runtime, path, fs, domain }) {
  if (!runtime._shortcuts) runtime._shortcuts = new Map();
  if (!runtime._shortcutHistory) runtime._shortcutHistory = new Map();

  const shortcutsFile = getLocalShortcutsFile(runtime);

  const BUILTIN_TEMPLATES = {
    system_health_audit: {
      description: "Diagnóstico completo de salud: memoria, procesos críticos y estado de seguridad.",
      category: "diagnostics",
      tags: ["system", "audit", "health"],
      steps: [
        { tool: "system", action: "get_resource_usage", captureAs: "resUsage" },
        { tool: "system", action: "get_performance_summary", captureAs: "perf" },
        { tool: "security", action: "get_security_mode", captureAs: "secMode" },
      ],
    },
    web_research_pack: {
      description: "Investigación web profunda con búsqueda, Wikipedia y resumen.",
      category: "web",
      tags: ["research", "web", "wikipedia"],
      steps: [
        { tool: "web", action: "search", query: "{{topic}}", limit: 3, captureAs: "searchResults" },
        { tool: "web", action: "wikipedia", query: "{{topic}}", captureAs: "wikiSummary" },
      ],
    },
    clean_and_repair: {
      description: "Limpieza segura de temporales y verificación del sistema.",
      category: "maintenance",
      tags: ["clean", "maintenance"],
      steps: [
        { tool: "system", action: "clean_ram" },
        { tool: "security", action: "health" },
      ],
    },
  };

  async function persist() {
    const data = {};
    for (const [name, s] of runtime._shortcuts.entries()) data[name] = s;
    try {
      const dir = nodePath.dirname(shortcutsFile);
      if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true });
      const tmpFile = `${shortcutsFile}.tmp`;
      await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), "utf8");
      await fs.rename(tmpFile, shortcutsFile);
    } catch {}
  }

  async function loadFromDisk() {
    try {
      if (!fsSync.existsSync(shortcutsFile)) return;
      const raw = await fs.readFile(shortcutsFile, "utf8");
      const parsed = JSON.parse(raw);
      const now = new Date().toISOString();
      for (const [k, v] of Object.entries(parsed)) {
        if (v && Array.isArray(v.steps)) {
          runtime._shortcuts.set(k, {
            description: v.description || "",
            category: v.category || "general",
            steps: v.steps,
            tags: Array.isArray(v.tags) ? v.tags : [],
            createdAt: v.createdAt || now,
            updatedAt: v.updatedAt || now,
          });
        }
      }
    } catch {}
  }

  loadFromDisk();

  function getNestedValue(obj, dotPath) {
    if (!obj || !dotPath) return undefined;
    const parts = String(dotPath).split(".");
    let curr = obj;
    for (const p of parts) {
      if (curr === null || curr === undefined) return undefined;
      curr = curr[p];
    }
    return curr;
  }

  function interpolate(val, vars) {
    if (typeof val === "string") {
      // Soporta {{key}} y ${key}
      return val
        .replace(/\{\{([\w.]+)\}\}/g, (_, k) => {
          const v = getNestedValue(vars, k) ?? vars[k];
          return v !== undefined ? String(v) : `{{${k}}}`;
        })
        .replace(/\$\{([\w.]+)\}/g, (_, k) => {
          const v = getNestedValue(vars, k) ?? vars[k];
          return v !== undefined ? String(v) : `\${${k}}`;
        });
    }
    if (Array.isArray(val)) return val.map((v) => interpolate(v, vars));
    if (val !== null && typeof val === "object") {
      return Object.fromEntries(Object.entries(val).map(([k, v]) => [k, interpolate(v, vars)]));
    }
    return val;
  }

  function evaluateCondition(cond, vars) {
    if (!cond) return true;
    if (typeof cond === "boolean") return cond;
    if (typeof cond === "string") {
      const v = vars[cond] ?? getNestedValue(vars, cond);
      return Boolean(v);
    }
    if (typeof cond === "object") {
      const varVal = vars[cond.var] ?? getNestedValue(vars, cond.var);
      if (cond.equals !== undefined) return varVal === cond.equals;
      if (cond.notEquals !== undefined) return varVal !== cond.notEquals;
      if (cond.gt !== undefined) return Number(varVal) > Number(cond.gt);
      if (cond.lt !== undefined) return Number(varVal) < Number(cond.lt);
      if (cond.isTruthy) return Boolean(varVal);
      if (cond.isFalsy) return !varVal;
    }
    return true;
  }

  function pushHistory(name, record) {
    if (!runtime._shortcutHistory.has(name)) runtime._shortcutHistory.set(name, []);
    const hist = runtime._shortcutHistory.get(name);
    hist.push(record);
    if (hist.length > 20) hist.shift();
  }

  const createAction = async ({ name, description = "", steps, category = "general", tags = [] } = {}) => {
    if (!name) return { ok: false, error: "El parametro 'name' es requerido." };
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return { ok: false, error: "El parametro 'steps' debe ser un array con al menos un paso." };
    }
    const now = new Date().toISOString();
    const existing = runtime._shortcuts.get(name);
    runtime._shortcuts.set(name, {
      description,
      category,
      steps,
      tags: Array.isArray(tags) ? tags : [],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    await persist();
    return { ok: true, name, stepsCount: steps.length, category, storedAt: shortcutsFile };
  };

  const updateAction = async ({ name, description, steps, category, tags } = {}) => {
    if (!name) return { ok: false, error: "El parametro 'name' es requerido." };
    const existing = runtime._shortcuts.get(name);
    if (!existing) return { ok: false, error: `Shortcut '${name}' no encontrado.` };
    const updated = {
      ...existing,
      description: description !== undefined ? description : existing.description,
      steps: steps !== undefined && Array.isArray(steps) ? steps : existing.steps,
      category: category !== undefined ? category : existing.category,
      tags: tags !== undefined && Array.isArray(tags) ? tags : existing.tags,
      updatedAt: new Date().toISOString(),
    };
    runtime._shortcuts.set(name, updated);
    await persist();
    return { ok: true, name, stepsCount: updated.steps.length, updatedAt: updated.updatedAt };
  };

  const renameAction = async ({ name, newName } = {}) => {
    if (!name || !newName) return { ok: false, error: "Los parametros 'name' y 'newName' son requeridos." };
    if (name === newName) return { ok: false, error: "El nombre nuevo debe ser diferente al actual." };
    const existing = runtime._shortcuts.get(name);
    if (!existing) return { ok: false, error: `Shortcut '${name}' no encontrado.` };
    if (runtime._shortcuts.has(newName)) return { ok: false, error: `Ya existe un shortcut con el nombre '${newName}'.` };
    runtime._shortcuts.set(newName, { ...existing, updatedAt: new Date().toISOString() });
    runtime._shortcuts.delete(name);
    if (runtime._shortcutHistory.has(name)) {
      runtime._shortcutHistory.set(newName, runtime._shortcutHistory.get(name));
      runtime._shortcutHistory.delete(name);
    }
    await persist();
    return { ok: true, oldName: name, newName };
  };

  const executeAction = async ({ name, steps, variables = {}, stopOnFirstError = false, dryRun = false } = {}) => {
    let shortcut;
    if (Array.isArray(steps) && steps.length > 0) {
      shortcut = { name: name || "adhoc_recipe", steps };
    } else {
      if (!name) return { ok: false, error: "El parametro 'name' (o un array 'steps') es requerido." };
      shortcut = runtime._shortcuts.get(name);
      if (!shortcut) return { ok: false, error: `Shortcut '${name}' no encontrado. Usa shortcuts.list para ver los disponibles.` };
    }

    const startedAt = new Date().toISOString();
    const results = [];
    const runtimeVars = { ...variables };
    const STEP_CONTROL_KEYS = new Set(["tool", "action", "args", "delayMs", "stopOnError", "when", "condition", "captureAs", "capture", "retries"]);

    for (let i = 0; i < shortcut.steps.length; i++) {
      const step = shortcut.steps[i];

      // Verificación condicional de ejecución
      if (step.when || step.condition) {
        const cond = step.when || step.condition;
        if (!evaluateCondition(cond, runtimeVars)) {
          results.push({ step: i + 1, tool: step.tool, action: step.action, skipped: true, reason: "Condición no cumplida" });
          continue;
        }
      }

      const tool = interpolate(step.tool, runtimeVars);
      const action = interpolate(step.action, runtimeVars);

      const flatStepArgs = {};
      for (const [k, v] of Object.entries(step)) {
        if (!STEP_CONTROL_KEYS.has(k)) flatStepArgs[k] = v;
      }
      const args = interpolate({ ...flatStepArgs, ...(step.args || {}) }, runtimeVars);

      if (dryRun) {
        results.push({ step: i + 1, tool, action, args, simulated: true, ok: true });
        continue;
      }

      if (step.delayMs && Number(step.delayMs) > 0) {
        await new Promise((r) => setTimeout(r, Number(step.delayMs)));
      }

      let stepOk = false;
      let stepResult = null;
      let stepError = null;
      const maxAttempts = 1 + (Number(step.retries) || 0);

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const res = await runtime.router.execute({ tool, action, args });
          stepResult = res;
          stepOk = res?.ok !== false;
          if (stepOk) break;
        } catch (e) {
          stepError = e.message;
          if (attempt === maxAttempts) break;
        }
      }

      // Captura dinámica de variables para siguientes pasos (variable piping)
      if (stepOk && stepResult) {
        if (step.captureAs) {
          runtimeVars[step.captureAs] = stepResult;
        }
        if (step.capture && typeof step.capture === "object") {
          for (const [vName, pathInRes] of Object.entries(step.capture)) {
            runtimeVars[vName] = getNestedValue(stepResult, pathInRes);
          }
        }
      }

      const entry = {
        step: i + 1,
        tool,
        action,
        ok: stepOk,
        result: stepResult,
        error: stepError,
      };
      results.push(entry);

      if ((step.stopOnError || stopOnFirstError) && !stepOk) {
        pushHistory(name, { startedAt, finishedAt: new Date().toISOString(), ok: false, stepsRan: results.length, stoppedAt: i + 1 });
        return { ok: false, name, executedSteps: results.length, totalSteps: shortcut.steps.length, results, stoppedAt: step };
      }
    }

    if (!dryRun) {
      pushHistory(name, { startedAt, finishedAt: new Date().toISOString(), ok: true, stepsRan: results.length });
    }

    return {
      ok: true,
      name,
      dryRun,
      executedSteps: results.length,
      totalSteps: shortcut.steps.length,
      variables: runtimeVars,
      results,
    };
  };

  const listAction = async ({ category } = {}) => {
    const list = [];
    for (const [name, s] of runtime._shortcuts.entries()) {
      if (category && s.category !== category) continue;
      list.push({
        name,
        description: s.description,
        category: s.category || "general",
        tags: s.tags || [],
        stepsCount: s.steps.length,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      });
    }
    list.sort((a, b) => `${a.category}:${a.name}`.localeCompare(`${b.category}:${b.name}`));
    const categories = [...new Set(list.map((s) => s.category))];
    return { ok: true, count: list.length, categories, shortcuts: list, storedAt: shortcutsFile };
  };

  const getAction = async ({ name } = {}) => {
    if (!name) return { ok: false, error: "El parametro 'name' es requerido." };
    const s = runtime._shortcuts.get(name);
    if (!s) return { ok: false, error: `Shortcut '${name}' no encontrado.` };
    return { ok: true, name, ...s, history: runtime._shortcutHistory.get(name) || [] };
  };

  const deleteAction = async ({ name, all } = {}) => {
    if (all === true || name === "*" || name === "all") {
      const count = runtime._shortcuts.size;
      runtime._shortcuts.clear();
      runtime._shortcutHistory.clear();
      await persist();
      return { ok: true, deletedAll: true, countCleared: count };
    }
    if (!name) return { ok: false, error: "El parametro 'name' es requerido, o usa all:true para borrar todos." };
    if (!runtime._shortcuts.has(name)) return { ok: false, error: `Shortcut '${name}' no encontrado.` };
    runtime._shortcuts.delete(name);
    runtime._shortcutHistory.delete(name);
    await persist();
    return { ok: true, deleted: true, name };
  };

  const historyAction = async ({ name } = {}) => {
    if (!name) return { ok: false, error: "El parametro 'name' es requerido." };
    if (!runtime._shortcuts.has(name)) return { ok: false, error: `Shortcut '${name}' no encontrado.` };
    return { ok: true, name, count: (runtime._shortcutHistory.get(name) || []).length, history: runtime._shortcutHistory.get(name) || [] };
  };

  const listTemplatesAction = async () => {
    return {
      ok: true,
      count: Object.keys(BUILTIN_TEMPLATES).length,
      templates: BUILTIN_TEMPLATES,
      tip_for_ai: "Puedes instanciar cualquiera de estas plantillas con shortcuts.create_from_template { template: '<nombre>', name: '<nombre_propio>' }.",
    };
  };

  const createFromTemplateAction = async ({ template, name, overrides = {} } = {}) => {
    if (!template || !BUILTIN_TEMPLATES[template]) {
      return {
        ok: false,
        error: `Plantilla '${template}' no encontrada. Disponibles: ${Object.keys(BUILTIN_TEMPLATES).join(", ")}`,
      };
    }
    const tpl = BUILTIN_TEMPLATES[template];
    const shortcutName = name || template;
    return createAction({
      name: shortcutName,
      description: overrides.description || tpl.description,
      category: overrides.category || tpl.category,
      tags: overrides.tags || tpl.tags,
      steps: overrides.steps || tpl.steps,
    });
  };

  const exportAction = async ({ destination } = {}) => {
    const data = {};
    for (const [name, s] of runtime._shortcuts.entries()) data[name] = s;
    const json = JSON.stringify(data, null, 2);
    if (destination) {
      try {
        await fs.writeFile(runtime.hp(destination), json, "utf8");
        return { ok: true, path: runtime.hp(destination), count: runtime._shortcuts.size };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
    return { ok: true, count: runtime._shortcuts.size, data: JSON.parse(json) };
  };

  const importAction = async ({ source, data: importData, overwrite = false } = {}) => {
    let parsed;
    if (source) {
      try {
        const raw = await fs.readFile(runtime.hp(source), "utf8");
        parsed = JSON.parse(raw);
      } catch (e) {
        return { ok: false, error: `Error leyendo archivo: ${e.message}` };
      }
    } else if (importData) {
      parsed = typeof importData === "string" ? JSON.parse(importData) : importData;
    } else return { ok: false, error: "Se requiere 'source' o 'data'." };

    const now = new Date().toISOString();
    let imported = 0;
    let skipped = 0;
    for (const [k, v] of Object.entries(parsed)) {
      if (!v || !Array.isArray(v.steps)) continue;
      if (!overwrite && runtime._shortcuts.has(k)) {
        skipped++;
        continue;
      }
      runtime._shortcuts.set(k, {
        description: v.description || "",
        category: v.category || "general",
        steps: v.steps,
        tags: Array.isArray(v.tags) ? v.tags : [],
        createdAt: v.createdAt || now,
        updatedAt: now,
      });
      imported++;
    }
    await persist();
    return { ok: true, imported, skipped, total: runtime._shortcuts.size, storedAt: shortcutsFile };
  };

  const actions = {
    create: createAction,
    save: createAction,
    create_shortcut: createAction,
    add_shortcut: createAction,
    update: updateAction,
    edit: updateAction,
    rename: renameAction,
    execute: executeAction,
    run: executeAction,
    run_shortcut: executeAction,
    execute_shortcut: executeAction,
    list: listAction,
    list_shortcuts: listAction,
    list_all: listAction,
    get: getAction,
    inspect: getAction,
    get_shortcut: getAction,
    delete: deleteAction,
    remove: deleteAction,
    delete_shortcut: deleteAction,
    clear_all: async () => {
      const count = runtime._shortcuts.size;
      runtime._shortcuts.clear();
      runtime._shortcutHistory.clear();
      await persist();
      return { ok: true, deletedAll: true, countCleared: count };
    },
    history: historyAction,
    list_templates: listTemplatesAction,
    templates: listTemplatesAction,
    create_from_template: createFromTemplateAction,
    export_shortcuts: exportAction,
    import_shortcuts: importAction,
    reload: async () => {
      runtime._shortcuts.clear();
      await loadFromDisk();
      return { ok: true, loaded: runtime._shortcuts.size, storedAt: shortcutsFile };
    },
  };

  return domain(
    "shortcuts",
    "Motor universal de atajos, pipelines y macros multi-paso con soporte de variables dinámicas, condiciones de salto, simulación y plantillas predefinidas. Acciones: create, execute, list, get, delete, rename, update, history, list_templates, create_from_template, export_shortcuts, import_shortcuts, reload.",
    actions,
    {}
  );
}
