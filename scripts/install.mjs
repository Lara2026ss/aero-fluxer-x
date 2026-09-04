#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚀 AERON FLUXER X — scripts/install.mjs
 * Instalador y Asistente de Configuración Inicial Limpia y Multiplataforma
 * ══════════════════════════════════════════════════════════════════════════════
 */

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";

import { CURRENT_VERSION, BRAND_NAME, APP_NAME } from "../core/version.mjs";
import { resolveUserDataDir, ensureUserDataInitialized, getStorageStructure } from "../core/storage-paths.mjs";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

async function main() {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║     ${BRAND_NAME.toUpperCase()} — INSTALADOR Y ASISTENTE v${CURRENT_VERSION}     ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${RESET}\n`);

  let allChecksPassed = true;

  // 1. Comprobar Versión de Node.js
  const nodeVer = process.version;
  const major = parseInt(nodeVer.replace(/^v/, "").split(".")[0], 10);
  if (major < 18) {
    console.log(`  ${RED}✗ Node.js:${RESET} Se requiere Node.js v18.0.0 o superior (instalado: ${nodeVer}).`);
    allChecksPassed = false;
  } else {
    console.log(`  ${GREEN}✓ Node.js:${RESET} ${nodeVer} (Compatible)`);
  }

  // 2. Comprobar Plataforma
  const platform = process.platform;
  const release = os.release();
  if (platform === "win32") {
    console.log(`  ${GREEN}✓ Sistema Operativo:${RESET} Windows (${release}) — Modo Nativo Completo`);
  } else {
    console.log(`  ${YELLOW}⚠ Sistema Operativo:${RESET} ${platform} (${release}) — Modo Adaptativo Multiplataforma`);
  }

  // 3. Comprobar / Instalar Dependencias
  const nodeModulesPath = path.join(ROOT, "node_modules");
  if (!existsSync(nodeModulesPath)) {
    console.log(`  ${CYAN}➜ Instalando dependencias de Node.js (npm install)...${RESET}`);
    try {
      await execAsync("npm install --production", { cwd: ROOT });
      console.log(`  ${GREEN}✓ Dependencias:${RESET} Instaladas correctamente.`);
    } catch (e) {
      console.log(`  ${RED}✗ Error al instalar dependencias:${RESET} ${e.message}`);
      allChecksPassed = false;
    }
  } else {
    console.log(`  ${GREEN}✓ Dependencias:${RESET} node_modules presente.`);
  }

  // 4. Inicializar Directorio de Datos del Usuario
  console.log(`  ${CYAN}➜ Inicializando almacenamiento aislado de usuario...${RESET}`);
  const userStorage = await ensureUserDataInitialized(ROOT);
  console.log(`  ${GREEN}✓ Directorio de datos del usuario:${RESET} ${userStorage.base}`);
  console.log(`  ${GREEN}✓ Atajos locales:${RESET} ${userStorage.shortcutsFile}`);
  console.log(`  ${GREEN}✓ Base de datos memoria:${RESET} ${userStorage.memoryDb}`);
  console.log(`  ${GREEN}✓ Logs:${RESET} ${userStorage.mainLog}`);

  // 5. Crear plantilla de configuración de usuario si no existe
  if (!existsSync(userStorage.configFile)) {
    const defaultTemplate = {
      "$schema": path.join(ROOT, "config", "aeron.schema.json"),
      "version": CURRENT_VERSION,
      "mcp": { "transport": "stdio", "serverName": APP_NAME },
      "http": { "port": 8765, "host": "127.0.0.1", "enabled": true },
      "security": { "mode": "NORMAL", "trustedClient": false, "confirmDangerousActions": true },
      "logging": { "level": "info", "auditEnabled": true, "maxLogLines": 1000 }
    };
    await fs.writeFile(userStorage.configFile, JSON.stringify(defaultTemplate, null, 2), "utf8").catch(() => {});
    if (userStorage.legacyConfigFile && !existsSync(userStorage.legacyConfigFile)) {
      await fs.writeFile(userStorage.legacyConfigFile, JSON.stringify(defaultTemplate, null, 2), "utf8").catch(() => {});
    }
    console.log(`  ${GREEN}✓ Configuración local creada:${RESET} ${userStorage.configFile}`);
  } else {
    console.log(`  ${GREEN}✓ Configuración local existente preservada:${RESET} ${userStorage.configFile}`);
  }

  // 6. Diagnóstico de Salud Inicial
  console.log(`\n  ${CYAN}➜ Ejecutando diagnóstico de integridad inicial (doctor suave)...${RESET}`);
  try {
    const { stdout } = await execFileAsync(process.execPath, [path.join(ROOT, "doctor.mjs"), "--quick"], { cwd: ROOT });
    if (stdout.includes("OPERATIVO Y VERIFICADO") || stdout.includes("Invariantes Cumplidas")) {
      console.log(`  ${GREEN}✓ Auto-diagnóstico:${RESET} Todas las invariantes verificadas con éxito.`);
    } else {
      console.log(`  ${YELLOW}⚠ Auto-diagnóstico finalizado con advertencias.${RESET}`);
    }
  } catch (err) {
    console.log(`  ${RED}✗ Fallo en auto-diagnóstico:${RESET} ${err.message}`);
    allChecksPassed = false;
  }

  if (!allChecksPassed) {
    console.log(`\n${RED}Instalación completada con observaciones. Revise los errores antes de conectar el cliente.${RESET}\n`);
    process.exit(1);
  }

  // 7. Generar Snippet de Configuración MCP
  const serverJsPath = path.join(ROOT, "server.js");
  console.log(`\n${BOLD}${GREEN}================================================================${RESET}`);
  console.log(`${BOLD}${GREEN}🎉 ¡AERON FLUXER X v${CURRENT_VERSION} INSTALADO Y PREPARADO CON ÉXITO!${RESET}`);
  console.log(`${BOLD}${GREEN}================================================================${RESET}\n`);

  console.log(`${BOLD}Para configurar Aero Fluxer X en Claude Desktop u otro cliente MCP:${RESET}\n`);
  console.log(`Añada la siguiente entrada a su archivo ${CYAN}claude_desktop_config.json${RESET}:\n`);

  const mcpConfig = {
    mcpServers: {
      "Aeron Fluxer X": {
        command: "node",
        args: [serverJsPath],
      },
    },
  };

  console.log(`${CYAN}${JSON.stringify(mcpConfig, null, 2)}${RESET}\n`);
  console.log(`Ubicación típica de configuración en Windows:`);
  console.log(`  ${YELLOW}%APPDATA%\\Claude\\claude_desktop_config.json${RESET}\n`);
  console.log(`Ubicación típica en Linux / macOS:`);
  console.log(`  ${YELLOW}~/.config/Claude/claude_desktop_config.json${RESET}\n`);
  console.log(`Para probar el servidor manualmente:`);
  console.log(`  ${BOLD}node server.js${RESET} o ${BOLD}npm start${RESET}\n`);
}

main().catch((err) => {
  console.error(`\n${RED}[ERROR FATAL EN INSTALADOR]:${RESET}`, err);
  process.exit(1);
});
