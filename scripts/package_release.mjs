#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 📦 AERON FLUXER X — scripts/package_release.mjs
 * Generador Oficial de Paquete de Distribución Limpia, Checksum y Manifest
 * ══════════════════════════════════════════════════════════════════════════════
 */

import fs from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { CURRENT_VERSION, BRAND_NAME } from "../core/version.mjs";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");

async function computeSha256(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex").toLowerCase();
}

async function packageRelease() {
  console.log(`\n📦 Empaquetando Aero Fluxer X v${CURRENT_VERSION} para Distribución Pública...`);

  await fs.mkdir(DIST_DIR, { recursive: true });

  const stagingDir = path.join(DIST_DIR, `staging-v${CURRENT_VERSION}`);
  await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(stagingDir, { recursive: true });

  // 1. Archivos raíz esenciales
  const rootFiles = [
    "package.json",
    "package-lock.json",
    "README.md",
    "LICENSE",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CHANGELOG.md",
    "server.js",
    "server.mjs",
    "doctor.mjs",
    "update.mjs",
    "shortcuts.example.json",
    "shortcuts.template.json",
    "aeron.config.example.json",
    "aeron.config.json",
    "Install-FluxerX.bat",
    "Install-FluxerX.ps1",
    "FLUXER_X_TOOL_AUDIT.md",
    "PUBLIC_RELEASE_AUDIT.md",
    ".env.example",
    ".gitignore",
    "start_aeron.bat",
    "start_aeron.ps1",
  ];

  for (const f of rootFiles) {
    const src = path.join(ROOT, f);
    if (existsSync(src)) {
      await fs.cp(src, path.join(stagingDir, f));
    }
  }

  // 2. Carpetas esenciales
  const directories = [
    "core",
    "tools",
    "doctor",
    "contracts",
    "config",
    "docs",
    "scripts",
    "tests",
    "plugins",
    "installer",
  ];

  for (const d of directories) {
    const src = path.join(ROOT, d);
    if (existsSync(src)) {
      await fs.cp(src, path.join(stagingDir, d), { recursive: true });
    }
  }

  // 3. Crear el archivo ZIP empaquetado
  const zipName = `FluxerX-v${CURRENT_VERSION}-Portable.zip`;
  const compatZipName = `fluxer-x-v${CURRENT_VERSION}.zip`;
  const zipPath = path.join(DIST_DIR, zipName);
  const compatZipPath = path.join(DIST_DIR, compatZipName);
  await fs.rm(zipPath, { force: true }).catch(() => {});
  await fs.rm(compatZipPath, { force: true }).catch(() => {});

  console.log(`  Comprimiendo artefacto portable en: ${zipPath}...`);
  const isWin = process.platform === "win32";
  if (isWin) {
    const psCmd = `powershell -NoProfile -NonInteractive -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipPath}' -Force"`;
    await execAsync(psCmd);
  } else {
    await execAsync(`cd "${stagingDir}" && zip -r -q "${zipPath}" .`);
  }

  // Copia de compatibilidad para updater automático
  await fs.copyFile(zipPath, compatZipPath).catch(() => {});

  // Copiar scripts directos a dist para descarga individual
  const directBatPath = path.join(DIST_DIR, "Install-FluxerX.bat");
  await fs.copyFile(path.join(ROOT, "Install-FluxerX.bat"), directBatPath).catch(() => {});
  const directPs1Path = path.join(DIST_DIR, "Install-FluxerX.ps1");
  await fs.copyFile(path.join(ROOT, "Install-FluxerX.ps1"), directPs1Path).catch(() => {});

  // 4. Calcular Checksum SHA-256
  const sha256 = await computeSha256(zipPath);
  const sha256Bat = await computeSha256(directBatPath);
  const checksumFileName = "checksums.sha256";
  const checksumFilePath = path.join(DIST_DIR, checksumFileName);
  const checksumContent = `${sha256}  ${zipName}\n${sha256}  ${compatZipName}\n${sha256Bat}  Install-FluxerX.bat\n`;
  await fs.writeFile(checksumFilePath, checksumContent, "utf8");
  console.log(`  ✓ SHA-256 (${zipName}): ${sha256}`);
  console.log(`  ✓ SHA-256 (Install-FluxerX.bat): ${sha256Bat}`);

  // 5. Generar Release Manifest
  const manifest = {
    version: CURRENT_VERSION,
    tag: `v${CURRENT_VERSION}`,
    channel: "experimental-public",
    product: "Fluxer Core",
    release_date: new Date().toISOString(),
    release_type: "experimental-public",
    minimum_node_version: ">=18.0.0",
    platform_support: ["windows", "linux", "darwin"],
    artifacts: {
      installer: {
        name: "Install-FluxerX.bat",
        sha256: sha256Bat,
        size_bytes: (await fs.stat(directBatPath)).size,
        description: "Instalador automático en 1 clic para Windows 11 con pre-flight checks y auto-test."
      },
      portable: {
        name: zipName,
        sha256,
        size_bytes: (await fs.stat(zipPath)).size,
        description: "Paquete portable completo para despliegues manuales y servidores MCP."
      }
    },
    breakingChanges: [
      {
        action: "run_project_tests",
        domain: "developer",
        oldLevel: "user",
        newLevel: "poweruser",
        migration: "Usar security.start_workflow({ level: 'poweruser', durationMinutes: 5 }) antes de ejecutar tests."
      },
      {
        action: "run_command",
        domain: "terminal",
        oldLevel: "user",
        newLevel: "poweruser",
        migration: "Usar security.start_workflow({ level: 'poweruser', durationMinutes: 5 }) antes de ejecutar comandos arbitrarios."
      }
    ],
    changelog: [
      "v10.2.0 Project X — Public Release Ready: Granular Permissions, Neutral Human Confirmation & Sanitized Paths",
      "v10.1.5 Experimental Public Release — Enterprise Polish & Zero-Friction",
      "Token Compression Inteligente: poda selectiva sin eliminar errores ni stack traces (sanitizeAndPrune, compactFormatter, smartTruncate)",
      "Motor de Terminal Windows 11 Production-Grade: detección pwsh/powershell/cmd, UTF-8 estricto sin mojibake, drenado continuo de streams y terminación de árboles",
      "Sandbox Inteligente: smart whitelist (CWD, Desktop, Documents, Downloads, Temp) con fs.realpathSync.native(), bloqueo ADS y dispositivos reservados",
      "Descubrimiento Ultrarrápido: acción search_tools para que cualquier IA encuentre herramientas en <15ms",
      "Instalador Bat Dinámico: pre-flight checks amigables, descarga con retry y merge seguro de configuración para Claude Desktop, Antigravity y Cursor",
      "Doctor Engine ampliado a 20 invariantes de auto-integridad activas (INV-001..INV-020)"
    ]
  };

  const manifestPath = path.join(DIST_DIR, "release-manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`  ✓ Release manifest generado en: ${manifestPath}`);

  // Limpiar staging temporal
  await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});

  console.log(`\n🎉 Paquetes generados exitosamente:`);
  console.log(`  - Motor Completo (Portable): ${zipPath}`);
  console.log(`  - Alias Compatibilidad:      ${compatZipPath}`);
  console.log(`  - Instalador BAT directo:    ${directBatPath}`);
  console.log(`  - Instalador PS1 directo:    ${directPs1Path}`);
  console.log(`  - Manifest Oficial:          ${manifestPath}`);
  console.log(`  - Checksums SHA-256:         ${checksumFilePath}\n`);

  return { zipPath, sha256, manifestPath };
}

packageRelease().catch((err) => {
  console.error("Error al empaquetar release:", err);
  process.exit(1);
});
