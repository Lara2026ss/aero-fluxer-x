const ONE_HOUR = 60 * 60 * 1000;

export class Session {
  constructor({ memory, logger }) {
    this.memory = memory;
    this.logger = logger;
    this.activeUntil = 0;
  }

  grant(minutes = 60) {
    this.activeUntil =
      Date.now() +
      Math.min(Math.max(Number(minutes) || 60, 1), 240) * 60 * 1000;
    this.logger.info("session_granted", {
      activeUntil: new Date(this.activeUntil).toISOString(),
    });
    return this.status();
  }

  revoke() {
    this.activeUntil = 0;
    this.logger.info("session_revoked");
    return this.status();
  }

  isActive() {
    return Date.now() < this.activeUntil;
  }

  remainingMinutes() {
    return this.isActive()
      ? Math.ceil((this.activeUntil - Date.now()) / 60000)
      : 0;
  }

  status() {
    return {
      active: this.isActive(),
      remainingMinutes: this.remainingMinutes(),
    };
  }

  defaultDurationMs() {
    return ONE_HOUR;
  }
}
