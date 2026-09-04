/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🏷️ AERON FLUXER X — core/version.mjs
 * Única Fuente de Verdad y Motor de Semantic Versioning (SemVer 2.0).
 * ══════════════════════════════════════════════════════════════════════════════
 */

export const CURRENT_VERSION = "9.2.6";
export const APP_NAME = "fluxer-x";
export const BRAND_NAME = "Fluxer X";
export const LEGACY_APP_NAME = "aeron-fluxer-x";
export const LEGACY_BRAND_NAME = "Aeron Fluxer X";

/**
 * Parsea una cadena de versión SemVer.
 * Acepta formatos como: "9.0.0", "v9.0.0", "9.2.5-1", "v9.1.2-hotfix.1", "v9.1.2-beta.1"
 *
 * @param {string} ver Cadena de versión
 * @returns {{ major: number, minor: number, patch: number, prerelease: string|null, hotfix: string|null, isHotfix: boolean, hotfixNum: number, raw: string } | null}
 */
export function parseSemVer(ver) {
  if (!ver || typeof ver !== "string") return null;
  const clean = ver.trim().replace(/^v/i, "");
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?$/);
  if (!match) return null;

  const rawSuffix = match[4] || null;
  let isHotfix = false;
  let hotfixNum = 0;

  if (rawSuffix) {
    // Si el sufijo es numérico puro (ej: "-1", "-2", "-3") o contiene hotfix/patch/rev/fix
    if (/^\d+$/.test(rawSuffix)) {
      isHotfix = true;
      hotfixNum = parseInt(rawSuffix, 10);
    } else {
      const hMatch = rawSuffix.match(/^(?:hotfix|patch|rev|fix)[.-]?(\d+)?$/i);
      if (hMatch) {
        isHotfix = true;
        hotfixNum = hMatch[1] ? parseInt(hMatch[1], 10) : 1;
      }
    }
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: isHotfix ? null : rawSuffix,
    hotfix: isHotfix ? rawSuffix : null,
    isHotfix,
    hotfixNum,
    raw: ver.trim(),
  };
}

/**
 * Compara dos versiones SemVer teniendo en cuenta números de hotfix (-1, -2, etc.).
 * @param {string} v1 Primera versión
 * @param {string} v2 Segunda versión
 * @returns {number} 1 si v1 > v2, -1 si v1 < v2, 0 si son iguales
 */
export function compareSemVer(v1, v2) {
  const p1 = parseSemVer(v1);
  const p2 = parseSemVer(v2);

  if (!p1 && !p2) return 0;
  if (!p1) return -1;
  if (!p2) return 1;

  if (p1.major !== p2.major) return p1.major > p2.major ? 1 : -1;
  if (p1.minor !== p2.minor) return p1.minor > p2.minor ? 1 : -1;
  if (p1.patch !== p2.patch) return p1.patch > p2.patch ? 1 : -1;

  // Manejo de Hotfixes: un hotfix (ej: "9.2.5-1") es posterior y mayor a la versión base ("9.2.5")
  if (p1.isHotfix && !p2.isHotfix && !p2.prerelease) {
    return 1;
  }
  if (!p1.isHotfix && !p1.prerelease && p2.isHotfix) {
    return -1;
  }
  if (p1.isHotfix && p2.isHotfix) {
    if (p1.hotfixNum !== p2.hotfixNum) {
      return p1.hotfixNum > p2.hotfixNum ? 1 : -1;
    }
  }

  // Prerelease handling tradicional (alpha, beta, rc): una versión sin prerelease es mayor que una con prerelease
  if (p1.prerelease && !p2.prerelease) return -1;
  if (!p1.prerelease && p2.prerelease) return 1;
  if (p1.prerelease && p2.prerelease) {
    return p1.prerelease.localeCompare(p2.prerelease);
  }

  return 0;
}

