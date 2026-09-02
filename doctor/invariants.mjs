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
