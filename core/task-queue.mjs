export const PRIORITY = Object.freeze({
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
});
const PRIORITY_KEYS = ["CRITICAL", "HIGH", "NORMAL", "LOW"];

export class TaskQueue {
  constructor({ concurrency = 4, maxQueue = 250 } = {}) {
    this.concurrency = concurrency;
    this.maxQueue = maxQueue;
    this.active = 0;
    this.queues = { CRITICAL: [], HIGH: [], NORMAL: [], LOW: [] };
    this.closed = false;
  }

  /** Número total de tareas esperando en cola (sin contar las activas). */
  get queueSize() {
    return PRIORITY_KEYS.reduce((s, k) => s + this.queues[k].length, 0);
  }

  /** Desglose de tareas pendientes por nivel de prioridad. */
  queueSnapshot() {
    return Object.fromEntries(
      PRIORITY_KEYS.map((k) => [k, this.queues[k].length]),
    );
  }

  /**
   * Encola una tarea.
   * @param {Function} task - Función async a ejecutar.
   * @param {object} [opts]
   * @param {'CRITICAL'|'HIGH'|'NORMAL'|'LOW'} [opts.priority='NORMAL'] - Prioridad de despacho.
   * @param {AbortSignal} [opts.signal] - Signal para cancelar la tarea antes o durante ejecución.
   * @returns {Promise}
   */
  run(task, { priority = "NORMAL", signal } = {}) {
    if (this.closed) return Promise.reject(new Error("task queue is closed"));

    if (this.queueSize >= this.maxQueue)
      return Promise.reject(
        new Error(
          `runtime busy — queue full (${this.maxQueue} slots). Try again later.`,
        ),
      );

    return new Promise((resolve, reject) => {
      // Cancelación inmediata si el signal ya fue abortado
      if (signal?.aborted) return reject(signal.reason ?? new Error("aborted"));

      const item = { task, resolve, reject, signal, _abort: null, priority };

      // Handler de aborto: saca el item de la cola y rechaza la promesa
      item._abort = () => {
        const q = this.queues[priority];
        const idx = q.indexOf(item);
        if (idx !== -1) q.splice(idx, 1);
        reject(signal.reason ?? new Error("aborted"));
      };
      signal?.addEventListener("abort", item._abort, { once: true });

      this.queues[priority].push(item);
      this.drain();
    });
  }

  drain() {
    while (this.active < this.concurrency) {
      const item = this._shift();
      if (!item) break;

      this.active++;
      const { task, resolve, reject, signal, _abort } = item;

      // Limpiar listener antes de ejecutar
      signal?.removeEventListener("abort", _abort);

      // Si fue cancelado justo antes de llegar aquí, rechazar sin ejecutar
      if (signal?.aborted) {
        this.active--;
        reject(signal.reason ?? new Error("aborted"));
        this.drain();
        continue;
      }

      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          this.active--;
          this.drain();
        });
    }
  }

  /** Extrae la siguiente tarea en orden de prioridad descendente. */
  _shift() {
    for (const k of PRIORITY_KEYS) {
      if (this.queues[k].length) return this.queues[k].shift();
    }
    return null;
  }

  shutdown() {
    this.closed = true;
    for (const q of Object.values(this.queues))
      for (const item of q.splice(0))
        item.reject(new Error("task queue shutdown"));
  }
}
