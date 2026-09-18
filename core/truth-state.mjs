/**
 * 🪟 AERON FLUXER X — core/truth-state.mjs
 * Motor de Capas de Verdad de Estado (Truth State Engine).
 * Desacopla estrictamente: LOCAL STATE != REMOTE API STATE != EFFECTIVE/OBSERVED STATE.
 */

export const STATE_LAYERS = Object.freeze({
  EXPECTED: "EXPECTED",
  LOCAL: "LOCAL",
  REMOTE: "REMOTE",
  ACTUAL: "ACTUAL",
  OBSERVED: "OBSERVED",
  VERIFIED: "VERIFIED",
});

export class TruthStateEngine {
  constructor({ runtime }) {
    this.runtime = runtime;
  }

  /**
   * Reconstruye y compara el estado en las 3 capas independientes
   */
  reconstructTruth({ expected = {}, local = {}, remote = {}, observed = {} } = {}) {
    const isLocalMatchingExpected = this.deepCompare(expected, local);
    const isRemoteMatchingExpected = this.deepCompare(expected, remote);
    const isObservedMatchingExpected = this.deepCompare(expected, observed);

    const isFullyVerified = isRemoteMatchingExpected && (Object.keys(observed).length === 0 || isObservedMatchingExpected);

    return {
      layers: {
        expected,
        local,
        remote,
        observed,
      },
      matchStatus: {
        localMatchesExpected: isLocalMatchingExpected,
        remoteMatchesExpected: isRemoteMatchingExpected,
        observedMatchesExpected: isObservedMatchingExpected,
        fullyVerified: isFullyVerified,
      },
      verdict: isFullyVerified
        ? STATE_LAYERS.VERIFIED
        : isRemoteMatchingExpected
        ? STATE_LAYERS.REMOTE
        : isLocalMatchingExpected
        ? STATE_LAYERS.LOCAL
        : STATE_LAYERS.EXPECTED,
    };
  }

  deepCompare(obj1, obj2) {
    if (obj1 === obj2) return true;
    if (!obj1 || !obj2 || typeof obj1 !== "object" || typeof obj2 !== "object") return false;

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length === 0 && keys2.length === 0) return true;

    for (const key of keys1) {
      if (obj1[key] !== undefined && String(obj1[key]) !== String(obj2[key])) return false;
    }
    return true;
  }
}
