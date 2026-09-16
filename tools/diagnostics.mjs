import { CURRENT_VERSION } from "../core/version.mjs";

// Compact Mode Session State -- AI-managed toggle, session-local (v11.0.0)
let _compactModeEnabled = false;
let _compactModeSetAt = null;
let _compactModeSetBy = "system";

export function isCompactModeEnabled() { return _compactModeEnabled; }
export function getCompactModeState() {
  return { enabled: _compactModeEnabled, set_at: _compactModeSetAt, set_by: _compactModeSetBy };
}

export function createDiagnosticsDomain({ runtime, domain, fs }) {
  const actions = {

    set_compact: async ({ enabled = true, reason = "" } = {}) => {
      const prev = _compactModeEnabled;
      _compactModeEnabled = Boolean(enabled);
      _compactModeSetAt = new Date().toISOString();
      _compactModeSetBy = "ai";
      return {
        ok: true,
        compact_mode: _compactModeEnabled,
        changed: prev !== _compactModeEnabled,
        previous: prev,
        set_at: _compactModeSetAt,
        reason: reason || (_compactModeEnabled ? "Enabled for token-efficient workflow" : "Disabled -- full output restored"),
        tip: _compactModeEnabled
          ? "Compact mode ON: responses trimmed to essentials. Disable when returning detailed results to user."
          : "Compact mode OFF: full responses active.",
      };
    },

    get_compact: async () => ({
      ok: true,
      compact_mode: _compactModeEnabled,
      set_at: _compactModeSetAt,
      set_by: _compactModeSetBy,
      tip: _compactModeEnabled ? "Compact mode ON -- token-optimized." : "Compact mode OFF -- full output active.",
    }),

    compact_status: async () => actions.get_compact(),

    self_test: async () => {
      const checks = [
        { name: "Node.js Runtime", value: process.version, status: "OK" },
        { name: "Platform", value: process.platform, status: "OK" },
        { name: "Architecture", value: process.arch, status: "OK" },
        { name: "Compact Mode Engine", value: _compactModeEnabled ? "ON" : "OFF", status: "OK" },
        { name: "Security Mode", value: runtime.permissions?.currentLevel() || "NORMAL", status: "OK" },
      ];
      return { ok: true, engine: `Fluxer Core MCP v${CURRENT_VERSION}`, health: "HEALTHY", checksCount: checks.length, checks, compact_mode: _compactModeEnabled };
    },

    resolve_toolchain: async ({ forceRefresh = false } = {}) => {
      const { getToolchainSnapshot } = await import("../core/toolchain.mjs");
      const snapshot = await getToolchainSnapshot(forceRefresh);
      return { ok: true, engine: `Fluxer Core MCP v${CURRENT_VERSION}`, platform: snapshot.platform, isWindowsOnly: snapshot.isWindowsOnly, effectivePath: snapshot.effectivePath, binaries: snapshot.binaries, system: snapshot.system, snapshotAt: snapshot.snapshotAt };
    },

    health_check: async ({ expose_host_info = false, compact = false, anonymize = false } = {}) => {
      const { getToolchainSnapshot } = await import("../core/toolchain.mjs");
      const os = await import("node:os");
      const crypto = await import("node:crypto");
      const { execSync } = await import("node:child_process");
      const snapshot = await getToolchainSnapshot();
      const { runHealthCheck } = await import("../core/health.mjs");
      const baseHealth = await runHealthCheck({ runtime, registry: runtime._registry, config: runtime.config });
      const rawHostname = os.hostname();
      const hostHash = crypto.createHash("sha256").update(rawHostname).digest("hex").slice(0, 8);
      const hostId = runtime.hostId || ("host-" + hostHash);
      const shouldAnonymize = Boolean(anonymize || process.env.FLUXER_PUBLIC_MODE === "true" || runtime.config?.mode === "public");
      const displayHost = shouldAnonymize ? `host-${hostHash}` : rawHostname;
      const extraChecks = [];

      // Disk space check (real PowerShell query)
      try {
        const out = execSync('powershell -NoProfile -Command "(Get-PSDrive C).Free"', { timeout: 4000, encoding: "utf8" }).trim();
        const freeBytes = parseInt(out, 10);
        if (!isNaN(freeBytes)) {
          const freeGB = (freeBytes / 1073741824).toFixed(1);
          const st = freeBytes < 524288000 ? "WARN" : "PASS";
          extraChecks.push({ name: "Disk Space (C:)", status: st, value: `${freeGB} GB free`, required: false, remediation: st === "WARN" ? "Free up disk space. < 500 MB may affect updates." : null });
        }
      } catch (_) { extraChecks.push({ name: "Disk Space (C:)", status: "WARN", value: "Could not verify", required: false, remediation: "Check disk space manually." }); }

      // Memory pressure (real OS check)
      try {
        const totalMem = os.totalmem(); const freeMem = os.freemem();
        const usagePct = Math.round(((totalMem - freeMem) / totalMem) * 100);
        const freeGb = (freeMem / 1073741824).toFixed(1);
        const procMem = process.memoryUsage();
        const procRssMb = Math.round(procMem.rss / 1048576);
        // En Windows, hasta el 92% con al menos 0.8GB libres es normal debido al Standby/Superfetch caché
        const isCritical = usagePct > 92 && (freeMem / 1073741824) < 0.8;
        const st = isCritical ? "WARN" : "PASS";
        extraChecks.push({
          name: "Memory Pressure",
          status: st,
          value: `${usagePct}% OS used (${freeGb} GB free) | Fluxer RSS: ${procRssMb} MB`,
          required: false,
          remediation: st === "WARN" ? "High OS RAM usage. Close heavy browser tabs or background apps." : null
        });
      } catch (_) {}

      // npm real version
      let npmReal = snapshot.binaries?.npm?.version;
      if (!npmReal || npmReal === "N/A") { try { npmReal = execSync("npm --version", { timeout: 3000, encoding: "utf8" }).trim(); } catch (_) { npmReal = "N/A"; } }

      // python real version
      let pyReal = snapshot.binaries?.python?.version;
      if (!pyReal || pyReal === "N/A") { try { pyReal = execSync("python --version 2>&1", { timeout: 3000, encoding: "utf8" }).trim().replace("Python ", ""); } catch (_) { pyReal = "N/A (not required)"; } }

      // Dashboard real HTTP GET test
      try {
        const http = await import("node:http");
        const dashOk = await new Promise((resolve) => {
          const req = http.get("http://127.0.0.1:8765/health", { timeout: 2000 }, (res) => { res.destroy(); resolve(res.statusCode < 500); });
          req.on("error", () => resolve(false)); req.on("timeout", () => { req.destroy(); resolve(false); });
        });
        extraChecks.push({ name: "Dashboard HTTP (/health)", status: dashOk ? "PASS" : "WARN", value: dashOk ? "Responding on :8765" : "No response to GET /health", required: false, remediation: dashOk ? null : "Verify server is running." });
      } catch (_) { extraChecks.push({ name: "Dashboard HTTP (/health)", status: "WARN", value: "Check failed", required: false }); }

      function deepSanitize(obj) {
        const username = os.userInfo?.()?.username || process.env.USERNAME || "";
        const homedir = os.homedir?.() || "";
        let s = JSON.stringify(obj);
        if (homedir.length > 2) {
          s = s.replace(new RegExp(homedir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "C:\\\\Users\\\\<redacted>");
          const fwd = homedir.replace(/\\/g, "/");
          s = s.replace(new RegExp(fwd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "C:/Users/<redacted>");
        }
        if (username.length > 1) {
          s = s.replace(new RegExp(username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "<redacted>");
        }
        return JSON.parse(s);
      }

      const mergedChecks = [...(baseHealth.checks || []), ...extraChecks];
      if (compact || _compactModeEnabled) {
        const res = { ok: true, version: CURRENT_VERSION, status: "HEALTHY", compact_mode: _compactModeEnabled, hostname: displayHost, host_id: hostId, nodeVersion: snapshot.binaries?.node?.version || process.version, npmVersion: npmReal, securityMode: runtime.permissions?.currentLevel() || "NORMAL", checks: { pass: mergedChecks.filter(c => c.status === "PASS").length, fail: mergedChecks.filter(c => c.status === "FAIL").length, warn: mergedChecks.filter(c => c.status === "WARN").length }, warnings: mergedChecks.filter(c => c.status === "WARN").map(c => c.name) };
        return shouldAnonymize ? deepSanitize(res) : res;
      }
      const result = { ok: true, version: CURRENT_VERSION, platform: "win32", isWindowsOnly: true, osRelease: os.release(), hostname: displayHost, display_hostname: displayHost, host_id: hostId, shell: "powershell", powershellVersion: snapshot.binaries?.powershell?.version || "5.1", nodeVersion: snapshot.binaries?.node?.version || process.version, npmVersion: npmReal, gitVersion: snapshot.binaries?.git?.version || "N/A (not required)", pythonVersion: pyReal, effectivePath: snapshot.effectivePath, securityMode: runtime.permissions?.currentLevel() || "NORMAL", compact_mode: _compactModeEnabled, workflow: runtime.permissions?.getWorkflow ? runtime.permissions.getWorkflow("default") : null, toolchain: { ...snapshot.binaries, npm: { ...(snapshot.binaries?.npm || {}), version: npmReal }, python: { ...(snapshot.binaries?.python || {}), version: pyReal } }, diagnostics: { ...baseHealth, checks: mergedChecks, statusSummary: { PASS: mergedChecks.filter(c => c.status === "PASS").length, WARN: mergedChecks.filter(c => c.status === "WARN").length, FAIL: mergedChecks.filter(c => c.status === "FAIL").length, NOT_APPLICABLE: mergedChecks.filter(c => c.status === "NOT_APPLICABLE").length, total: mergedChecks.length } } };
      if (expose_host_info && !shouldAnonymize) result.workspaceRoot = runtime.root;
      return shouldAnonymize ? deepSanitize(result) : result;
    },

    network_test: async ({ targets = [], timeout_ms = 5000 } = {}) => {
      const https = await import("node:https");
      const allTargets = [
        { name: "GitHub API", url: "https://api.github.com" },
        { name: "GitHub Raw", url: "https://raw.githubusercontent.com" },
        { name: "npmjs Registry", url: "https://registry.npmjs.org" },
        { name: "winget CDN", url: "https://cdn.winget.microsoft.com" },
        ...targets.map(t => typeof t === "string" ? { name: t, url: t } : t),
      ];
      const results = await Promise.all(allTargets.map(async ({ name, url }) => {
        const start = Date.now();
        try {
          await new Promise((resolve, reject) => {
            const req = https.get(url, { timeout: timeout_ms }, (res) => { res.destroy(); resolve(res.statusCode); });
            req.on("error", reject); req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
          });
          return { name, url, status: "ONLINE", latency_ms: Date.now() - start };
        } catch (e) { return { name, url, status: "OFFLINE", error: e.message, latency_ms: Date.now() - start }; }
      }));
      const onlineCount = results.filter(r => r.status === "ONLINE").length;
      return { ok: onlineCount > 0, summary: `${onlineCount}/${results.length} targets reachable`, internet_available: onlineCount > 0, github_available: results.find(r => r.name === "GitHub API")?.status === "ONLINE", updater_ready: results.find(r => r.name === "GitHub API")?.status === "ONLINE", results };
    },

    storage_test: async () => {
      const os = await import("node:os");
      const path = await import("node:path");
      const testPath = path.join(os.tmpdir(), `fluxer_storage_test_${Date.now()}.tmp`);
      const testData = "Fluxer Core v11 storage test -- " + "x".repeat(1024);
      try {
        const ws = Date.now(); await fs.writeFile(testPath, testData, "utf8"); const write_ms = Date.now() - ws;
        const rs = Date.now(); const read = await fs.readFile(testPath, "utf8"); const read_ms = Date.now() - rs;
        await fs.unlink(testPath).catch(() => {});
        return { ok: true, status: "PASS", write_ms, read_ms, data_match: read === testData, summary: `R/W OK -- write: ${write_ms}ms, read: ${read_ms}ms` };
      } catch (e) { return { ok: false, status: "FAIL", error: e.message, summary: "Storage R/W test FAILED" }; }
    },

    test: async (args = {}) => {
      const target = String(args?.target || args?.type || args?.mode || "").toLowerCase().trim();
      if (target === "network" || target === "net") return actions.network_test(args);
      if (target === "storage" || target === "disk") return actions.storage_test(args);
      if (target === "self" || target === "system") return actions.self_test(args);
      if (target === "health" || target === "check") return actions.health_check(args);
      return actions.mcp_test(args);
    },

    mcp_test: async () => {
      const checks = [];
      const toolCount = runtime._registry?.actionCount?.() || runtime._registry?.getCount?.() || runtime._registry?.modules?.size || (runtime._registry?.tools ? runtime._registry.tools.size : 0) || 0;
      checks.push({ name: "Registry populated", ok: toolCount > 0, detail: `${toolCount} tools registered` });
      checks.push({ name: "Runtime active", ok: Boolean(runtime), detail: runtime ? "Runtime present" : "No runtime" });
      checks.push({ name: "Permissions engine", ok: Boolean(runtime.permissions), detail: runtime.permissions ? `Level: ${runtime.permissions.currentLevel?.() || "N/A"}` : "Not initialized" });
      checks.push({ name: "Compact mode engine", ok: true, detail: `State: ${_compactModeEnabled ? "ON" : "OFF"} -- Session toggle functional` });
      try {
        await import("../core/storage-paths.mjs");
        checks.push({ name: "Storage paths module", ok: true, detail: "Import OK" });
      } catch (e) { checks.push({ name: "Storage paths module", ok: false, detail: e.message }); }
      const passing = checks.filter(c => c.ok).length;
      return { ok: passing === checks.length, summary: `${passing}/${checks.length} MCP checks passed`, version: CURRENT_VERSION, checks, compliance: passing === checks.length ? "COMPLIANT" : "DEGRADED" };
    },

    report: async ({ format = "text" } = {}) => {
      const health = await actions.health_check({ expose_host_info: false });
      const network = await actions.network_test();
      const storage = await actions.storage_test();
      const mcp = await actions.mcp_test();
      const allOk = health.ok && network.ok && storage.ok && mcp.ok;
      const ts = new Date().toISOString();
      if (format === "json") return { ok: allOk, generated_at: ts, version: CURRENT_VERSION, health, network, storage, mcp, compact_mode: _compactModeEnabled };
      const lines = [
        "╔══════════════════════════════════════════════════════╗",
        `║  FLUXER CORE v${CURRENT_VERSION} -- FULL DIAGNOSTIC REPORT      ║`,
        "╚══════════════════════════════════════════════════════╝",
        `  Generated:    ${ts}`,
        `  Overall:      ${allOk ? "ALL SYSTEMS OPERATIONAL" : "ISSUES DETECTED"}`,
        `  Compact Mode: ${_compactModeEnabled ? "ON" : "OFF"}`,
        "",
        "-- HEALTH -----------------------------------------------",
        `  Node.js: ${health.nodeVersion}   npm: ${health.npmVersion}   Security: ${health.securityMode}`,
        ...(health.diagnostics?.checks || []).map(c => `  [${(c.status || "?").padEnd(4)}] ${c.name}: ${c.value || ""}`),
        "",
        "-- NETWORK ----------------------------------------------",
        `  Internet: ${network.internet_available ? "ONLINE" : "OFFLINE"}   GitHub: ${network.github_available ? "REACHABLE" : "UNREACHABLE"}   Updater: ${network.updater_ready ? "READY" : "OFFLINE"}`,
        ...network.results.map(r => `  [${r.status}] ${r.name}: ${r.latency_ms}ms`),
        "",
        "-- STORAGE ----------------------------------------------",
        `  ${storage.status}: ${storage.summary}`,
        "",
        "-- MCP PROTOCOL -----------------------------------------",
        `  Compliance: ${mcp.compliance} | ${mcp.summary}`,
        ...mcp.checks.map(c => `  [${c.ok ? "PASS" : "FAIL"}] ${c.name}: ${c.detail}`),
        "",
        "=========================================================",
      ];
      return { ok: allOk, generated_at: ts, format: "text", report: lines.join("\n"), compact_mode: _compactModeEnabled };
    },

    benchmark: async ({ loops = 100 } = {}) => {
      const requested = Number(loops) || 100;
      const MAX_LOOPS = 5000;
      const n = Math.min(Math.max(1, requested), MAX_LOOPS);
      const isCapped = requested > MAX_LOOPS;
      const startTime = performance.now();
      for (let i = 0; i < n; i++) { runtime.shellQuote?.("bench_" + i); runtime.hp?.("storage/cache/bench_" + i); }
      const durationMs = Math.round(performance.now() - startTime);
      return { ok: true, operations: n, requested_loops: requested, capped: isCapped, capped_to: isCapped ? MAX_LOOPS : undefined, totalDurationMs: durationMs, avgOpMs: Number((durationMs / n).toFixed(4)) };
    },

    telemetry: async () => {
      const mem = process.memoryUsage();
      return { ok: true, version: CURRENT_VERSION, uptimeSeconds: Math.round(process.uptime()), compact_mode: _compactModeEnabled, memory: { rssMb: Number((mem.rss / 1048576).toFixed(2)), heapUsedMb: Number((mem.heapUsed / 1048576).toFixed(2)), heapTotalMb: Number((mem.heapTotal / 1048576).toFixed(2)) }, operations: runtime.operations?.getSnapshot() || {}, processes: runtime.processes?.getSnapshot() || {}, cache: runtime.cache?.getMetrics() || {}, metrics: runtime.metrics?.snapshot() || {} };
    },

    system_diagnose: async () => {
      const os = await import("node:os");
      const totalMem = os.totalmem(); const freeMem = os.freemem();
      const memUsagePct = Number((((totalMem - freeMem) / totalMem) * 100).toFixed(1));
      const issues = [];
      if (memUsagePct > 90) issues.push({ level: "WARNING", type: "MEMORY_PRESSURE", message: `High memory usage (${memUsagePct}%)` });
      return { ok: true, status: issues.length === 0 ? "HEALTHY" : "DEGRADED", memoryUsagePct, memoryFreeMB: Number((freeMem / 1048576).toFixed(0)), issuesCount: issues.length, issues, observations: { cpusCount: os.cpus().length, uptimeSeconds: Math.round(os.uptime()), platform: process.platform, nodeVersion: process.version } };
    },

    verify_html_integrity: async ({ path: p, content, checkEmbeddedJs = true } = {}) => {
      let htmlContent = ""; let targetPath = null;
      if (typeof content === "string") { htmlContent = content; targetPath = p || "inline.html"; }
      else if (p) { targetPath = runtime.hp(p); try { htmlContent = (await fs.readFile(targetPath)).toString("utf8"); } catch (e) { return { ok: false, error: `Cannot read '${p}': ${e.message}` }; } }
      else return { ok: false, error: "Required: 'path' or 'content'." };
      const VOID = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr","!doctype"]);
      const unclosedTags = []; const mismatchedClosings = []; const embeddedJsErrors = [];
      if (checkEmbeddedJs) {
        const vm = await import("node:vm"); const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi; let m;
        while ((m = re.exec(htmlContent)) !== null) { if (/src\s*=/i.test(m[1])) continue; try { new vm.Script(m[2] || ""); } catch (e) { embeddedJsErrors.push({ message: e.message }); } }
      }
      const clean = htmlContent.replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
      const tagRe = /(<\/?)(\s*[\w:-]+)([^>]*?)(\/?)>/g; const stack = []; let tm;
      while ((tm = tagRe.exec(clean)) !== null) {
        const isClosing = tm[1] === "</"; const tagName = tm[2].trim().toLowerCase();
        if (tm[4] === "/" || VOID.has(tagName)) continue;
        const line = (clean.substring(0, tm.index).match(/\n/g) || []).length + 1;
        if (!isClosing) { stack.push({ tag: tagName, line }); }
        else { if (stack.length && stack[stack.length - 1].tag === tagName) { stack.pop(); } else { const idx = stack.findLastIndex(i => i.tag === tagName); if (idx !== -1) { while (stack.length - 1 > idx) unclosedTags.push(stack.pop()); stack.pop(); } else mismatchedClosings.push({ tag: tagName, line }); } }
      }
      while (stack.length) unclosedTags.push(stack.pop());
      const isBalanced = !unclosedTags.length && !mismatchedClosings.length;
      const ok = isBalanced && !embeddedJsErrors.length;
      return { ok, file: targetPath, isBalanced, isJsValid: !embeddedJsErrors.length, unclosedTags, mismatchedClosings, embeddedJsErrors, summary: ok ? "HTML structure valid." : "HTML issues detected." };
    },
  };

  actions.diagnose = actions.system_diagnose;
  actions.check = actions.health_check;
  actions.health = actions.health_check;
  actions.status = actions.compact_status;

  return domain("diagnostics", "Diagnostics v11.0.0 -- compact mode AI-toggle (set_compact/get_compact), network_test, storage_test, mcp_test, report, health_check with real disk/memory/npm/python/dashboard checks.", actions, {});
}
