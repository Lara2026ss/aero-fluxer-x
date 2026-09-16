/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🎹 FLUXER XZ (V4.0 Architecture) — core/flstudio/bridge.mjs
 * Bidirectional IPC Bridge to FL Studio 2026 Native Python Scripting.
 * Dual-Transport: Non-blocking TCP Socket (127.0.0.1:49152) + Atomic Mailbox Fallback.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import net from "node:net";
import fs from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const BRIDGE_PORT = 49152;
const BRIDGE_HOST = "127.0.0.1";

export class FlStudioBridge {
  constructor({ runtime = null } = {}) {
    this.runtime = runtime;
    this.storageDir = runtime?.dirs?.storage
      ? path.join(runtime.dirs.storage, "fl_session")
      : path.join(process.cwd(), "storage", "fl_session");

    this.commandsFile = path.join(this.storageDir, "live_commands.json");
    this.resultFile = path.join(this.storageDir, "live_result.json");
    this.socket = null;
    this.connected = false;
  }

  async ensureStorage() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (_) {}
  }

  isFlRunning() {
    try {
      const out = execSync(
        'powershell -NoProfile -Command "(Get-Process -Name FL64 -ErrorAction SilentlyContinue) | Select-Object -ExpandProperty Id"',
        { encoding: "utf8", timeout: 2500 }
      ).trim();
      if (out) {
        const pid = parseInt(out.split(/\r?\n/)[0], 10);
        return !isNaN(pid) ? pid : null;
      }
    } catch (_) {}
    return null;
  }

  /**
   * Sends a command via TCP socket if available, otherwise writes to atomic mailbox
   */
  async sendCommand(command = {}, { timeoutMs = 3500 } = {}) {
    await this.ensureStorage();

    const pid = this.isFlRunning();
    if (!pid) {
      return {
        ok: false,
        code: "FL_NOT_RUNNING",
        error: "FL Studio (FL64.exe) is not running on host.",
        summary: "FL Studio is closed. Run flstudio { operation: 'open' } first.",
      };
    }

    // 1. Try TCP Socket Transport
    try {
      const socketRes = await this._sendViaSocket(command, timeoutMs);
      if (socketRes && socketRes.status === "ok") {
        return {
          ok: true,
          transport: "socket",
          data: socketRes,
          summary: socketRes.msg || `Command '${command.action}' executed in FL Studio via socket.`,
        };
      }
    } catch (_) {
      // Socket failed or not listening, seamlessly fall through to atomic mailbox
    }

    // 2. Atomic Mailbox Fallback
    try {
      const mailboxRes = await this._sendViaMailbox(command, timeoutMs);
      return mailboxRes;
    } catch (err) {
      return {
        ok: false,
        code: "BRIDGE_TIMEOUT",
        error: `Bridge communication failed: ${err.message}`,
        summary: "FL Studio is running, but the Fluxer Bridge script did not respond. Check MIDI Settings > Controller script in FL Studio.",
      };
    }
  }

  _sendViaSocket(command, timeoutMs) {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let timer = null;
      let rawData = "";

      timer = setTimeout(() => {
        client.destroy();
        reject(new Error("Socket timeout"));
      }, timeoutMs);

      client.connect(BRIDGE_PORT, BRIDGE_HOST, () => {
        const payload = JSON.stringify(command) + "\n";
        client.write(payload);
      });

      client.on("data", (chunk) => {
        rawData += chunk.toString("utf8");
        if (rawData.includes("\n")) {
          clearTimeout(timer);
          client.destroy();
          try {
            resolve(JSON.parse(rawData.trim()));
          } catch (e) {
            reject(e);
          }
        }
      });

      client.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async _sendViaMailbox(command, timeoutMs) {
    const tmpCmd = path.join(this.storageDir, `live_cmd_${Date.now()}.tmp`);
    const cmdPayload = {
      ...command,
      _id: `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      ts: Date.now() / 1000,
    };

    // Atomic write
    await fs.writeFile(tmpCmd, JSON.stringify(cmdPayload, null, 2), "utf8");
    await fs.rename(tmpCmd, this.commandsFile);

    const start = Date.now();
    const pollIntervalMs = 50;

    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));

      if (existsSync(this.resultFile)) {
        try {
          const content = await fs.readFile(this.resultFile, "utf8");
          const parsed = JSON.parse(content);
          if (parsed && (parsed.action === command.action || parsed.status)) {
            return {
              ok: parsed.status === "ok" || parsed.status === "ready",
              transport: "mailbox",
              data: parsed,
              summary: parsed.msg || `FL Studio processed command '${command.action}'.`,
            };
          }
        } catch (_) {}
      }
    }

    return {
      ok: false,
      code: "MAILBOX_TIMEOUT",
      error: `FL Studio did not pick up mailbox command within ${timeoutMs}ms.`,
      transport: "mailbox",
    };
  }

  async getBridgeStatus() {
    await this.ensureStorage();
    const pid = this.isFlRunning();
    let mailboxReady = false;
    let lastResult = null;

    if (existsSync(this.resultFile)) {
      try {
        const raw = await fs.readFile(this.resultFile, "utf8");
        lastResult = JSON.parse(raw);
        mailboxReady = lastResult?.status === "ready" || lastResult?.status === "ok";
      } catch (_) {}
    }

    return {
      ok: true,
      fl_running: Boolean(pid),
      fl_pid: pid,
      bridge_socket_port: BRIDGE_PORT,
      mailbox_path: this.storageDir,
      mailbox_active: mailboxReady,
      last_bridge_result: lastResult,
      summary: pid
        ? `FL Studio 2026 is active (PID ${pid}). Bridge status: ${mailboxReady ? "CONNECTED" : "STANDBY"}.`
        : "FL Studio 2026 is not currently running.",
    };
  }
}
