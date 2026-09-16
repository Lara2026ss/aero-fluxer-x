#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚡ FLUXER XZ (V4.0 Architecture) — core/updater/standalone_updater.mjs
 * Detached External Bootstrap Process for Windows Atomic Updates.
 * Solves the Windows file-locking problem by executing outside the main MCP server process.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import fs from "node:fs/promises";
import { existsSync, createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";

async function copyRecursive(src, dest) {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src);
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    await fs.copyFile(src, dest);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let stagingDir = null;
  let targetDir = null;
  let serverPid = null;
  let backupDir = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--staging" && args[i + 1]) stagingDir = args[++i];
    else if (args[i] === "--target" && args[i + 1]) targetDir = args[++i];
    else if (args[i] === "--pid" && args[i + 1]) serverPid = parseInt(args[++i], 10);
    else if (args[i] === "--backup" && args[i + 1]) backupDir = args[++i];
  }

  if (!stagingDir || !targetDir) {
    process.stderr.write("[StandaloneUpdater] Missing required --staging and --target arguments.\n");
    process.exit(1);
  }

  // 1. If PID was passed, wait for server to exit
  if (serverPid && !isNaN(serverPid)) {
    let waited = 0;
    while (waited < 15) {
      try {
        process.kill(serverPid, 0); // Check if alive
        await new Promise((r) => setTimeout(r, 500));
        waited++;
      } catch {
        break; // Process is dead
      }
    }
  }

  // Brief grace sleep to ensure file handles are released by Windows
  await new Promise((r) => setTimeout(r, 1000));

  try {
    // 2. Copy staged files to target directory
    const entries = await fs.readdir(stagingDir);
    for (const entry of entries) {
      if (entry === "node_modules" || entry === ".git") continue;
      const srcPath = path.join(stagingDir, entry);
      const destPath = path.join(targetDir, entry);
      await copyRecursive(srcPath, destPath);
    }

    // 3. Post-replacement syntax verification
    const checkRes = spawnSync("node", ["--check", path.join(targetDir, "server.mjs")], {
      encoding: "utf8",
      timeout: 10000,
    });

    if (checkRes.status !== 0) {
      process.stderr.write(`[StandaloneUpdater] Syntax validation failed post-update: ${checkRes.stderr}\n`);
      // Trigger rollback if backupDir exists
      if (backupDir && existsSync(backupDir)) {
        process.stderr.write("[StandaloneUpdater] Rolling back to backup snapshot...\n");
        const bkpEntries = await fs.readdir(backupDir);
        for (const b of bkpEntries) {
          await copyRecursive(path.join(backupDir, b), path.join(targetDir, b));
        }
      }
      process.exit(1);
    }

    // 4. Clean up staging directory
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    process.stdout.write("[StandaloneUpdater] Update applied and verified successfully.\n");
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[StandaloneUpdater] Error applying update: ${err.message}\n`);
    process.exit(1);
  }
}

main();
