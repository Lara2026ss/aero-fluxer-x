/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🖥️ FLUXER X — core/bootstrap.mjs
 * First-Run Bootstrap, Host Identity Initialization y Control de Ciclo de Vida
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Características:
 * 1. Inicialización idempotente 'FIRST_RUN_INITIALIZATION' que ocurre una sola vez.
 * 2. Transición de ciclo de vida: UNINITIALIZED -> INITIALIZING -> READY.
 * 3. Encolado con espera controlada (timeout configurable, default 60s) para
 *    llamadas MCP concurrentes que lleguen durante el primer arranque.
 * 4. Identidad de Host bajo el principio de 'minimum necessary data':
 *    - displayHostname: Nombre real del equipo de Windows (ej: "ROG-ALLY").
 *    - hostId: Identificador técnico local no invasivo (ej: "host-bda7775c").
 * 5. Cero telemetría invasiva, cero recolección de hardware sensible o archivos privados.
 * 6. Rendimiento: Carga en subsiguientes arranques en <10 ms.
 */

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import crypto from "node:crypto";
import { CURRENT_VERSION, BRAND_NAME } from "./version.mjs";
import { getStorageStructure, ensureUserDataInitialized } from "./storage-paths.mjs";

export class FirstRunBootstrap {
  constructor({ root, version = CURRENT_VERSION, brand = BRAND_NAME, logger = null }) {
    this.root = root || process.cwd();
    this.version = version;
    this.brand = brand;
    this.logger = logger;
    this.status = "UNINITIALIZED"; // UNINITIALIZED | INITIALIZING | READY | ERROR
    this.isReady = false;
    this.hostId = null;
    this.displayHostname = null;
    this.state = null;
    this.loadDurationMs = 0;
    this._readyResolvers = [];
  }

  /**
   * Espera controladamente a que el bootstrap reporte READY.
   * Si la IA llama a una herramienta inmediatamente al instalar, esta llamada
   * no falla prematuramente sino que espera con un timeout razonable (default 60s).
   * @param {number} [timeoutMs=60000]
   * @returns {Promise<boolean>}
   */
  async waitForReady(timeoutMs = 60000) {
    if (this.isReady) return true;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this._readyResolvers.indexOf(onReady);
        if (idx !== -1) this._readyResolvers.splice(idx, 1);
        reject(new Error(`[BOOTSTRAP TIMEOUT] Fluxer X tardó más de ${timeoutMs / 1000}s en completar la inicialización de host. Estado actual: ${this.status}`));
      }, timeoutMs);

      const onReady = () => {
        clearTimeout(timer);
        resolve(true);
      };
      this._readyResolvers.push(onReady);
    });
  }

  _notifyReady() {
    this.isReady = true;
    this.status = "READY";
    const resolvers = [...this._readyResolvers];
    this._readyResolvers = [];
    for (const r of resolvers) {
      try { r(); } catch {}
    }
  }

  /**
   * Ejecuta la detección y carga del bootstrap.
   * Si es primera ejecución, ejecuta FIRST_RUN_INITIALIZATION.
   * Si ya estaba inicializado, carga en <10 ms de forma transparente.
   */
  async initialize() {
    const start = performance.now();
    this.status = "INITIALIZING";

    const storage = await ensureUserDataInitialized(this.root);
    const stateFile = storage.stateFile || path.join(storage.base, "state", "state.json");
    const currentHostname = os.hostname();

    try {
      if (existsSync(stateFile)) {
        const raw = await fs.readFile(stateFile, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && parsed.initialized && parsed.host?.hostId) {
          this.state = parsed;
          this.hostId = parsed.host.hostId;
          this.displayHostname = currentHostname;

          // Si el usuario renombró el PC en Windows, actualizar displayHostname manteniendo hostId estable
          if (parsed.host.displayHostname !== currentHostname) {
            this.state.host.displayHostname = currentHostname;
            this.state.lastUpdated = new Date().toISOString();
            await fs.writeFile(stateFile, JSON.stringify(this.state, null, 2), "utf8").catch(() => {});
          }

          this.loadDurationMs = Math.round((performance.now() - start) * 100) / 100;
          this._notifyReady();
          return {
            firstRun: false,
            hostId: this.hostId,
            displayHostname: this.displayHostname,
            durationMs: this.loadDurationMs,
            targetUnder10ms: this.loadDurationMs < 10,
          };
        }
      }
    } catch (e) {
      // Estado corrupto o no legible: auto-recuperar limpiamente
      this.logger?.warn?.("bootstrap_state_corrupt_recovering", { error: e.message });
    }

    // FIRST RUN INITIALIZATION
    return await this._performFirstRun(storage, stateFile, currentHostname, start);
  }

  async _performFirstRun(storage, stateFile, currentHostname, start) {
    // Generar hostId técnico local mínimo y no invasivo
    // Cero telemetría personal, cero fingerprinting de hardware o archivos de usuario
    const randomHex = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const hostId = `host-${randomHex}`;

    await fs.mkdir(path.dirname(stateFile), { recursive: true }).catch(() => {});

    const statePayload = {
      initialized: true,
      brand: this.brand,
      version: this.version,
      firstRunAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      host: {
        displayHostname: currentHostname,
        hostId: hostId,
      },
      environment: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        osRelease: os.release(),
      },
      status: "READY",
    };

    await fs.writeFile(stateFile, JSON.stringify(statePayload, null, 2), "utf8");

    this.state = statePayload;
    this.hostId = hostId;
    this.displayHostname = currentHostname;
    this.loadDurationMs = Math.round((performance.now() - start) * 100) / 100;

    this._notifyReady();

    this.logger?.info?.("first_run_initialization_completed", {
      hostId,
      displayHostname: currentHostname,
      durationMs: this.loadDurationMs,
    });

    return {
      firstRun: true,
      hostId,
      displayHostname: currentHostname,
      durationMs: this.loadDurationMs,
      targetUnder10ms: this.loadDurationMs < 10,
    };
  }
}

export default { FirstRunBootstrap };
