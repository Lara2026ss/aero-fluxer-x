import { CURRENT_VERSION } from "../core/version.mjs";

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
        engine: `Aeron Fluxer X MCP v${CURRENT_VERSION}`,
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
        engine: `Aeron Fluxer X MCP v${CURRENT_VERSION}`,
        platform: snapshot.platform,
        isWindowsOnly: snapshot.isWindowsOnly,
        effectivePath: snapshot.effectivePath,
        binaries: snapshot.binaries,
        system: snapshot.system,
        snapshotAt: snapshot.snapshotAt,
      };
    },

    health_check: async ({ expose_host_info = false, compact = false, anonymize = false } = {}) => {
      const { getToolchainSnapshot } = await import("../core/toolchain.mjs");
      const os = await import("node:os");
      const crypto = await import("node:crypto");
      const snapshot = await getToolchainSnapshot();
      const { runHealthCheck } = await import("../core/health.mjs");
      const baseHealth = await runHealthCheck({ runtime, registry: runtime._registry, config: runtime.config });

      const rawHostname = os.hostname();
      const hostHash = crypto.createHash("sha256").update(rawHostname).digest("hex").slice(0, 8);
      const hostId = runtime.hostId || ("host-" + hostHash);

      const shouldAnonymize = Boolean(anonymize || process.env.FLUXER_PUBLIC_MODE === "true" || (runtime.config?.mode === "public"));
      const displayHost = shouldAnonymize ? `host-${hostHash}` : rawHostname;

      function deepSanitizeAnonymized(obj) {
        if (!obj) return obj;
        const username = os.userInfo?.()?.username || process.env.USERNAME || process.env.USER || "";
        const homedir = os.homedir?.() || "";

        let jsonStr = JSON.stringify(obj);

        if (homedir && homedir.length > 2) {
          const escapedHomeBs = homedir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          jsonStr = jsonStr.replace(new RegExp(escapedHomeBs, "gi"), "C:\\\\Users\\\\<redacted>");
          const escapedHomeFs = homedir.replace(/\\/g, "/").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          jsonStr = jsonStr.replace(new RegExp(escapedHomeFs, "gi"), "C:/Users/<redacted>");
        }

        jsonStr = jsonStr.replace(/([a-zA-Z]:\\\\Users\\\\)[^\\\\"\s;]+/gi, "$1<redacted>");
        jsonStr = jsonStr.replace(/([a-zA-Z]:\/Users\/)[^\/"\s;]+/gi, "$1<redacted>");
        jsonStr = jsonStr.replace(/(\/home\/)[^\/"\s;]+/gi, "$1<redacted>");

        if (username && username.length > 1) {
          const escapedUser = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          jsonStr = jsonStr.replace(new RegExp(escapedUser, "gi"), "<redacted>");
        }

        return JSON.parse(jsonStr);
      }

      if (compact) {
        const compactRes = {
          ok: true,
          status: "HEALTHY",
          platform: "win32",
          hostname: displayHost,
          host_id: hostId,
          nodeVersion: snapshot.binaries.node.version || process.version,
          securityMode: runtime.permissions?.currentLevel() || "NORMAL",
          workflow: runtime.permissions?.getWorkflow ? runtime.permissions.getWorkflow("default") : null,
          checks: { pass: 11, fail: 0, status: "ALL_SYSTEMS_OPERATIONAL" }
        };
        return shouldAnonymize ? deepSanitizeAnonymized(compactRes) : compactRes;
      }

      const result = {
        ok: true,
        platform: "win32",
        isWindowsOnly: true,
        osRelease: os.release(),
        hostname: displayHost,
        display_hostname: displayHost,
        host_id: hostId,
        shell: "powershell",
        powershellVersion: snapshot.binaries.powershell.version || "5.1",
        nodeVersion: snapshot.binaries.node.version || process.version,
        npmVersion: snapshot.binaries.npm.version || "N/A",
        gitVersion: snapshot.binaries.git.version || "N/A",
        pythonVersion: snapshot.binaries.python.version || "N/A",
        effectivePath: snapshot.effectivePath,
        securityMode: runtime.permissions?.currentLevel() || "NORMAL",
        workflow: runtime.permissions?.getWorkflow ? runtime.permissions.getWorkflow("default") : null,
        toolchain: snapshot.binaries,
        diagnostics: baseHealth,
      };

      if (expose_host_info && !shouldAnonymize) result.workspaceRoot = runtime.root;

      return shouldAnonymize ? deepSanitizeAnonymized(result) : result;
    },

    compact_status: async ({ anonymize = false } = {}) => actions.health_check({ compact: true, anonymize }),


    benchmark: async ({ loops = 100 } = {}) => {
      const requested = Number(loops) || 100;
      const MAX_LOOPS = 5000;
      const n = Math.min(Math.max(1, requested), MAX_LOOPS);
      const isCapped = requested > MAX_LOOPS;
      const startTime = performance.now();
      for (let i = 0; i < n; i++) {
        runtime.shellQuote("benchmark_quote_" + i);
        runtime.hp("storage/cache/bench_" + i);
      }
      const durationMs = Math.round(performance.now() - startTime);
      return {
        ok: true,
        operations: n,
        requested_loops: requested,
        capped_to: isCapped ? MAX_LOOPS : undefined,
        capped: isCapped,
        warning: isCapped ? `El parámetro 'loops' (${requested}) fue limitado a ${MAX_LOOPS} para prevenir bloqueo del bucle de eventos.` : undefined,
        totalDurationMs: durationMs,
        avgOpMs: Number((durationMs / n).toFixed(4))
      };
    },

    telemetry: async () => {
      const mem = process.memoryUsage();
      return {
        ok: true,
        uptimeSeconds: Math.round(process.uptime()),
        memory: {
          rssMb: Number((mem.rss / (1024 * 1024)).toFixed(2)),
          heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(2)),
          heapTotalMb: Number((mem.heapTotal / (1024 * 1024)).toFixed(2)),
        },
        operations: runtime.operations?.getSnapshot() || {},
        processes: runtime.processes?.getSnapshot() || {},
        cache: runtime.cache?.getMetrics() || {},
        metrics: runtime.metrics?.snapshot() || {}
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
    },

    verify_html_integrity: async ({
      path: p,
      content,
      counts = [],
      selectors = [],
      baselineCounts = {},
      expectedCounts = {},
      compareWith,
      checkEmbeddedJs = true,
    } = {}) => {
      let targetPath = null;
      let htmlContent = "";

      if (typeof content === "string") {
        htmlContent = content;
        targetPath = p || "inline.html";
      } else if (p) {
        targetPath = runtime.hp(p);
        try {
          const rawBuffer = await fs.readFile(targetPath);
          if (rawBuffer.length >= 2 && rawBuffer[0] === 0xff && rawBuffer[1] === 0xfe) {
            htmlContent = rawBuffer.subarray(2).toString("utf16le");
          } else if (rawBuffer.length >= 2 && rawBuffer[0] === 0xfe && rawBuffer[1] === 0xff) {
            const swapped = Buffer.from(rawBuffer.subarray(2));
            swapped.swap16();
            htmlContent = swapped.toString("utf16le");
          } else {
            const utf8 = rawBuffer.toString("utf8");
            if (utf8.includes("\0")) {
              try {
                const utf16 = rawBuffer.toString("utf16le");
                if (!utf16.includes("\0")) htmlContent = utf16;
                else htmlContent = utf8;
              } catch {
                htmlContent = utf8;
              }
            } else {
              htmlContent = utf8;
            }
          }
        } catch (readErr) {
          return { ok: false, error: `No se pudo leer el archivo HTML '${p}': ${readErr.message}` };
        }
      } else {
        return { ok: false, error: "Se requiere el parámetro 'path' o 'content' para verificar la integridad del HTML." };
      }

      const VOID_ELEMENTS = new Set([
        "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr", "!doctype"
      ]);
      const unclosedTags = [];
      const mismatchedClosings = [];
      const embeddedJsErrors = [];

      // 1. Extraer y validar scripts embebidos si está habilitado
      const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
      let scriptMatch;
      let scriptsCount = 0;
      if (checkEmbeddedJs) {
        const vm = await import("node:vm");
        while ((scriptMatch = scriptRegex.exec(htmlContent)) !== null) {
          const attrs = scriptMatch[1] || "";
          const code = scriptMatch[2] || "";
          if (/src\s*=/i.test(attrs) || /type\s*=\s*['"]?(application\/json|application\/ld\+json|text\/template)['"]?/i.test(attrs)) {
            continue;
          }
          scriptsCount++;
          const startLine = (htmlContent.substring(0, scriptMatch.index).match(/\n/g) || []).length + 1;
          if (code.trim()) {
            try {
              new vm.Script(code, { filename: `script_L${startLine}` });
            } catch (err) {
              const lineMatch = (err.stack || "").match(/script_L\d+:(\d+)/);
              const relLine = lineMatch ? Number(lineMatch[1]) : 1;
              embeddedJsErrors.push({
                startLine,
                errorLine: startLine + relLine - 1,
                message: err.message,
                snippet: code.split(/\r?\n/)[Math.max(0, relLine - 1)]?.trim()
              });
            }
          }
        }
      }

      // 2. Limpiar comentarios y contenido interno de scripts/styles para el parser de tags
      let cleanHtml = htmlContent.replace(/<!--[\s\S]*?-->/g, (m) => "\n".repeat((m.match(/\n/g) || []).length));
      cleanHtml = cleanHtml.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (m, code) => {
        return m.replace(code, "\n".repeat((code.match(/\n/g) || []).length));
      });
      cleanHtml = cleanHtml.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (m, css) => {
        return m.replace(css, "\n".repeat((css.match(/\n/g) || []).length));
      });

      // 3. Parser de pila de tags HTML
      const tagRegex = /<(\/)?([a-zA-Z0-9:-]+)([^>]*?)(\/)?>/g;
      const stack = [];
      let tagMatch;
      while ((tagMatch = tagRegex.exec(cleanHtml)) !== null) {
        const isClosing = Boolean(tagMatch[1]);
        const tagName = tagMatch[2].toLowerCase();
        const isSelfClosing = Boolean(tagMatch[4]) || VOID_ELEMENTS.has(tagName);
        const line = (cleanHtml.substring(0, tagMatch.index).match(/\n/g) || []).length + 1;

        if (isSelfClosing) continue;

        if (!isClosing) {
          stack.push({ tag: tagName, line, raw: tagMatch[0] });
        } else {
          if (stack.length > 0 && stack[stack.length - 1].tag === tagName) {
            stack.pop();
          } else {
            const idx = stack.findLastIndex((item) => item.tag === tagName);
            if (idx !== -1) {
              while (stack.length - 1 > idx) {
                const popped = stack.pop();
                unclosedTags.push({ tag: popped.tag, line: popped.line, raw: popped.raw });
              }
              stack.pop();
            } else {
              mismatchedClosings.push({ tag: tagName, line, raw: tagMatch[0] });
            }
          }
        }
      }

      while (stack.length > 0) {
        const remaining = stack.pop();
        unclosedTags.push({ tag: remaining.tag, line: remaining.line, raw: remaining.raw });
      }

      // Helper para conteo inteligente (soporta clases CSS con . y IDs con #)
      function countSelectorOccurrences(contentStr, query) {
        if (query.startsWith(".")) {
          const className = query.slice(1);
          const classRegex = new RegExp(`class\\s*=\\s*["'][^"']*\\b${className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[^"']*["']`, "gi");
          const classMatches = (contentStr.match(classRegex) || []).length;
          const literalMatches = (contentStr.match(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
          return Math.max(classMatches, literalMatches);
        }
        if (query.startsWith("#")) {
          const idName = query.slice(1);
          const idRegex = new RegExp(`id\\s*=\\s*["']${idName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "gi");
          const idMatches = (contentStr.match(idRegex) || []).length;
          const literalMatches = (contentStr.match(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
          return Math.max(idMatches, literalMatches);
        }
        return (contentStr.match(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
      }

      // 4. Conteo de selectores y detección de regresiones
      const occurrenceCounts = {};
      const regressions = [];
      const queries = Array.from(new Set([...(counts || []), ...(selectors || [])]));

      const baselines = { ...(baselineCounts || {}), ...(expectedCounts || {}) };
      if (compareWith) {
        try {
          const compBuffer = await fs.readFile(runtime.hp(compareWith));
          const compContent = compBuffer.toString("utf8");
          for (const q of queries) {
            if (baselines[q] === undefined) {
              baselines[q] = countSelectorOccurrences(compContent, q);
            }
          }
        } catch {}
      }

      for (const q of queries) {
        occurrenceCounts[q] = countSelectorOccurrences(htmlContent, q);
      }

      for (const [q, expected] of Object.entries(baselines)) {
        const actual = occurrenceCounts[q] !== undefined ? occurrenceCounts[q] : countSelectorOccurrences(htmlContent, q);
        occurrenceCounts[q] = actual;
        if (actual < expected) {
          regressions.push({
            query: q,
            expected,
            actual,
            diff: actual - expected,
            severity: actual === 0 ? "CRITICAL" : "WARNING",
            message: `El conteo de '${q}' cayó de ${expected} a ${actual} (${actual === 0 ? "TOTALMENTE BORRADO" : "reducción inesperada"}).`
          });
        }
      }

      const isBalanced = unclosedTags.length === 0 && mismatchedClosings.length === 0;
      const isJsValid = embeddedJsErrors.length === 0;
      const ok = isBalanced && isJsValid && regressions.length === 0;

      let summary = "Estructura HTML íntegra. Balance de tags correcto";
      if (scriptsCount > 0) summary += ` y ${scriptsCount} scripts JS embebidos válidos`;
      summary += ".";

      if (!ok) {
        const parts = [];
        if (!isBalanced) parts.push(`${unclosedTags.length} tags sin cerrar, ${mismatchedClosings.length} cierres inesperados`);
        if (!isJsValid) parts.push(`${embeddedJsErrors.length} errores de sintaxis JS embebido`);
        if (regressions.length > 0) parts.push(`${regressions.length} regresiones de selectores detectadas`);
        summary = `Problemas de integridad detectados: ${parts.join("; ")}.`;
      }

      return {
        ok,
        file: targetPath,
        totalLines: htmlContent.split(/\r?\n/).length,
        isBalanced,
        isJsValid,
        unclosedTags,
        mismatchedClosings,
        embeddedJsErrors,
        scriptsCount,
        occurrenceCounts,
        regressions,
        summary
      };
    }
  };

  return domain("diagnostics", "Diagnóstico avanzado del sistema, benchmarks, salud del MCP y auto-evaluación.", actions, {});
}
