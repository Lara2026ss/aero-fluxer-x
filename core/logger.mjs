import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export class Logger {
  constructor({
    dir,
    version,
    brand = "FLUXER",
    maxBytes = 1024 * 1024,
    keep = 5,
  }) {
    this.dir = dir;
    this.version = version;
    this.brand = brand;
    this.maxBytes = maxBytes;
    this.keep = keep;
    this.file = path.join(dir, "flux.log");
    this.stream = null;
    this.bytesWritten = 0;
    this.debugEnabled =
      String(process.env.FLUXER_DEBUG).toLowerCase() === "true";
  }

  initStream() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const legacyFile = path.join(this.dir, "assistant.log");
      if (!fs.existsSync(this.file) && fs.existsSync(legacyFile)) {
        try {
          fs.renameSync(legacyFile, this.file);
        } catch {}
      }
      this.rotateIfNeededSync();
      this.stream = fs.createWriteStream(this.file, {
        flags: "a",
        encoding: "utf8",
      });
      try {
        const stat = fs.statSync(this.file);
        this.bytesWritten = stat.size;
      } catch {
        this.bytesWritten = 0;
      }
    } catch (e) {
      process.stderr.write(
        `[${this.brand} Logger Error] initStream failed: ${e.message}\n`,
      );
    }
  }

  rotateIfNeededSync() {
    try {
      const stat = fs.statSync(this.file);
      if (stat.size < this.maxBytes) return;
    } catch (e) {
      return; // El archivo no existe
    }

    for (let i = this.keep - 1; i >= 1; i -= 1) {
      try {
        fs.renameSync(`${this.file}.${i}`, `${this.file}.${i + 1}`);
      } catch (e) {}
    }
    try {
      fs.renameSync(this.file, `${this.file}.1`);
    } catch (e) {}
  }

  write(level, event, data = {}) {
    // Silenciar debug si FLUXER_DEBUG no está activo
    if (level === "debug" && !this.debugEnabled) return;
    if (!this.stream) this.initStream();

    // Extraer campos estándar de data para posicionarlos primero en el JSON
    const {
      request_id = crypto.randomUUID(),
      client,
      tool,
      action,
      elapsed_ms,
      cache_hit,
      retry_count,
      permission_level,
      queue_size,
      ...rest
    } = data;

    const entry = {
      ts: new Date().toISOString(),
      level,
      event,
      version: this.version,
      // Campos estructurados estándar — siempre presentes, null si no aplican
      request_id: request_id ?? null,
      client: client ?? null,
      tool: tool ?? null,
      action: action ?? null,
      elapsed_ms: elapsed_ms ?? null,
      cache_hit: cache_hit ?? null,
      retry_count: retry_count ?? null,
      permission_level: permission_level ?? null,
      queue_size: queue_size ?? null,
      // Resto de campos de data
      ...rest,
    };

    const line = JSON.stringify(entry) + "\n";
    const lineBytes = Buffer.byteLength(line, "utf8");

    if (this.stream) {
      this.stream.write(line);
      this.bytesWritten += lineBytes;
    } else {
      process.stderr.write(`[${this.brand} Log Fallback] ${line}`);
    }

    if (level === "error") {
      process.stderr.write(`[${this.brand}] ${event}: ${data.error ?? ""}\n`);
    }

    if (this.bytesWritten >= this.maxBytes && this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }

  async close() {
    if (!this.stream) return;
    const stream = this.stream;
    this.stream = null;
    await new Promise((resolve) => {
      stream.end(resolve);
    }).catch(() => {});
  }

  info(event, data) {
    this.write("info", event, data);
  }
  warn(event, data) {
    this.write("warn", event, data);
  }
  error(event, data) {
    this.write("error", event, data);
  }
  debug(event, data) {
    this.write("debug", event, data);
  }
}
