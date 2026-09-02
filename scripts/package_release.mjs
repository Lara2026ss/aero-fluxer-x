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
    "aeron.config.example.json",
    "aeron.config.json",
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
  ];

  for (const d of directories) {
    const src = path.join(ROOT, d);
    if (existsSync(src)) {
      await fs.cp(src, path.join(stagingDir, d), { recursive: true });
    }
  }

  // 3. Crear el archivo ZIP empaquetado
  const zipName = `aeron-fluxer-x-v${CURRENT_VERSION}.zip`;
  const zipPath = path.join(DIST_DIR, zipName);
  await fs.rm(zipPath, { force: true }).catch(() => {});

  console.log(`  Comprimiendo artefacto limpio en: ${zipPath}...`);
  const isWin = process.platform === "win32";
  if (isWin) {
    // Usar PowerShell Compress-Archive sobre el contenido del staging
    const psCmd = `powershell -NoProfile -NonInteractive -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipPath}' -Force"`;
    await execAsync(psCmd);
  } else {
    await execAsync(`cd "${stagingDir}" && zip -r -q "${zipPath}" .`);
  }

  // 4. Calcular Checksum SHA-256
  const sha256 = await computeSha256(zipPath);
  const checksumFileName = "checksums.sha256";
  const checksumFilePath = path.join(DIST_DIR, checksumFileName);
  const checksumContent = `${sha256}  ${zipName}\n`;
  await fs.writeFile(checksumFilePath, checksumContent, "utf8");
  console.log(`  ✓ SHA-256: ${sha256}`);

  // 5. Generar Release Manifest
  const manifest = {
    version: CURRENT_VERSION,
    tag: `v${CURRENT_VERSION}`,
    release_date: new Date().toISOString(),
    release_type: "stable",
    minimum_node_version: ">=18.0.0",
    platform_support: ["windows", "linux", "darwin"],
    artifact: {
      name: zipName,
      sha256,
      size_bytes: (await fs.stat(zipPath)).size,
    },
    changelog: [
      "v9.0.0 Release Candidate — Public Distribution Hardening",
      "Arquitectura de almacenamiento aislado (%APPDATA% / XDG)",
      "Cero secretos y remoción de rutas absolutas locales",
      "10 Dominios MCP modulares con 197 herramientas verificadas",
      "Actualizador automático seguro con verificación SHA-256 y rollback preventivo",
      "Instalador asistido multiplataforma (npm run setup)",
      "Auto-diagnóstico granular con PASS, WARN, FAIL, NOT_APPLICABLE",
    ],
    integrity_verification: {
      algorithm: "SHA-256",
      signature_mode: "SHA-256 Manifest Digest",
      publisher_signature_status: "WARN: GPG / Minisign publisher signature recommended for production registry",
    },
  };

  const manifestPath = path.join(DIST_DIR, "release-manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`  ✓ Manifest generado en: ${manifestPath}`);

  // Limpiar staging temporal
  await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});

  console.log(`\n🎉 Paquete generado exitosamente:`);
  console.log(`  - ZIP:       ${zipPath}`);
  console.log(`  - CHECKSUM:  ${checksumFilePath}`);
  console.log(`  - MANIFEST:  ${manifestPath}\n`);

  return { zipPath, sha256, manifestPath };
}

packageRelease().catch((err) => {
  console.error("Error al empaquetar release:", err);
  process.exit(1);
});
