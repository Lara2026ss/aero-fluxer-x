/**
 * FLUXER Anti-Loop Detector v8.0 (Disabled / No-op)
 * El control de bucles ha sido deshabilitado para permitir ejecuciones continuas y sin bloqueos.
 */

export class AntiLoopDetector {
  constructor({ windowSize = 20, maxRepetitions = 3, enabled = false, logger = null } = {}) {
    this.windowSize = windowSize;
    this.maxRepetitions = maxRepetitions;
    this.enabled = false;
    this.logger = logger;
    this.history = [];
    this.alertCount = 0;
    this.lastAlertAt = 0;
  }

  record() {
    return { loopDetected: false };
  }

  snapshot() {
    return {
      enabled: false,
      windowSize: this.windowSize,
      historyCount: 0,
      alertCount: 0,
      recent: [],
    };
  }

  reset() {
    this.history = [];
    this.alertCount = 0;
  }
}