/**
 * Determina el tipo de diferencia entre dos versiones.
 * @param {string} current Versión base
 * @param {string} candidate Versión a comparar
 * @returns {'major' | 'minor' | 'patch' | 'hotfix' | 'prerelease' | 'downgrade' | 'none' | 'invalid'}
 */
export function getDiffType(current, candidate) {
  const c = parseSemVer(current);
  const n = parseSemVer(candidate);
  if (!c || !n) return "invalid";

  const cmp = compareSemVer(candidate, current);
  if (cmp < 0) return "downgrade";
  if (cmp === 0) return "none";

  if (n.major > c.major) return "major";
  if (n.minor > c.minor) return "minor";
  if (n.patch > c.patch) return "patch";
  if (n.isHotfix) return "hotfix";
  if (n.prerelease) return "prerelease";
  return "patch";
}

/**
 * Evalúa si una versión candidata es apta y segura para actualizar.
 * Previene downgrades accidentales e identifica versiones incompatibles.
 *
 * @param {string} current Versión actualmente instalada
 * @param {string} candidate Versión objetivo
 * @param {object} [options]
 * @param {boolean} [options.allowDowngrade=false] Permitir downgrade forzado
 * @param {boolean} [options.allowPrerelease=false] Permitir versiones de prueba
 * @returns {{
 *   eligible: boolean,
 *   diffType: string,
 *   isDowngrade: boolean,
 *   isMajor: boolean,
 *   isCompatible: boolean,
 *   reason: string
 * }}
 */
export function checkUpdateEligibility(current, candidate, options = {}) {
  const { allowDowngrade = false, allowPrerelease = false } = options;
  const c = parseSemVer(current);
  const n = parseSemVer(candidate);

  if (!c || !n) {
    return {
      eligible: false,
      diffType: "invalid",
      isDowngrade: false,
      isMajor: false,
      isCompatible: false,
      reason: `Formato de versión SemVer inválido (actual: "${current}", candidato: "${candidate}").`,
    };
  }

  const diffType = getDiffType(current, candidate);

  if (diffType === "none") {
    return {
      eligible: false,
      diffType,
      isDowngrade: false,
      isMajor: false,
      isCompatible: true,
      reason: `Ya se encuentra en la versión más reciente (${candidate}).`,
    };
  }

  if (diffType === "downgrade") {
    if (!allowDowngrade) {
      return {
        eligible: false,
        diffType,
        isDowngrade: true,
        isMajor: false,
        isCompatible: false,
        reason: `Downgrade bloqueado por seguridad: la versión candidata (${candidate}) es anterior a la instalada (${current}).`,
      };
    }
  }

  if (n.prerelease && !n.isHotfix && !allowPrerelease) {
    return {
      eligible: false,
      diffType,
      isDowngrade: false,
      isMajor: false,
      isCompatible: true,
      reason: `Versión candidata es un pre-release (${candidate}) y no se especificó permitir versiones preliminares.`,
    };
  }

  const isMajor = diffType === "major";
  return {
    eligible: true,
    diffType,
    isDowngrade: diffType === "downgrade",
    isMajor,
    isCompatible: !isMajor,
    reason: isMajor
      ? `Actualización mayor disponible (${candidate}). Puede incluir cambios arquitectónicos importantes.`
      : `Actualización ${diffType} disponible y compatible (${candidate}).`,
  };
}

/**
 * Obtiene la versión actual única de Aero Fluxer X.
 * @returns {string}
 */
export function getVersion() {
  return CURRENT_VERSION;
}

/**
 * Retorna un objeto descriptivo con toda la información de versión del sistema.
 */
export function getVersionInfo() {
  const parsed = parseSemVer(CURRENT_VERSION);
  return {
    name: APP_NAME,
    brand: BRAND_NAME,
    version: CURRENT_VERSION,
    tag: `v${CURRENT_VERSION}`,
    parsed,
    platform: process.platform,
    nodeVersion: process.version,
  };
}
