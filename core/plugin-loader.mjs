import { readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * PluginLoader — carga domínios externos (plugins) dinámicamente en FLUXER.
 *
 * Un plugin es un directorio dentro de `pluginsDir` que contiene un
 * archivo `index.mjs` exportando una función default:
 *
 *   export default async function(runtime) {
 *     return {
 *       name:        'mi_plugin',          // nombre del dominio MCP
 *       description: 'Descripción breve',
 *       actions: {
 *         accion_uno: async ({ arg } = {}, runtime) => { ... },
 *       },
 *       permissions: { accion_uno: 'poweruser' }, // opcional
 *     };
 *   }
 */
export class PluginLoader {
  /**
   * @param {object} opts
   * @param {string}   opts.pluginsDir - Ruta absoluta al directorio de plugins.
   * @param {object}   opts.runtime   - Instancia del runtime de FLUXER.
   * @param {object}   opts.registry  - Instancia del registry de FLUXER.
   */
  constructor({ pluginsDir, runtime, registry }) {
    this.pluginsDir = pluginsDir;
    this.runtime = runtime;
    this.registry = registry;
    this.loaded = new Map(); // pluginName → { domain, loadedAt }
  }

  /**
   * Descubre nombres de directorios en pluginsDir.
   * @returns {Promise<string[]>}
   */
  async discover() {
    const entries = await readdir(this.pluginsDir, {
      withFileTypes: true,
    }).catch(() => []);
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((n) => !n.startsWith(".")); // ignorar directorios ocultos
  }

  /**
   * Carga un plugin por nombre.
   * Añade un query param de timestamp para evitar caché de módulos en hot-reload.
   * @param {string} pluginName
   * @returns {Promise<object>} domain cargado
   */
  async load(pluginName) {
    const indexPath = resolve(join(this.pluginsDir, pluginName, "index.mjs"));
    const indexUrl = pathToFileURL(indexPath).href;
    // Timestamp en la query evita que Node cachee el módulo en recargas
    const mod = await import(`${indexUrl}?t=${Date.now()}`);

    if (typeof mod.default !== "function") {
      throw new Error(
        `Plugin "${pluginName}": index.mjs debe exportar una función default(runtime) => domain`,
      );
    }

    const domain = await mod.default(this.runtime);

    if (!domain?.name || typeof domain.actions !== "object") {
      throw new Error(
        `Plugin "${pluginName}": la función default debe retornar { name, description, actions }`,
      );
    }

    this.registry.registerDomain(domain);
    this.loaded.set(pluginName, { domain, loadedAt: new Date().toISOString() });

    await this.runtime.logger.info("plugin_loaded", {
      plugin: pluginName,
      tool: domain.name,
      actions: Object.keys(domain.actions).length,
    });

    return domain;
  }

  /**
   * Descarga un plugin por nombre (hot-unload).
   * @param {string} pluginName
   */
  async unload(pluginName) {
    const entry = this.loaded.get(pluginName);
    if (!entry) throw new Error(`Plugin "${pluginName}" no está cargado.`);
    this.registry.unregisterDomain(entry.domain.name);
    this.loaded.delete(pluginName);
    await this.runtime.logger.info("plugin_unloaded", { plugin: pluginName });
  }

  /**
   * Carga todos los plugins descubiertos en pluginsDir.
   * Los fallos individuales no detienen la carga de los demás.
   * @returns {Promise<{ loaded: string[], failed: Array<{ plugin: string, reason: string }> }>}
   */
  async loadAll() {
    const names = await this.discover();
    const results = await Promise.allSettled(names.map((n) => this.load(n)));

    const loaded = [];
    const failed = [];

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "fulfilled") {
        loaded.push(results[i].value.name);
      } else {
        failed.push({
          plugin: names[i],
          reason: results[i].reason?.message ?? String(results[i].reason),
        });
      }
    }

    return { loaded, failed };
  }

  /**
   * Snapshot del estado de todos los plugins cargados.
   * @returns {Array<{ plugin, tool, loadedAt, actions }>}
   */
  snapshot() {
    return [...this.loaded.entries()].map(([name, e]) => ({
      plugin: name,
      tool: e.domain.name,
      loadedAt: e.loadedAt,
      actions: Object.keys(e.domain.actions ?? {}).length,
    }));
  }
}
