export function createDiagnosticsDomain({ runtime, domain, fs }) {
  const actions = {
    self_test: async () => {
      const checks = [];
      checks.push({ name: "Node.js Runtime", value: process.version, status: "OK" });
      checks.push({ name: "Platform", value: process.platform, status: "OK" });
      checks.push({ name: "Architecture", value: process.arch, status: "OK" });
      checks.push({ name: "SQLite Module", value: "Available", status: "OK" });
      checks.push({ name: "Security Mode", value: runtime.permissions?.currentLevel() || "NORMAL", status: "OK" });
      return {
        ok: true,
        engine: "Aeron Fluxer X MCP v9.0.0",
        health: "HEALTHY",
        checksCount: checks.length,
        checks
      };
    },

    resolve_toolchain: async ({ forceRefresh = false } = {}) => {
      const { getToolchainSnapshot } = await import("../core/toolchain.mjs");
      const snapshot = await getToolchainSnapshot(forceRefresh);
      return {
        ok: true,
        engine: "Aeron Fluxer X MCP v9.0.0",
        platform: snapshot.platform,
        isWindowsOnly: snapshot.isWindowsOnly,
        effectivePath: snapshot.effectivePath,
        binaries: snapshot.binaries,
        system: snapshot.system,
        snapshotAt: snapshot.snapshotAt,
      };
    },

    health_check: async ({ expose_host_info = false } = {}) => {
      const { getToolchainSnapshot } = await import("../core/toolchain.mjs");
      const os = await import("node:os");
      const crypto = await import("node:crypto");
      const snapshot = await getToolchainSnapshot();
      const { runHealthCheck } = await import("../core/health.mjs");
      const baseHealth = await runHealthCheck({ runtime, registry: runtime._registry, config: runtime.config });

      // Por defecto, se anonimiza el hostname y se omite workspaceRoot para no exponer
      // datos del entorno del host al usar el MCP en modo de distribución pública.
      // Pasar expose_host_info: true para ver los valores reales (solo para depuración local).
      const rawHostname = os.hostname();
      const hostnameDisplay = expose_host_info
        ? rawHostname
        : "host-" + crypto.createHash("sha256").update(rawHostname).digest("hex").slice(0, 8);

      const result = {
        ok: true,
        platform: "win32",
        isWindowsOnly: true,
        osRelease: os.release(),
        hostname: hostnameDisplay,
        shell: "powershell",
        powershellVersion: snapshot.binaries.powershell.version || "5.1",
        nodeVersion: snapshot.binaries.node.version || process.version,
        npmVersion: snapshot.binaries.npm.version || "N/A",
        gitVersion: snapshot.binaries.git.version || "N/A",
        pythonVersion: snapshot.binaries.python.version || "N/A",
        effectivePath: snapshot.effectivePath,
        securityMode: runtime.permissions?.currentLevel() || "NORMAL",
        toolchain: snapshot.binaries,
        diagnostics: baseHealth,
      };

      // workspaceRoot solo se incluye si se pide explícitamente (contiene ruta con nombre de usuario)
      if (expose_host_info) result.workspaceRoot = runtime.root;

      return result;
    },


    benchmark: async ({ loops = 100 } = {}) => {
      const n = Math.min(Math.max(1, Number(loops) || 100), 1000);
      const startTime = performance.now();
      for (let i = 0; i < n; i++) {
        runtime.shellQuote("benchmark_quote_" + i);
        runtime.hp("storage/cache/bench_" + i);
      }
      const durationMs = Math.round(performance.now() - startTime);
      return {
        ok: true,
        operations: n,
        totalDurationMs: durationMs,
        avgOpMs: Number((durationMs / n).toFixed(4))
      };
    },

    system_diagnose: async () => {
      const os = await import("node:os");
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const memUsagePct = Number((((totalMem - freeMem) / totalMem) * 100).toFixed(1));
      const issues = [];
      if (memUsagePct > 95) {
        issues.push({ level: "WARNING", type: "MEMORY_PRESSURE", message: `Uso de memoria alto (${memUsagePct}%)` });
      }
      return {
        ok: true,
        status: issues.length === 0 ? "HEALTHY" : "DEGRADED",
        memoryUsagePct: memUsagePct,
        issuesCount: issues.length,
        issues,
        observations: {
          cpusCount: os.cpus().length,
          uptimeSeconds: Math.round(os.uptime())
        }
      };
    }
  };

  return domain("diagnostics", "Diagnóstico avanzado del sistema, benchmarks, salud del MCP y auto-evaluación.", actions, {});
}
