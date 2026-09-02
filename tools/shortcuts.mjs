/**
 * AERON FLUXER X - tools/shortcuts.mjs
 * Motor universal de macros / atajos multi-paso con persistencia local (USERPROFILE).
 * Los shortcuts se almacenan en %USERPROFILE%\.aeron\shortcuts.json
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

  async function persist() {
    const data = {};
    for (const [name, s] of runtime._shortcuts.entries()) data[name] = s;
    try { await fs.writeFile(shortcutsFile, JSON.stringify(data, null, 2), "utf8"); } catch {}
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

  function interpolate(val, vars) {
    if (typeof val === "string") return val.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] !== undefined ? String(vars[k]) : `{{${k}}}`);
    if (Array.isArray(val)) return val.map((v) => interpolate(v, vars));
    if (val !== null && typeof val === "object") return Object.fromEntries(Object.entries(val).map(([k, v]) => [k, interpolate(v, vars)]));
    return val;
  }

  function pushHistory(name, record) {
    if (!runtime._shortcutHistory.has(name)) runtime._shortcutHistory.set(name, []);
    const hist = runtime._shortcutHistory.get(name);
    hist.push(record);
    if (hist.length > 20) hist.shift();
  }

  const createAction = async ({ name, description = "", steps, category = "general", tags = [] } = {}) => {
    if (!name) return { ok: false, error: "El parametro 'name' es requerido." };
    if (!steps || !Array.isArray(steps) || steps.length === 0) return { ok: false, error: "El parametro 'steps' debe ser un array con al menos un paso." };
    const now = new Date().toISOString();
    const existing = runtime._shortcuts.get(name);
    runtime._shortcuts.set(name, { description, category, steps, tags: Array.isArray(tags) ? tags : [], createdAt: existing?.createdAt || now, updatedAt: now });
    await persist();
    return { ok: true, name, stepsCount: steps.length, category, storedAt: shortcutsFile };
  };

  const updateAction = async ({ name, description, steps, category, tags } = {}) => {
    if (!name) return { ok: false, error: "El parametro 'name' es requerido." };
    const existing = runtime._shortcuts.get(name);
    if (!existing) return { ok: false, error: `Shortcut '${name}' no encontrado.` };
    const updated = { ...existing, description: description !== undefined ? description : existing.description, steps: steps !== undefined && Array.isArray(steps) ? steps : existing.steps, category: category !== undefined ? category : existing.category, tags: tags !== undefined && Array.isArray(tags) ? tags : existing.tags, updatedAt: new Date().toISOString() };
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
    if (runtime._shortcutHistory.has(name)) { runtime._shortcutHistory.set(newName, runtime._shortcutHistory.get(name)); runtime._shortcutHistory.delete(name); }
    await persist();
    return { ok: true, oldName: name, newName };
  };

  const executeAction = async ({ name, variables = {}, stopOnFirstError = false } = {}) => {
    if (!name) return { ok: false, error: "El parametro 'name' es requerido." };
    const shortcut = runtime._shortcuts.get(name);
    if (!shortcut) return { ok: false, error: `Shortcut '${name}' no encontrado. Usa shortcuts:list para ver los disponibles.` };
    const startedAt = new Date().toISOString();
    const results = [];
    for (let i = 0; i < shortcut.steps.length; i++) {
      const step = shortcut.steps[i];
      const tool = interpolate(step.tool, variables);
      const action = interpolate(step.action, variables);
      const args = interpolate(step.args || {}, variables);
      if (step.delayMs && Number(step.delayMs) > 0) await new Promise((r) => setTimeout(r, Number(step.delayMs)));
      try {
        const result = await runtime.router.execute({ tool, action, args });
        const entry = { step: i + 1, tool, action, ok: result?.ok !== false, result };
        results.push(entry);
        if ((step.stopOnError || stopOnFirstError) && result?.ok === false) {
          pushHistory(name, { startedAt, finishedAt: new Date().toISOString(), ok: false, stepsRan: results.length, stoppedAt: i + 1 });
          return { ok: false, name, executedSteps: results.length, totalSteps: shortcut.steps.length, results, stoppedAt: step };
        }
      } catch (e) {
        results.push({ step: i + 1, tool: step.tool, action: step.action, ok: false, error: e.message });
        if (step.stopOnError || stopOnFirstError) {
          pushHistory(name, { startedAt, finishedAt: new Date().toISOString(), ok: false, stepsRan: results.length, stoppedAt: i + 1 });
          return { ok: false, name, executedSteps: results.length, totalSteps: shortcut.steps.length, results, stoppedAt: step };
        }
      }
    }
    pushHistory(name, { startedAt, finishedAt: new Date().toISOString(), ok: true, stepsRan: results.length });
    return { ok: true, name, executedSteps: results.length, totalSteps: shortcut.steps.length, results };
  };

  const listAction = async ({ category } = {}) => {
    const list = [];
    for (const [name, s] of runtime._shortcuts.entries()) {
      if (category && s.category !== category) continue;
      list.push({ name, description: s.description, category: s.category || "general", tags: s.tags || [], stepsCount: s.steps.length, createdAt: s.createdAt, updatedAt: s.updatedAt });
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

  const exportAction = async ({ destination } = {}) => {
    const data = {};
    for (const [name, s] of runtime._shortcuts.entries()) data[name] = s;
    const json = JSON.stringify(data, null, 2);
    if (destination) {
      try { await fs.writeFile(runtime.hp(destination), json, "utf8"); return { ok: true, path: runtime.hp(destination), count: runtime._shortcuts.size }; }
      catch (e) { return { ok: false, error: e.message }; }
    }
    return { ok: true, count: runtime._shortcuts.size, data: JSON.parse(json) };
  };

  const importAction = async ({ source, data: importData, overwrite = false } = {}) => {
    let parsed;
    if (source) {
      try { const raw = await fs.readFile(runtime.hp(source), "utf8"); parsed = JSON.parse(raw); }
      catch (e) { return { ok: false, error: `Error leyendo archivo: ${e.message}` }; }
    } else if (importData) {
      parsed = typeof importData === "string" ? JSON.parse(importData) : importData;
    } else return { ok: false, error: "Se requiere 'source' o 'data'." };
    const now = new Date().toISOString();
    let imported = 0; let skipped = 0;
    for (const [k, v] of Object.entries(parsed)) {
      if (!v || !Array.isArray(v.steps)) continue;
      if (!overwrite && runtime._shortcuts.has(k)) { skipped++; continue; }
      runtime._shortcuts.set(k, { description: v.description || "", category: v.category || "general", steps: v.steps, tags: Array.isArray(v.tags) ? v.tags : [], createdAt: v.createdAt || now, updatedAt: now });
      imported++;
    }
    await persist();
    return { ok: true, imported, skipped, total: runtime._shortcuts.size, storedAt: shortcutsFile };
  };

  const actions = {
    create: createAction, save: createAction,
    update: updateAction, edit: updateAction,
    rename: renameAction,
    execute: executeAction, run: executeAction,
    list: listAction,
    get: getAction, inspect: getAction,
    delete: deleteAction, remove: deleteAction,
    clear_all: async () => { const count = runtime._shortcuts.size; runtime._shortcuts.clear(); runtime._shortcutHistory.clear(); await persist(); return { ok: true, deletedAll: true, countCleared: count }; },
    history: historyAction,
    export_shortcuts: exportAction,
    import_shortcuts: importAction,
    reload: async () => { runtime._shortcuts.clear(); await loadFromDisk(); return { ok: true, loaded: runtime._shortcuts.size, storedAt: shortcutsFile }; },
  };

  return domain("shortcuts", "Motor de atajos y macros multi-paso con persistencia local en USERPROFILE. Acciones: create, execute, list, get, delete, rename, update, history, export, import, reload.", actions, {});
}
