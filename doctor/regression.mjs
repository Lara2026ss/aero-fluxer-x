/**
 * 🩺 AERON FLUXER X DOCTOR — doctor/regression.mjs
 * Guardián de Regresión y Comparación contra Baseline (reports/doctor-baseline.json).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

export async function runRegressionCheck(currentReport, baselinePath = path.join("reports", "doctor-baseline.json")) {
  if (!existsSync(baselinePath)) {
    // Si no existe baseline, guardar el actual como baseline inicial
    await fs.mkdir(path.dirname(baselinePath), { recursive: true });
    await fs.writeFile(baselinePath, JSON.stringify(currentReport, null, 2), "utf8");
    return {
      baselineCreated: true,
      hasRegressions: false,
      regressions: [],
      note: "Baseline inicial creado en reports/doctor-baseline.json",
    };
  }

  try {
    const raw = await fs.readFile(baselinePath, "utf8");
    const baseline = JSON.parse(raw);
    const regressions = [];

    // 1. Comparar herramientas eliminadas o fallando
    const baselineTools = new Set(baseline.matrix?.map(t => t.tool) || []);
    const currentTools = new Set(currentReport.matrix?.map(t => t.tool) || []);

    for (const tool of baselineTools) {
      if (!currentTools.has(tool)) {
        regressions.push(`Herramienta eliminada o no registrada: ${tool}`);
      }
    }

    // 2. Comparar fallos nuevos
    const baselineFails = baseline.summary?.fail || 0;
    const currentFails = currentReport.summary?.fail || 0;
    if (currentFails > baselineFails) {
      regressions.push(`Aumento en herramientas fallidas: ${baselineFails} -> ${currentFails}`);
    }

    return {
      baselineCreated: false,
      hasRegressions: regressions.length > 0,
      regressions,
      note: regressions.length === 0 ? "Sin regresiones detectadas respecto a baseline." : `${regressions.length} regresión(es) detectadas.`,
    };
  } catch (err) {
    return {
      baselineCreated: false,
      hasRegressions: true,
      regressions: [`Error leyendo baseline: ${err.message}`],
    };
  }
}
