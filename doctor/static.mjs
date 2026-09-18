/**
 * 🩺 AERON FLUXER X DOCTOR — doctor/static.mjs
 * Análisis estático de código, sintaxis e inspección de patrones de bypass.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

const execAsync = promisify(exec);

export async function checkCommand(cmd, timeoutMs = 5000) {
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

export async function runStaticAnalysis(rootPath, filesToScan = []) {
  const findings = [];
  let checkedCount = 0;

  for (const file of filesToScan) {
    const fullPath = path.isAbsolute(file) ? file : path.join(rootPath, file);
    if (!existsSync(fullPath)) continue;

    checkedCount++;
    const content = await fs.readFile(fullPath, "utf8").catch(() => "");
    const lines = content.split(/\r?\n/);

    lines.forEach((line, idx) => {
      // 1. Detección de return { success: true } / return { ok: true } sin datos o evidencia
      if (line.includes("return { success: true }") || line.includes("return { ok: true }")) {
        // Verificar si la línea o contexto inmediato tiene comprobación
        const isVerifiedPattern = line.includes("receipt") || line.includes("evidence") || line.includes("verification");
        if (!isVerifiedPattern && file.startsWith("tools/")) {
          findings.push({
            file,
            line: idx + 1,
            code: "VERIFICATION_BYPASS_DETECTED",
            snippet: line.trim(),
            description: "Respuesta positiva incondicional detectada sin comprobación de estado real.",
          });
        }
      }

      // 2. Detección de mutaciones que omiten invalidateCache
      if ((line.includes("write") || line.includes("delete") || line.includes("set_")) && line.includes("async")) {
        if (!content.includes("invalidate") && !content.includes("cachePolicy") && file.startsWith("tools/")) {
          findings.push({
            file,
            line: idx + 1,
            code: "CACHE_BYPASS_MISSING",
            snippet: line.trim(),
            description: "Función mutante sin invalidación ni bypass explícito de caché.",
          });
        }
      }
    });
  }

  return {
    checkedCount,
    findingsCount: findings.length,
    findings,
    clean: findings.length === 0,
  };
}
