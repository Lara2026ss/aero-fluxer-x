/**
 * 🩺 AERON FLUXER X DOCTOR — doctor/invariants.mjs
 * Evaluador de las 10 Invariantes Obligatorias (INV-001 a INV-010).
 */

export const INVARIANTS = Object.freeze({
  INV_001: { id: "INV-001", name: "No False PASS", description: "HTTP 200 con discrepancia en estado remoto no debe retornar PASS." },
  INV_002: { id: "INV-002", name: "No PASS Without Evidence", description: "Estado VERIFIED sin objeto de evidencia suficiente retorna EVIDENCE_MISSING." },
  INV_003: { id: "INV-003", name: "No PASS From Cache Alone", description: "Verificación post-mutación requiere cacheBypassed == true." },
  INV_004: { id: "INV-004", name: "No PASS With Unknown Identity", description: "Deploy/commit con identidad no determinable retorna DEPLOY_IDENTITY_UNCERTAIN." },
  INV_005: { id: "INV-005", name: "No Cross-Operation Contamination", description: "Evidencia de operationId A no puede validar operationId B." },
  INV_006: { id: "INV-006", name: "No Cross-Deploy Contamination", description: "Datos de deployId A no pueden validar deployId B." },
  INV_007: { id: "INV-007", name: "No Stale Evidence", description: "Logs/commits anteriores a la operación no pueden ser usados como evidencia." },
  INV_008: { id: "INV-008", name: "No Partial Verification As Success", description: "Verificación incompleta o faltante retorna UNKNOWN/PARTIAL, nunca PASS." },
  INV_009: { id: "INV-009", name: "Repair Requires Reverification", description: "Toda reparación sin re-test post-verificación permanece UNVERIFIED." },
  INV_010: { id: "INV-010", name: "Doctor Must Detect Its Own Broken Verification", description: "El auto-test del Doctor detecta respuestas 200 falsas o caché corrupta." },
  INV_011: { id: "INV-011", name: "Process Termination Verification", description: "La terminación de proceso requiere verificación física con process.kill(pid, 0) o ausencia en sistema." },
  INV_012: { id: "INV-012", name: "Critical Process Protection", description: "PIDs 0, 4, el propio proceso y servicios críticos del SO son invariablemente bloqueados contra terminación." },
  INV_013: { id: "INV-013", name: "File Mutation Physical Verification", description: "Escrituras y transformaciones de archivo requieren verificación física de tamaño en disco > 0." },
  INV_014: { id: "INV-014", name: "Git Identity Integrity", description: "Cambios de identidad en Git deben verificarse físicamente leyendo la configuración local del repo." },
  INV_015: { id: "INV-015", name: "FTS5 Secret Redaction", description: "Tokens, claves y credenciales privadas deben ser automáticamente redactadas antes de persistir en memoria FTS5." },
  INV_016: { id: "INV-016", name: "Structured Git Status Cleanliness", description: "git_status_structured clasifica deterministamente cambios en staged, unstaged y untracked sin omitir archivos." },
  INV_017: { id: "INV-017", name: "Process Hierarchy Determinism", description: "process_tree produce un árbol padre-hijo no cíclico con atributos de proceso válidos." },
  INV_018: { id: "INV-018", name: "Port Ownership Determinism", description: "inspect_port_owner determina inequívocamente el PID propietario o confirma que el puerto está libre." },
  INV_019: { id: "INV-019", name: "Cache In-Flight Deduplication", description: "Llamadas simultáneas a la misma clave comparten una única ejecución en curso sin ejecuciones duplicadas." },
  INV_020: { id: "INV-020", name: "Deterministic Operation Id Tracing", description: "Toda mutación u operación procesada por OperationEngine genera y propaga un operationId trazable." },
});

export function checkInvariant(invId, condition, details = {}) {
  const inv = INVARIANTS[invId] || { id: invId, name: invId, description: "" };
  return {
    id: inv.id,
    name: inv.name,
    passed: Boolean(condition),
    details: details || {},
    description: inv.description,
  };
}
