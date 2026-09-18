/**
 * 🩺 AERON FLUXER X DOCTOR — doctor/reporting.mjs
 * Generador de Reportes Exhaustivos en reports/*.
 */

import fs from "node:fs/promises";
import path from "node:path";

export async function generateDoctorReports({
  summary,
  matrix,
  selfTestResult,
  adversarialResult,
  staticFindings,
  regressionResult,
} = {}) {
  const reportsDir = path.join(process.cwd(), "reports");
  await fs.mkdir(reportsDir, { recursive: true });

  const timestamp = new Date().toISOString();

  // 1. doctor-summary.json
  const summaryData = {
    version: "9.0.0",
    timestamp,
    status: summary.fail === 0 ? "HEALTHY" : "DEGRADED",
    totalAudited: summary.totalAudited || 187,
    summary,
    selfTestPassed: selfTestResult?.ok || false,
    adversarialPassed: adversarialResult?.ok || false,
    staticClean: staticFindings?.clean || false,
  };
  await fs.writeFile(path.join(reportsDir, "doctor-summary.json"), JSON.stringify(summaryData, null, 2), "utf8");

  // 2. tool-matrix.json
  await fs.writeFile(path.join(reportsDir, "tool-matrix.json"), JSON.stringify(matrix || [], null, 2), "utf8");

  // 3. failures.json
  const failures = (matrix || []).filter(r => r.result === "FAIL");
  await fs.writeFile(path.join(reportsDir, "failures.json"), JSON.stringify(failures, null, 2), "utf8");

  // 4. stale-deploys.json
  const staleDeploys = (matrix || []).filter(r => r.verificationStatus === "STALE_DEPLOY_DETECTED");
  await fs.writeFile(path.join(reportsDir, "stale-deploys.json"), JSON.stringify(staleDeploys, null, 2), "utf8");

  // 5. cache-audit.json
  const cacheAudit = (matrix || []).filter(r => r.cacheBypassed !== undefined);
  await fs.writeFile(path.join(reportsDir, "cache-audit.json"), JSON.stringify(cacheAudit, null, 2), "utf8");

  // 6. verification-audit.json
  const verificationAudit = (matrix || []).map(r => ({ tool: r.tool, status: r.verificationStatus || r.result, receipt: r.receipt || null }));
  await fs.writeFile(path.join(reportsDir, "verification-audit.json"), JSON.stringify(verificationAudit, null, 2), "utf8");

  // 7. adversarial-report.json
  await fs.writeFile(path.join(reportsDir, "adversarial-report.json"), JSON.stringify(adversarialResult || {}, null, 2), "utf8");

  // 8. regression-report.json
  await fs.writeFile(path.join(reportsDir, "regression-report.json"), JSON.stringify(regressionResult || {}, null, 2), "utf8");

  // 9. doctor-summary.md
  let md = `# 🩺 AERON FLUXER X — DOCTOR SUMMARY REPORT\n\n`;
  md += `**Fecha:** ${timestamp}\n`;
  md += `**Estado Global:** \`${summaryData.status}\`\n\n`;
  md += `### 📊 Resultados de Auditoría\n`;
  md += `- **Herramientas Descubiertas:** ${summary.totalAudited || 187}\n`;
  md += `- **PASS (Verificadas con Recibo & Evidencia):** ${summary.pass || 0}\n`;
  md += `- **FAIL:** ${summary.fail || 0}\n`;
  md += `- **PARTIAL:** ${summary.partial || 0}\n`;
  md += `- **UNKNOWN:** ${summary.unknown || 0}\n`;
  md += `- **UNSUPPORTED:** ${summary.unsupported || 0}\n`;
  md += `- **SKIPPED_SAFE_LIMIT:** ${summary.skipped || 0}\n\n`;

  md += `### 🛡️ Auto-Test del Doctor & Invariantes\n`;
  md += `- **Self-Test 10/10 Invariantes (INV-001..INV-010):** ${selfTestResult?.ok ? "🟢 PASADO" : "🔴 FALLIDO"}\n`;
  md += `- **Verificación Adversarial (Pruebas de Falsos 200):** ${adversarialResult?.ok ? "🟢 PASADO" : "🔴 FALLIDO"}\n`;
  md += `- **Análisis Estático de Bypass:** ${staticFindings?.clean ? "🟢 LIMPIO" : `🟡 ${staticFindings?.findingsCount || 0} hallazgo(s)`}\n`;
  md += `- **Guardián de Regresión:** ${regressionResult?.note || "N/A"}\n`;

  await fs.writeFile(path.join(reportsDir, "doctor-summary.md"), md, "utf8");

  return {
    reportsGenerated: 9,
    summaryPath: path.join(reportsDir, "doctor-summary.md"),
  };
}
