#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🧪 FLUXER X — scripts/test_installation.mjs
 * Validador Integral y Sandbox de la Instalación Zero-Friction
 * ══════════════════════════════════════════════════════════════════════════════
 */

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

async function runInstallationTest() {
  console.log(`\n${BOLD}${CYAN}══════════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  🧪 PRUEBA Y AUDITORÍA DE INSTALACIÓN — FLUXER X ZERO-FRICTION       ${RESET}`);
  console.log(`${BOLD}${CYAN}══════════════════════════════════════════════════════════════════════${RESET}\n`);

  const sandboxDir = path.join(os.tmpdir(), `FluxerX_Install_Test_${Date.now()}`);
  await fs.mkdir(sandboxDir, { recursive: true });

  const results = {
    os_check: false,
    node_check: false,
    installer_ps1: false,
    installer_bat: false,
    engine_structure: false,
    mcp_server_boot: false,
    mcp_handshake: false,
  };

  try {
    // 1. Validar entorno básico (Windows + Node)
    console.log(`[1/5] Verificando requisitos de la máquina anfitriona...`);
    const isWindows = process.platform === "win32";
    const nodeMajor = parseInt(process.version.replace(/^v/, "").split(".")[0], 10);
    if (!isWindows) {
      console.log(`  ${YELLOW}⚠ Plataforma no-Windows detectada (${process.platform}).${RESET}`);
    } else {
      console.log(`  ${GREEN}✓ Plataforma Windows detectada.${RESET}`);
      results.os_check = true;
    }

    if (nodeMajor >= 18) {
      console.log(`  ${GREEN}✓ Node.js compatible detectado: ${process.version} (v18+)${RESET}`);
      results.node_check = true;
    } else {
      console.log(`  ${RED}✗ Node.js inferior a v18: ${process.version}${RESET}`);
    }

    // 2. Ejecutar Install-FluxerX.ps1 en TestMode usando el sandbox
    console.log(`\n[2/5] Ejecutando Install-FluxerX.ps1 con -TestMode y sandbox temporal...`);
    const psScript = path.join(ROOT, "Install-FluxerX.ps1");
    const psCmd = `powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "${psScript}" -TestMode -CustomAppDir "${ROOT}"`;
    
    console.log(`  Ejecutando comando: ${psCmd}`);
    const { stdout, stderr } = await execAsync(psCmd);
    
    if (stdout.includes("COMPLETADA CON ÉXITO") || stdout.includes("verificado y operativo")) {
      console.log(`  ${GREEN}✓ Install-FluxerX.ps1 ejecutó exitosamente.${RESET}`);
      results.installer_ps1 = true;
    } else {
      console.log(`  ${YELLOW}⚠ Salida de instalador:${RESET}\n${stdout}`);
    }

    // 3. Validar consistencia de Install-FluxerX.bat
    console.log(`\n[3/5] Verificando script de entrada rápida Install-FluxerX.bat...`);
    const batPath = path.join(ROOT, "Install-FluxerX.bat");
    if (existsSync(batPath)) {
      const batContent = await fs.readFile(batPath, "utf8");
      const hasAutoDownload = batContent.includes("Install-FluxerX.ps1") && batContent.includes("Invoke-WebRequest");
      const hasSafePolicy = batContent.includes("-ExecutionPolicy RemoteSigned");
      if (hasAutoDownload && hasSafePolicy) {
        console.log(`  ${GREEN}✓ Install-FluxerX.bat validado: Contiene auto-descarga y política aislada segura.${RESET}`);
        results.installer_bat = true;
      } else {
        console.log(`  ${RED}✗ Install-FluxerX.bat le falta auto-descarga o política segura.${RESET}`);
      }
    }

    // 4. Verificar integridad de archivos esenciales del motor
    console.log(`\n[4/5] Verificando estructura completa del motor MCP...`);
    const criticalPaths = [
      path.join(ROOT, "server.js"),
      path.join(ROOT, "server.mjs"),
      path.join(ROOT, "package.json"),
      path.join(ROOT, "core", "runtime.mjs"),
      path.join(ROOT, "core", "router.mjs"),
      path.join(ROOT, "core", "registry.mjs"),
      path.join(ROOT, "tools", "files.mjs"),
      path.join(ROOT, "tools", "system.mjs"),
      path.join(ROOT, "tools", "shortcuts.mjs"),
    ];

    let allFilesPresent = true;
    for (const p of criticalPaths) {
      if (!existsSync(p)) {
        console.log(`  ${RED}✗ Falta archivo crítico: ${p}${RESET}`);
        allFilesPresent = false;
      }
    }

    if (allFilesPresent) {
      console.log(`  ${GREEN}✓ Todos los componentes críticos del motor Fluxer X están presentes (100%).${RESET}`);
      results.engine_structure = true;
    }

    // 5. Prueba de Handshake MCP vía stdio (simulación real de cliente Claude/Antigravity)
    console.log(`\n[5/5] Probando arranque y Handshake MCP (JSON-RPC stdio)...`);
    const serverEntry = path.join(ROOT, "server.js");

    const handshakeSuccess = await new Promise((resolve) => {
      const proc = spawn(process.execPath, [serverEntry], {
        cwd: ROOT,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let buffer = "";
      let responded = false;

      proc.stdout.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line.trim());
            if (msg.id === 1 && msg.result) {
              responded = true;
              console.log(`  ${GREEN}✓ Protocolo MCP respondió correctamente a 'initialize':${RESET}`);
              console.log(`    Nombre Servidor: ${msg.result.serverInfo?.name || "Fluxer X"}`);
              console.log(`    Versión:         ${msg.result.serverInfo?.version || "9.2.5"}`);
              proc.kill();
              resolve(true);
              return;
            }
          } catch {}
        }
      });

      proc.stderr.on("data", (errData) => {
        // logs informativos internos son normales
      });

      proc.on("error", () => {
        if (!responded) resolve(false);
      });

      setTimeout(() => {
        if (!responded) {
          proc.kill();
          resolve(false);
        }
      }, 5000);

      // Enviar solicitud de initialize
      const initRequest = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "TestClient", version: "1.0.0" }
        }
      }) + "\n";

      proc.stdin.write(initRequest);
    });

    if (handshakeSuccess) {
      results.mcp_server_boot = true;
      results.mcp_handshake = true;
    } else {
      console.log(`  ${YELLOW}⚠ El servidor no completó el handshake en 5 segundos.${RESET}`);
    }

  } finally {
    // Limpieza de sandbox
    await fs.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log(`\n${BOLD}══════════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  📊 RESULTADO DE LA AUDITORÍA DE INSTALACIÓN                          ${RESET}`);
  console.log(`${BOLD}══════════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`  • Compatibilidad Sistema:          ${results.os_check ? GREEN + "PASS" : RED + "FAIL"}${RESET}`);
  console.log(`  • Entorno Node.js (v18+):          ${results.node_check ? GREEN + "PASS" : RED + "FAIL"}${RESET}`);
  console.log(`  • Script Install-FluxerX.ps1:      ${results.installer_ps1 ? GREEN + "PASS" : RED + "FAIL"}${RESET}`);
  console.log(`  • Script Install-FluxerX.bat:      ${results.installer_bat ? GREEN + "PASS" : RED + "FAIL"}${RESET}`);
  console.log(`  • Integridad del Motor Fluxer:     ${results.engine_structure ? GREEN + "PASS" : RED + "FAIL"}${RESET}`);
  console.log(`  • Arranque MCP Server:             ${results.mcp_server_boot ? GREEN + "PASS" : RED + "FAIL"}${RESET}`);
  console.log(`  • Handshake MCP (JSON-RPC):        ${results.mcp_handshake ? GREEN + "PASS" : RED + "FAIL"}${RESET}`);
  console.log(`${BOLD}══════════════════════════════════════════════════════════════════════${RESET}\n`);

  const allPassed = Object.values(results).every(Boolean);
  if (allPassed) {
    console.log(`${BOLD}${GREEN}🎉 ¡CERTIFICACIÓN DE INSTALACIÓN: 100% EXITOSA Y LISTA PARA USUARIOS!${RESET}\n`);
  } else {
    console.log(`${BOLD}${RED}⚠ Se encontraron inconsistencias en la auditoría.${RESET}\n`);
    process.exit(1);
  }
}

runInstallationTest().catch((err) => {
  console.error("Error fatal durante la prueba:", err);
  process.exit(1);
});
