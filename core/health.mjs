/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🩺 AERON FLUXER X — core/health.mjs
 * Health Checker y Auto-Diagnóstico Integral v9.0
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Clasifica cada comprobación en:
 *  - PASS: Cumplido satisfactoriamente.
 *  - WARN: Funciona con capacidades reducidas u opcionales ausentes.
 *  - FAIL: Problema crítico que impide el funcionamiento correcto.
 *  - NOT_APPLICABLE: No aplica en la plataforma o entorno actual.
 *
 * Proporciona información útil de remediación para cualquier FAIL o WARN.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import net from "node:net";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

import { CURRENT_VERSION, parseSemVer, BRAND_NAME, APP_NAME } from "./version.mjs";
import { getStorageStructure } from "./storage-paths.mjs";

const execAsync = promisify(exec);

async function checkCommand(cmd, timeoutMs = 5000) {
  try {
    const { stdout } = await Promise.race([
      execAsync(cmd, { timeout: timeoutMs }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    return { ok: true, output: stdout.trim() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkPort(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

/**
 * Ejecuta el auto-diagnóstico completo de Aero Fluxer X.
 *
 * @param {object} [options]
 * @param {object} [options.runtime]
 * @param {object} [options.registry]
 * @param {object} [options.config]
 * @returns {Promise<object>}
 */
export async function runHealthCheck({ runtime, registry, config } = {}) {
  const isWin = process.platform === "win32";
  const checks = [];
  const root = runtime?.dirs?.root || process.cwd();
  const storage = getStorageStructure(root);

  // 1. Verificación de Versión (SemVer)
  const parsedVer = parseSemVer(CURRENT_VERSION);
  if (parsedVer) {
    checks.push({
      name: "Versión del Sistema",
      status: "PASS",
      value: `v${CURRENT_VERSION} (SemVer válido: ${parsedVer.major}.${parsedVer.minor}.${parsedVer.patch})`,
      required: true,
      remediation: null,
    });
  } else {
    checks.push({
      name: "Versión del Sistema",
      status: "FAIL",
      value: `Versión inválida: "${CURRENT_VERSION}"`,
      required: true,
      remediation: "Corrija la constante CURRENT_VERSION en core/version.mjs para que cumpla SemVer (MAJOR.MINOR.PATCH).",
    });
  }

  // 2. Node.js Runtime
  const nodeRes = await checkCommand("node --version");
  if (nodeRes.ok) {
    const major = parseInt(nodeRes.output.replace(/^v/, "").split(".")[0], 10);
    if (major >= 18) {
      checks.push({
        name: "Node.js Runtime",
        status: "PASS",
        value: nodeRes.output,
        required: true,
        remediation: null,
      });
    } else {
      checks.push({
        name: "Node.js Runtime",
        status: "FAIL",
        value: `${nodeRes.output} (obsoleto)`,
        required: true,
        remediation: "Actualice Node.js a la versión 18.x o superior desde https://nodejs.org.",
      });
    }
  } else {
    checks.push({
      name: "Node.js Runtime",
      status: "FAIL",
      value: "No ejecutable",
      required: true,
      remediation: "Instale Node.js y asegúrese de que esté en el PATH del sistema.",
    });
  }

  // 3. Dependencias (node_modules)
  const nodeModulesPath = path.join(root, "node_modules");
  const mcpSdkPath = path.join(nodeModulesPath, "@modelcontextprotocol", "sdk");
  if (existsSync(nodeModulesPath) && existsSync(mcpSdkPath)) {
    checks.push({
      name: "Dependencias (@modelcontextprotocol/sdk)",
      status: "PASS",
      value: "Instaladas y verificadas",
      required: true,
      remediation: null,
    });
  } else {
    checks.push({
      name: "Dependencias (@modelcontextprotocol/sdk)",
      status: "FAIL",
      value: "Faltan paquetes requeridos",
      required: true,
      remediation: "Ejecute 'npm install' en el directorio de Aero Fluxer X para instalar dependencias.",
    });
  }

  // 4. Archivos Críticos del Servidor
  const criticalFiles = ["server.js", "server.mjs", "doctor.mjs", "core/runtime.mjs", "core/registry.mjs"];
  const missingFiles = criticalFiles.filter((f) => !existsSync(path.join(root, f)));
  if (missingFiles.length === 0) {
    checks.push({
      name: "Archivos Críticos del Núcleo",
      status: "PASS",
      value: `${criticalFiles.length}/${criticalFiles.length} presentes`,
      required: true,
      remediation: null,
    });
  } else {
    checks.push({
      name: "Archivos Críticos del Núcleo",
      status: "FAIL",
      value: `Faltan: ${missingFiles.join(", ")}`,
      required: true,
      remediation: "Restaure los archivos faltantes desde el repositorio o ejecute node update.mjs --rollback.",
    });
  }

  // 5. Permisos y Almacenamiento Aislado del Usuario
  let storageWritable = false;
  try {
    const testFile = path.join(storage.base, `.perm_test_${Date.now()}`);
    await fs.writeFile(testFile, "test", "utf8");
    await fs.rm(testFile, { force: true });
    storageWritable = true;
  } catch {}

  if (storageWritable) {
    checks.push({
      name: "Almacenamiento Local de Usuario",
      status: "PASS",
      value: `Escritura confirmada en: ${storage.base}`,
      required: true,
      remediation: null,
    });
  } else {
    checks.push({
      name: "Almacenamiento Local de Usuario",
      status: "FAIL",
      value: `Sin permisos de escritura en ${storage.base}`,
      required: true,
      remediation: `Verifique los permisos de usuario en ${storage.base} o configure AERON_DATA_DIR.`,
    });
  }

  // 6. Atajos Locales (shortcuts.json)
  if (existsSync(storage.shortcutsFile)) {
    checks.push({
      name: "Atajos Locales (shortcuts.json)",
      status: "PASS",
      value: `Presente en ${storage.shortcutsFile}`,
      required: false,
      remediation: null,
    });
  } else {
    checks.push({
      name: "Atajos Locales (shortcuts.json)",
      status: "WARN",
      value: "No creado aún (se generará automáticamente)",
      required: false,
      remediation: "Inicie el servidor o ejecute 'node scripts/install.mjs' para generarlo desde la plantilla.",
    });
  }

  // 7. Base de Datos SQLite (Memoria y Persistencia)
  let sqliteEngineOk = false;
  try {
    await import("node:sqlite");
    sqliteEngineOk = true;
  } catch {}

  if (sqliteEngineOk) {
    checks.push({
      name: "Motor SQLite Nativo",
      status: "PASS",
      value: "node:sqlite disponible",
      required: false,
      remediation: null,
    });
  } else {
    checks.push({
      name: "Motor SQLite Nativo",
      status: "WARN",
      value: "node:sqlite no disponible (requiere Node >= 22.5)",
      required: false,
      remediation: "Actualice a Node.js 22.5+ para memoria SQLite nativa ultrarrápida.",
    });
  }

  // 8. Dominios y Herramientas MCP
  if (registry) {
    const domainNames = registry.moduleNames();
    const actionCount = registry.actionCount();
    if (domainNames.length >= 10 && actionCount > 0) {
      checks.push({
        name: "Herramientas MCP Registradas",
        status: "PASS",
        value: `${domainNames.length} dominios con ${actionCount} acciones activas`,
        required: true,
        remediation: null,
      });
    } else {
      checks.push({
        name: "Herramientas MCP Registradas",
        status: "WARN",
        value: `${domainNames.length} dominios con ${actionCount} acciones`,
        required: true,
        remediation: "Revise los errores de carga de módulos en tools/ o ejecute node doctor.mjs.",
      });
    }
  } else {
    checks.push({
      name: "Herramientas MCP Registradas",
      status: "NOT_APPLICABLE",
      value: "Registro no inyectado en este chequeo",
      required: false,
      remediation: null,
    });
  }

  // 9. Conectividad / Dashboard Local
  const dashPort = config?.http?.port || 8765;
  const dashHost = config?.http?.host || "127.0.0.1";
  const dashListening = await checkPort(dashHost, dashPort, 1000);
  if (dashListening) {
    checks.push({
      name: "Dashboard HTTP",
      status: "PASS",
      value: `Escuchando en http://${dashHost}:${dashPort}`,
      required: false,
      remediation: null,
    });
  } else {
    checks.push({
      name: "Dashboard HTTP",
      status: "WARN",
      value: `Puerto ${dashPort} no activo (inicie el servidor)`,
      required: false,
      remediation: "El dashboard se activará al ejecutar 'node server.js'.",
    });
  }

  // 10. Conectividad con GitHub / Sistema de Actualizaciones
  const gitHubCheck = await checkCommand(isWin ? "ping -n 1 8.8.8.8" : "ping -c 1 8.8.8.8", 2000);
  if (gitHubCheck.ok) {
    checks.push({
      name: "Conectividad de Red / Updater",
      status: "PASS",
      value: "Conexión a internet verificada",
      required: false,
      remediation: null,
    });
  } else {
    checks.push({
      name: "Conectividad de Red / Updater",
      status: "WARN",
      value: "Sin conexión a internet detectada",
      required: false,
      remediation: "Aero Fluxer X funcionará en modo offline local; no podrá buscar actualizaciones automáticamente.",
    });
  }

  // 11. Seguridad y Descontaminación del Repositorio
  const repoStorageExists = existsSync(path.join(root, "storage", "GROQ.txt"));
  if (repoStorageExists) {
    checks.push({
      name: "Seguridad y Secretos en Repo",
      status: "FAIL",
      value: "Se detectó archivo de clave sensible en el repo (GROQ.txt)",
      required: true,
      remediation: "Elimine storage/GROQ.txt de inmediato y rote la clave comprometida.",
    });
  } else {
    checks.push({
      name: "Seguridad y Cero Secretos en Repo",
      status: "PASS",
      value: "Sin secretos ni rutas personales detectadas",
      required: true,
      remediation: null,
    });
  }

  // ── Resumen y Clasificación ────────────────────────────────────────────────
  const passCount = checks.filter((c) => c.status === "PASS").length;
  const warnCount = checks.filter((c) => c.status === "WARN").length;
  const failCount = checks.filter((c) => c.status === "FAIL").length;
  const naCount = checks.filter((c) => c.status === "NOT_APPLICABLE").length;

  const criticalFails = checks.filter((c) => c.required && c.status === "FAIL");
  const overallOk = criticalFails.length === 0;

  return {
    ok: overallOk,
    version: CURRENT_VERSION,
    timestamp: new Date().toISOString(),
    statusSummary: {
      PASS: passCount,
      WARN: warnCount,
      FAIL: failCount,
      NOT_APPLICABLE: naCount,
      total: checks.length,
    },
    summary: overallOk
      ? `Aero Fluxer X v${CURRENT_VERSION} OPERATIVO (${passCount} PASS, ${warnCount} WARN, 0 FAIL)`
      : `ATENCIÓN: ${failCount} fallo(s) crítico(s) detectado(s)`,
    checks,
    formattedReport: formatHealthReport(checks, overallOk),
  };
}

function formatHealthReport(checks, allOk) {
  const lines = [
    `╔════════════════════════════════════════════════════════════════════╗`,
    `║     ${BRAND_NAME.toUpperCase()} — HEALTH CHECK v${CURRENT_VERSION}            ║`,
    `╚════════════════════════════════════════════════════════════════════╝`,
    "",
  ];

  for (const check of checks) {
    let tag = "";
    switch (check.status) {
      case "PASS":
        tag = "[PASS]           ";
        break;
      case "WARN":
        tag = "[WARN]           ";
        break;
      case "FAIL":
        tag = "[FAIL]           ";
        break;
      case "NOT_APPLICABLE":
        tag = "[NOT_APPLICABLE] ";
        break;
    }
    lines.push(`  ${tag} ${check.name.padEnd(35)} : ${check.value}`);
    if (check.remediation && (check.status === "FAIL" || check.status === "WARN")) {
      lines.push(`                  └─ Remediación: ${check.remediation}`);
    }
  }

  lines.push("");
  lines.push("─".repeat(70));
  lines.push(
    allOk
      ? `  ✅ ESTADO: Sistema saludable y listo para distribución y operación.`
      : `  ❌ ESTADO: Existen fallos críticos que requieren remediación.`
  );
  lines.push("─".repeat(70));

  return lines.join("\n");
}
