import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export class MemoryStore {
  constructor({ file, legacyFile }) {
    this.file = file;
    this.legacyFile = legacyFile;
    this.db = null;
  }

  async load() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await this.withStartupRetry(() => {
      this.db = new DatabaseSync(this.file, { timeout: 10000 });
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA busy_timeout = 10000;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS kv (
          section TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (section, key)
        );

        CREATE TABLE IF NOT EXISTS history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          tool TEXT NOT NULL,
          action TEXT NOT NULL,
          ok INTEGER NOT NULL,
          duration_ms INTEGER NOT NULL,
          client TEXT,
          trace_id TEXT,
          error TEXT
        );

        CREATE TABLE IF NOT EXISTS permissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          level TEXT NOT NULL,
          scope TEXT NOT NULL,
          expires_at TEXT,
          reason TEXT,
          revoked_at TEXT,
          principal TEXT,
          workflow_id TEXT UNIQUE
        );

        CREATE TABLE IF NOT EXISTS successful_routes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          goal_hash TEXT NOT NULL UNIQUE,
          goal_text TEXT NOT NULL,
          route_steps TEXT NOT NULL,
          execution_time_ms INTEGER NOT NULL,
          success_count INTEGER NOT NULL DEFAULT 1,
          reliability REAL NOT NULL DEFAULT 1.0,
          last_used TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          client TEXT NOT NULL,
          system_signature TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS knowledge_notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          source TEXT NOT NULL DEFAULT 'assistant',
          project_path TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_history_tool_action ON history(tool, action, ts);
        CREATE INDEX IF NOT EXISTS idx_history_client ON history(client, ts);
        CREATE INDEX IF NOT EXISTS idx_history_ok ON history(ok, ts);
        CREATE INDEX IF NOT EXISTS idx_permissions_scope ON permissions(scope, expires_at, revoked_at);
        CREATE INDEX IF NOT EXISTS idx_permissions_principal ON permissions(principal);
        CREATE INDEX IF NOT EXISTS idx_routes_goal_hash ON successful_routes(goal_hash);
        CREATE INDEX IF NOT EXISTS idx_routes_reliability ON successful_routes(reliability DESC, last_used DESC);
        CREATE INDEX IF NOT EXISTS idx_knowledge_notes_ts ON knowledge_notes(ts DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_kv_section_key ON kv(section, key);
      `);

      try { this.db.exec("ALTER TABLE history ADD COLUMN error TEXT"); } catch (e) {}
      try { this.db.exec("ALTER TABLE permissions ADD COLUMN principal TEXT"); } catch (e) {}
      try { this.db.exec("ALTER TABLE permissions ADD COLUMN workflow_id TEXT UNIQUE"); } catch (e) {}

      // Migración y depuración de la tabla errors antigua
      try {
        const errorsExist = this.db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='errors'",
          )
          .get();
        if (errorsExist) {
          const errRows = this.db.prepare("SELECT * FROM errors").all();
          if (errRows.length > 0) {
            const insertHistory = this.db.prepare(
              "INSERT INTO history(ts, tool, action, ok, duration_ms, client, trace_id, error) VALUES (?, ?, ?, 0, 0, ?, ?, ?)",
            );
            for (const err of errRows) {
              insertHistory.run(
                err.ts,
                err.tool,
                err.action,
                err.client,
                err.trace_id,
                err.error,
              );
            }
          }
          this.db.exec("DROP TABLE errors");
        }
      } catch (e) {}

      // Eliminar tabla metrics física antigua si existe
      try {
        const metricsExist = this.db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='metrics'",
          )
          .get();
        if (metricsExist) {
          this.db.exec("DROP TABLE metrics");
        }
      } catch (e) {}

      this.cleanup();
    });
    await this.migrateLegacyJson();
  }

  async withStartupRetry(fn, attempts = 8) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return fn();
      } catch (error) {
        lastError = error;
        this.db?.close();
        this.db = null;
        if (!String(error.message).includes("locked") || attempt === attempts)
          break;
        await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
      }
    }
    throw lastError;
  }

  async migrateLegacyJson() {
    if (!this.legacyFile) return;
    const migrated = this.get("config", "legacy_json_migrated");
    if (migrated) return;
    const raw = await fs.readFile(this.legacyFile, "utf8").catch(() => null);
    if (!raw) {
      this.set("config", "legacy_json_migrated", true);
      return;
    }
    const data = (() => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })();
    if (!data) {
      this.set("config", "legacy_json_migrated", true);
      return;
    }
    for (const section of ["preferences", "config"]) {
      for (const [key, value] of Object.entries(data[section] ?? {}))
        this.set(section, key, value);
    }
    for (const item of data.history ?? []) {
      this.recordCall({
        tool: item.tool || "unknown",
        action: item.action || "unknown",
        ok: Boolean(item.ok),
        durationMs: Number(item.durationMs) || 0,
        client: { name: item.client || "legacy" },
        traceId: "legacy",
      });
    }
    for (const [key, count] of Object.entries(data.errors ?? {})) {
      const [route, ...message] = key.split(":");
      const [tool = "unknown", action = "unknown"] = route.split(".");
      for (let i = 0; i < Math.min(Number(count) || 1, 50); i += 1) {
        this.recordError({
          tool,
          action,
          error: message.join(":") || "legacy error",
          client: { name: "legacy" },
          traceId: "legacy",
        });
      }
    }
    this.set("config", "legacy_json_migrated", true);
  }

  close() {
    this.db?.close();
    this.db = null;
  }

  cleanup() {
    try {
      this.db.exec(`
        DELETE FROM history
        WHERE id IN (
          SELECT id FROM history
          WHERE ts < datetime('now', '-180 days')
        );

        DELETE FROM permissions
        WHERE revoked_at IS NOT NULL AND revoked_at < datetime('now', '-30 days');

        DELETE FROM successful_routes
        WHERE last_used < datetime('now', '-365 days') AND success_count < 2;

        DELETE FROM knowledge_notes
        WHERE ts < datetime('now', '-365 days');
      `);

      const historyCount = this.db
        .prepare("SELECT COUNT(*) AS count FROM history")
        .get().count;
      if (historyCount > 10000) {
        const excess = historyCount - 10000;
        this.db
          .prepare(
            `
          DELETE FROM history
          WHERE id IN (
            SELECT id FROM history ORDER BY ts ASC LIMIT ?
          )
        `,
          )
          .run(excess);
      }
      const notesCount = this.db
        .prepare("SELECT COUNT(*) AS count FROM knowledge_notes")
        .get().count;
      if (notesCount > 1000) {
        const excess = notesCount - 1000;
        this.db
          .prepare(
            `
          DELETE FROM knowledge_notes
          WHERE id IN (
            SELECT id FROM knowledge_notes ORDER BY ts ASC, id ASC LIMIT ?
          )
        `,
          )
          .run(excess);
      }
    } catch {}
  }

  get(section, key) {
    if (!key) {
      const rows = this.db
        .prepare("SELECT key, value FROM kv WHERE section = ? ORDER BY key")
        .all(section);
      return Object.fromEntries(
        rows.map((row) => [row.key, this.safeParseJson(row.value, row.value)]),
      );
    }
    const row = this.db
      .prepare("SELECT value FROM kv WHERE section = ? AND key = ?")
      .get(section, key);
    return row ? this.safeParseJson(row.value, row.value) : undefined;
  }

  set(section, key, value) {
    if (key === undefined || key === null || key === "")
      throw new Error("MemoryStore.set: key es requerido");
    if (section === undefined || section === null || section === "")
      throw new Error("MemoryStore.set: section es requerido");
    this.db
      .prepare(
        `
      INSERT INTO kv(section, key, value, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(section, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `,
      )
      .run(section, key, JSON.stringify(value));
    return value;
  }

  recordCall({ tool, action, ok, durationMs, client, traceId, error }) {
    this.db
      .prepare(
        "INSERT INTO history(tool, action, ok, duration_ms, client, trace_id, error) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        tool,
        action,
        ok ? 1 : 0,
        Math.round(durationMs || 0),
        client?.name ?? "unknown",
        traceId ?? null,
        error ? String(error) : null,
      );
  }

  recordError({ tool, action, error, client, traceId }) {
    this.db
      .prepare(
        "INSERT INTO history(tool, action, ok, duration_ms, client, trace_id, error) VALUES (?, ?, 0, 0, ?, ?, ?)",
      )
      .run(
        tool,
        action,
        client?.name ?? "unknown",
        traceId ?? null,
        String(error),
      );
  }

  recordMetric(name, value, labels = {}) {
    // No-op en MCP 4.0 para optimizar el rendimiento y evitar I/O de disco innecesario
  }

  grantPermission({ level, scope, expiresAt, reason, principal = 'default', workflowId = null }) {
    this.db
      .prepare(
        "INSERT INTO permissions(level, scope, expires_at, reason, principal, workflow_id) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        level,
        scope,
        expiresAt ? new Date(expiresAt).toISOString() : null,
        reason ?? null,
        principal,
        workflowId
      );
  }

  revokePermissions(scope, principal = null) {
    const now = new Date().toISOString();
    let query = "UPDATE permissions SET revoked_at = ? WHERE revoked_at IS NULL";
    const params = [now];
    
    if (scope) {
      query += " AND scope = ?";
      params.push(scope);
    }
    
    if (principal) {
      query += " AND principal = ?";
      params.push(principal);
    }
    
    this.db.prepare(query).run(...params);
  }

  revokeWorkflow(workflowId) {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE permissions SET revoked_at = ? WHERE workflow_id = ? AND revoked_at IS NULL").run(now, workflowId);
  }

  activePermissions() {
    return this.db
      .prepare(
        `
      SELECT level, scope, expires_at AS expiresAt, reason, ts, principal, workflow_id AS workflowId
      FROM permissions
      WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ORDER BY ts DESC
    `,
      )
      .all();
  }

  history(limit = 50) {
    return this.db
      .prepare("SELECT * FROM history ORDER BY id DESC LIMIT ?")
      .all(Math.min(Number(limit) || 50, 1000));
  }

  errors(limit = 100) {
    return this.db
      .prepare(
        "SELECT tool, action, error, client, COUNT(*) AS count, MAX(ts) AS lastSeen FROM history WHERE ok = 0 GROUP BY tool, action, error, client ORDER BY count DESC, lastSeen DESC LIMIT ?",
      )
      .all(Math.min(Number(limit) || 100, 1000));
  }

  getSuccessfulRoute(goalHash) {
    return this.db
      .prepare("SELECT * FROM successful_routes WHERE goal_hash = ?")
      .get(goalHash);
  }

  saveSuccessfulRoute({
    goalHash,
    goalText,
    routeSteps,
    executionTimeMs,
    client,
    systemSignature,
  }) {
    this.db
      .prepare(
        `
      INSERT INTO successful_routes(goal_hash, goal_text, route_steps, execution_time_ms, client, system_signature, last_used)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(goal_hash) DO UPDATE SET
        goal_text = excluded.goal_text,
        route_steps = excluded.route_steps,
        client = excluded.client,
        system_signature = excluded.system_signature,
        success_count = success_count + 1,
        execution_time_ms = (execution_time_ms + excluded.execution_time_ms) / 2,
        reliability = MIN(1.0, (reliability * success_count + 1.0) / (success_count + 1.0)),
        last_used = CURRENT_TIMESTAMP
    `,
      )
      .run(
        goalHash,
        goalText,
        JSON.stringify(routeSteps),
        executionTimeMs,
        client?.name ?? "unknown",
        systemSignature,
      );
  }

  findSimilarRoute(query) {
    return this.db
      .prepare(
        "SELECT * FROM successful_routes WHERE goal_text LIKE ? ORDER BY reliability DESC, last_used DESC LIMIT 5",
      )
      .all(`%${query}%`);
  }

  knowledge(limit = 50) {
    const rows = this.db
      .prepare(
        `
      SELECT goal_hash, goal_text, route_steps, execution_time_ms, success_count, reliability, last_used, client, system_signature
      FROM successful_routes
      ORDER BY reliability DESC, success_count DESC, last_used DESC
      LIMIT ?
    `,
      )
      .all(Math.min(Number(limit) || 50, 500));
    return rows.map((row) => ({
      ...row,
      route_steps: this.safeParseJson(row.route_steps, []),
    }));
  }

  rememberKnowledge({
    title,
    content,
    tags = [],
    source = "assistant",
    projectPath = null,
  } = {}) {
    if (!title || !content) throw new Error("title and content are required");
    this.db
      .prepare(
        `
      INSERT INTO knowledge_notes(title, content, tags, source, project_path)
      VALUES (?, ?, ?, ?, ?)
    `,
      )
      .run(
        String(title),
        String(content),
        JSON.stringify(Array.isArray(tags) ? tags : [tags]),
        String(source || "assistant"),
        projectPath ? String(projectPath) : null,
      );
    return { title, content, tags, source, projectPath };
  }

  knowledgeNotes(limit = 50) {
    return this.db
      .prepare(
        `
      SELECT id, ts, title, content, tags, source, project_path AS projectPath
      FROM knowledge_notes
      ORDER BY ts DESC, id DESC
      LIMIT ?
    `,
      )
      .all(Math.min(Number(limit) || 50, 500))
      .map((row) => ({
        ...row,
        tags: this.safeParseJson(row.tags, []),
      }));
  }

  searchKnowledgeNotes(query, limit = 8) {
    const terms = String(query || "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}_-]+/u)
      .filter((term) => term.length > 2)
      .slice(0, 8);
    if (!terms.length) return this.knowledgeNotes(limit);

    const rows = this.db
      .prepare(
        `
      SELECT id, ts, title, content, tags, source, project_path AS projectPath
      FROM knowledge_notes
      ORDER BY ts DESC, id DESC
      LIMIT 250
    `,
      )
      .all();

    return rows
      .map((row) => {
        const haystack =
          `${row.title}\n${row.content}\n${row.tags}`.toLowerCase();
        const score = terms.reduce(
          (acc, term) => acc + (haystack.includes(term) ? 1 : 0),
          0,
        );
        return {
          ...row,
          tags: this.safeParseJson(row.tags, []),
          score,
        };
      })
      .filter((row) => row.score > 0)
      .sort(
        (a, b) => b.score - a.score || String(b.ts).localeCompare(String(a.ts)),
      )
      .slice(0, Math.min(Number(limit) || 8, 50));
  }

  stats() {
    const calls = this.db
      .prepare("SELECT COUNT(*) AS count FROM history")
      .get().count;
    const byTool = this.db
      .prepare(
        "SELECT tool, COUNT(*) AS count, AVG(duration_ms) AS avgMs FROM history GROUP BY tool ORDER BY count DESC",
      )
      .all();
    const byAction = this.db
      .prepare(
        "SELECT tool || '.' || action AS route, COUNT(*) AS count, AVG(duration_ms) AS avgMs FROM history GROUP BY route ORDER BY count DESC LIMIT 100",
      )
      .all();
    const byClient = this.db
      .prepare(
        "SELECT client, COUNT(*) AS count, AVG(duration_ms) AS avgMs FROM history GROUP BY client ORDER BY count DESC",
      )
      .all();
    const knowledgeCount = this.db
      .prepare("SELECT COUNT(*) AS count FROM successful_routes")
      .get().count;
    const knowledgeNotesCount = this.db
      .prepare("SELECT COUNT(*) AS count FROM knowledge_notes")
      .get().count;
    const activePermissions = this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM permissions WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)",
      )
      .get().count;
    return {
      calls,
      knowledgeCount,
      knowledgeNotesCount,
      activePermissions,
      byTool,
      byAction,
      byClient,
    };
  }

  clearHistory() {
    this.db.exec("DELETE FROM history;");
  }

  safeParseJson(value, fallback) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
}
