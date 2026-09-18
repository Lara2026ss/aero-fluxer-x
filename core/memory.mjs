import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export function redactSecrets(text) {
  if (typeof text !== "string") return text;
  let redacted = text;
  redacted = redacted.replace(/ghp_[a-zA-Z0-9]{36}/gi, "ghp_[REDACTED]");
  redacted = redacted.replace(/github_pat_[a-zA-Z0-9_]{50,}/gi, "github_pat_[REDACTED]");
  redacted = redacted.replace(/gho_[a-zA-Z0-9]{36}/gi, "gho_[REDACTED]");
  redacted = redacted.replace(/-----BEGIN[ A-Z_-]+PRIVATE KEY-----[\s\S]*?-----END[ A-Z_-]+PRIVATE KEY-----/gi, "[REDACTED_PRIVATE_KEY]");
  redacted = redacted.replace(/(["']?(?:api[_-]?key|secret|token|password|auth[_-]?token)["']?\s*[:=]\s*["']?)([^"'\s\r\n]{8,})(["']?)/gi, (m, pre, secret, post) => {
    return `${pre}[REDACTED]${post}`;
  });
  return redacted;
}

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

        CREATE TABLE IF NOT EXISTS notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          category TEXT NOT NULL DEFAULT 'general',
          project_path TEXT
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
          title,
          content,
          tags,
          content='notes',
          content_rowid='id'
        );

        CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
          INSERT INTO notes_fts(rowid, title, content, tags) VALUES (new.id, new.title, new.content, new.tags);
        END;
        CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
          INSERT INTO notes_fts(notes_fts, rowid, title, content, tags) VALUES('delete', old.id, old.title, old.content, old.tags);
        END;
        CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
          INSERT INTO notes_fts(notes_fts, rowid, title, content, tags) VALUES('delete', old.id, old.title, old.content, old.tags);
          INSERT INTO notes_fts(rowid, title, content, tags) VALUES (new.id, new.title, new.content, new.tags);
        END;
      `);

      try { this.db.exec("ALTER TABLE history ADD COLUMN error TEXT"); } catch (e) {}
      try { this.db.exec("ALTER TABLE permissions ADD COLUMN principal TEXT"); } catch (e) {}
      try { this.db.exec("ALTER TABLE permissions ADD COLUMN workflow_id TEXT"); } catch (e) {}
      try { this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_workflow_id ON permissions(workflow_id)"); } catch (e) {}

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_history_tool_action ON history(tool, action, ts);
        CREATE INDEX IF NOT EXISTS idx_history_client ON history(client, ts);
        CREATE INDEX IF NOT EXISTS idx_history_ok ON history(ok, ts);
        CREATE INDEX IF NOT EXISTS idx_permissions_scope ON permissions(scope, expires_at, revoked_at);
        CREATE INDEX IF NOT EXISTS idx_permissions_principal ON permissions(principal);
        CREATE INDEX IF NOT EXISTS idx_routes_goal_hash ON successful_routes(goal_hash);
        CREATE INDEX IF NOT EXISTS idx_routes_reliability ON successful_routes(reliability DESC, last_used DESC);
        CREATE INDEX IF NOT EXISTS idx_knowledge_notes_ts ON knowledge_notes(ts DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_notes_ts ON notes(ts DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category, ts DESC);
        CREATE INDEX IF NOT EXISTS idx_kv_section_key ON kv(section, key);
      `);

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
      this._applyMigrations();
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
    const nowIso = new Date().toISOString();
    const rows = this.db
      .prepare(
        `
      SELECT level, scope, expires_at AS expiresAt, reason, ts, principal, workflow_id AS workflowId
      FROM permissions
      WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY ts DESC
    `,
      )
      .all(nowIso);
    const now = Date.now();
    return rows.filter((p) => {
      if (!p.expiresAt) return true;
      const t = new Date(p.expiresAt).getTime();
      return !isNaN(t) && t > now;
    });
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

  rememberNote({ title, content, tags = [], category = "general", projectPath = null } = {}) {
    if (!title || !content) throw new Error("title and content are required");
    const rawTitle = String(title);
    const rawContent = String(content);
    const cleanTitle = redactSecrets(rawTitle);
    const cleanContent = redactSecrets(rawContent);
    const wasRedacted = cleanTitle !== rawTitle || cleanContent !== rawContent;

    const parsedTags = Array.isArray(tags) ? tags.map(String) : [String(tags)];
    const cleanTags = parsedTags.map(t => redactSecrets(t));
    const cleanCat = String(category || "general").trim();
    const cleanPath = projectPath ? String(projectPath) : null;

    const res = this.db.prepare(`
      INSERT INTO notes(title, content, tags, category, project_path)
      VALUES (?, ?, ?, ?, ?)
    `).run(cleanTitle, cleanContent, JSON.stringify(cleanTags), cleanCat, cleanPath);

    return {
      id: Number(res.lastInsertRowid),
      title: cleanTitle,
      content: cleanContent,
      tags: cleanTags,
      category: cleanCat,
      projectPath: cleanPath,
      redacted: wasRedacted
    };
  }

  searchNotes({ query, tag, category, limit = 20 } = {}) {
    const maxLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
    const params = [];

    let hasQuery = false;
    let sql = "";

    if (query && String(query).trim().length > 0) {
      hasQuery = true;
      const terms = String(query)
        .trim()
        .replace(/["*]/g, "")
        .split(/\s+/)
        .filter(Boolean);

      if (terms.length > 0) {
        const ftsQuery = terms.map(t => `"${t}"*`).join(" ");
        sql = `
          SELECT notes.id, notes.ts, notes.title, notes.content, notes.tags, notes.category,
                 notes.project_path AS projectPath, bm25(notes_fts) AS rank
          FROM notes_fts
          JOIN notes ON notes.id = notes_fts.rowid
          WHERE notes_fts MATCH ?
        `;
        params.push(ftsQuery);

        if (category) {
          sql += " AND notes.category = ?";
          params.push(String(category));
        }

        sql += " ORDER BY rank LIMIT ?";
        params.push(maxLimit);
      }
    }

    if (!hasQuery) {
      sql = `
        SELECT id, ts, title, content, tags, category, project_path AS projectPath
        FROM notes
      `;
      if (category) {
        sql += " WHERE category = ?";
        params.push(String(category));
      }
      sql += " ORDER BY ts DESC, id DESC LIMIT ?";
      params.push(maxLimit);
    }

    const rows = this.db.prepare(sql).all(...params);
    let results = rows.map(r => ({
      ...r,
      tags: this.safeParseJson(r.tags, [])
    }));

    if (tag) {
      const filterTag = String(tag).toLowerCase();
      results = results.filter(r => r.tags.some(t => String(t).toLowerCase() === filterTag));
    }

    return results;
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
        "SELECT COUNT(*) AS count FROM permissions WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)",
      )
      .get(new Date().toISOString()).count;
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

  // ── Versioned Migrations ──────────────────────────────────────────────────
  _applyMigrations() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const currentVersionRow = this.db.prepare("SELECT MAX(version) as ver FROM schema_migrations").get();
    const currentVersion = currentVersionRow?.ver || 0;

    if (currentVersion < 1) {
      this.db.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(1, "baseline_v30");
    }

    if (currentVersion < 2) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS dag_runs (
          run_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          task_count INTEGER NOT NULL DEFAULT 0,
          tasks_json TEXT NOT NULL,
          input_json TEXT NOT NULL DEFAULT '{}',
          error_json TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS dag_checkpoints (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          status TEXT NOT NULL,
          output_json TEXT,
          error_json TEXT,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(run_id, task_id),
          FOREIGN KEY(run_id) REFERENCES dag_runs(run_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_dag_runs_status ON dag_runs(status, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_dag_checkpoints_run ON dag_checkpoints(run_id, task_id);
      `);
      this.db.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(2, "dag_resilience_checkpoints");
    }

    if (currentVersion < 3) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS capability_leases (
          lease_id TEXT PRIMARY KEY,
          run_id TEXT,
          task_id TEXT,
          scope TEXT NOT NULL,
          budget_json TEXT NOT NULL,
          cost_per_call INTEGER NOT NULL DEFAULT 1,
          remaining_calls INTEGER NOT NULL DEFAULT 1,
          allowed_paths_json TEXT NOT NULL DEFAULT '[]',
          auto_revoke INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at TEXT,
          revoked_at TEXT,
          revoke_reason TEXT
        );

        CREATE TABLE IF NOT EXISTS capability_lease_events (
          event_id INTEGER PRIMARY KEY AUTOINCREMENT,
          lease_id TEXT NOT NULL,
          run_id TEXT,
          task_id TEXT,
          action TEXT NOT NULL,
          route TEXT,
          decision TEXT NOT NULL,
          cost INTEGER NOT NULL DEFAULT 1,
          reason TEXT,
          timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_leases_lookup ON capability_leases(status, run_id, task_id, scope);
        CREATE INDEX IF NOT EXISTS idx_lease_events ON capability_lease_events(lease_id, timestamp);
      `);
      this.db.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(3, "capability_leases_cryptographic");
    }

    if (currentVersion < 4) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS worm_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          operation TEXT NOT NULL,
          tool TEXT NOT NULL,
          action TEXT NOT NULL,
          permission_level INTEGER NOT NULL,
          principal TEXT NOT NULL DEFAULT 'default',
          lease_id TEXT,
          details_json TEXT NOT NULL DEFAULT '{}',
          prev_hash TEXT NOT NULL,
          record_hash TEXT NOT NULL
        );

        CREATE TRIGGER IF NOT EXISTS trg_worm_no_update BEFORE UPDATE ON worm_audit_log BEGIN
          SELECT RAISE(FAIL, 'WORM_IMMUTABLE: Updates are strictly prohibited on the audit log.');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_worm_no_delete BEFORE DELETE ON worm_audit_log BEGIN
          SELECT RAISE(FAIL, 'WORM_IMMUTABLE: Deletions are strictly prohibited on the audit log.');
        END;

        CREATE INDEX IF NOT EXISTS idx_worm_ts ON worm_audit_log(ts DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_worm_op ON worm_audit_log(operation, ts DESC);
      `);
      this.db.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(4, "worm_audit_log_immutable");
    }
  }

  // ── DAG Runs and Checkpoints Operations ───────────────────────────────────
  saveDagRun({ runId, status = "running", taskCount = 0, tasks = [], input = {}, error = null }) {
    if (!runId) throw new Error("runId is required for saveDagRun");
    const tasksJson = typeof tasks === "string" ? tasks : JSON.stringify(tasks);
    const inputJson = typeof input === "string" ? input : JSON.stringify(input);
    const errorJson = error ? (typeof error === "string" ? error : JSON.stringify(error)) : null;

    const stmt = this.db.prepare(`
      INSERT INTO dag_runs (run_id, status, task_count, tasks_json, input_json, error_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(run_id) DO UPDATE SET
        status = excluded.status,
        task_count = CASE WHEN excluded.task_count > 0 THEN excluded.task_count ELSE dag_runs.task_count END,
        error_json = excluded.error_json,
        updated_at = CURRENT_TIMESTAMP;
    `);

    stmt.run(runId, status, taskCount, tasksJson, inputJson, errorJson);
    return { ok: true, runId, status };
  }

  updateDagRunStatus(runId, status, { error = null, taskCount = null } = {}) {
    if (!runId) throw new Error("runId is required for updateDagRunStatus");
    const errorJson = error ? (typeof error === "string" ? error : JSON.stringify(error)) : null;

    let query = "UPDATE dag_runs SET status = ?, updated_at = CURRENT_TIMESTAMP";
    const params = [status];

    if (errorJson !== null) {
      query += ", error_json = ?";
      params.push(errorJson);
    }
    if (taskCount !== null) {
      query += ", task_count = ?";
      params.push(taskCount);
    }

    query += " WHERE run_id = ?";
    params.push(runId);

    const res = this.db.prepare(query).run(...params);
    return { ok: res.changes > 0, runId, status, changes: res.changes };
  }

  acquireResumeLock(runId) {
    if (!runId) throw new Error("runId is required for acquireResumeLock");
    const run = this.getDagRun(runId);
    if (!run) {
      const err = new Error(`DAG run '${runId}' not found.`);
      err.code = "RUN_NOT_FOUND";
      throw err;
    }

    if (run.status === "completed") {
      const err = new Error(`DAG run '${runId}' is already completed and cannot be resumed.`);
      err.code = "RUN_NOT_RESUMABLE";
      throw err;
    }

    if (run.status === "resuming" || run.status === "running") {
      const err = new Error(`DAG run '${runId}' is currently ${run.status} by another process.`);
      err.code = "RUN_ALREADY_RESUMING";
      throw err;
    }

    // Atomic state transition from paused/failed/pending/cancelled to resuming
    const stmt = this.db.prepare(`
      UPDATE dag_runs
      SET status = 'resuming', updated_at = CURRENT_TIMESTAMP
      WHERE run_id = ? AND status IN ('failed', 'paused', 'pending', 'cancelled');
    `);
    const res = stmt.run(runId);
    if (res.changes === 0) {
      const err = new Error(`DAG run '${runId}' could not acquire resume lock.`);
      err.code = "RUN_ALREADY_RESUMING";
      throw err;
    }

    return { ok: true, runId, previousStatus: run.status };
  }

  saveCheckpoint({ runId, taskId, status, data = null, error = null, durationMs = 0 }) {
    if (!runId || !taskId) throw new Error("runId and taskId are required for saveCheckpoint");
    const outputJson = data !== null && data !== undefined ? JSON.stringify(data) : null;
    const errorJson = error ? (typeof error === "string" ? error : JSON.stringify(error)) : null;

    // Ensure parent dag_runs entry exists to satisfy foreign key constraint
    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO dag_runs (run_id, status, task_count, tasks_json, input_json, created_at, updated_at)
        VALUES (?, 'running', 0, '[]', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      `).run(runId);
    } catch {}

    // Idempotent upsert: once completed, a checkpoint is immutable and cannot be degraded!
    const stmt = this.db.prepare(`
      INSERT INTO dag_checkpoints (run_id, task_id, status, output_json, error_json, duration_ms, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(run_id, task_id) DO UPDATE SET
        status = CASE
          WHEN dag_checkpoints.status = 'completed' AND excluded.status != 'completed' THEN dag_checkpoints.status
          ELSE excluded.status
        END,
        output_json = CASE
          WHEN dag_checkpoints.status = 'completed' AND excluded.status != 'completed' THEN dag_checkpoints.output_json
          ELSE excluded.output_json
        END,
        error_json = CASE
          WHEN dag_checkpoints.status = 'completed' AND excluded.status != 'completed' THEN dag_checkpoints.error_json
          ELSE excluded.error_json
        END,
        duration_ms = CASE
          WHEN dag_checkpoints.status = 'completed' AND excluded.status != 'completed' THEN dag_checkpoints.duration_ms
          ELSE excluded.duration_ms
        END,
        updated_at = CURRENT_TIMESTAMP;
    `);

    stmt.run(runId, taskId, status, outputJson, errorJson, durationMs);
    return { ok: true, runId, taskId, status };
  }

  getDagRun(runId) {
    if (!runId) return null;
    const row = this.db.prepare("SELECT * FROM dag_runs WHERE run_id = ?").get(runId);
    if (!row) return null;

    return {
      runId: row.run_id,
      status: row.status,
      taskCount: row.task_count,
      tasks: this.safeParseJson(row.tasks_json, []),
      input: this.safeParseJson(row.input_json, {}),
      error: this.safeParseJson(row.error_json, row.error_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listDagRuns({ limit = 20, status = null } = {}) {
    let query = "SELECT * FROM dag_runs";
    const params = [];
    if (status) {
      query += " WHERE status = ?";
      params.push(status);
    }
    query += " ORDER BY updated_at DESC LIMIT ?";
    params.push(Math.max(1, Math.min(100, Number(limit) || 20)));

    const rows = this.db.prepare(query).all(...params);
    return rows.map((r) => ({
      runId: r.run_id,
      status: r.status,
      taskCount: r.task_count,
      tasks: this.safeParseJson(r.tasks_json, []),
      input: this.safeParseJson(r.input_json, {}),
      error: this.safeParseJson(r.error_json, r.error_json),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  getCheckpoints(runId) {
    if (!runId) return [];
    const rows = this.db.prepare("SELECT * FROM dag_checkpoints WHERE run_id = ? ORDER BY id ASC").all(runId);
    return rows.map((r) => ({
      id: r.id,
      runId: r.run_id,
      taskId: r.task_id,
      status: r.status,
      data: this.safeParseJson(r.output_json, r.output_json),
      error: this.safeParseJson(r.error_json, r.error_json),
      durationMs: r.duration_ms,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  getStepCheckpoint(runId, taskId) {
    if (!runId || !taskId) return null;
    const row = this.db.prepare("SELECT * FROM dag_checkpoints WHERE run_id = ? AND task_id = ?").get(runId, taskId);
    if (!row) return null;
    return {
      id: row.id,
      runId: row.run_id,
      taskId: row.task_id,
      status: row.status,
      data: this.safeParseJson(row.output_json, row.output_json),
      error: this.safeParseJson(row.error_json, row.error_json),
      durationMs: row.duration_ms,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getWorkflowRun(runId) {
    const run = this.getDagRun(runId);
    if (!run) return null;
    const checkpoints = this.getCheckpoints(runId);
    const completedCount = checkpoints.filter((c) => c.status === "completed").length;
    return {
      ...run,
      run_id: run.runId,
      completed_tasks: completedCount,
    };
  }

  // ── Capability Leases Operations ──────────────────────────────────────────
  createLease({
    leaseId,
    runId = null,
    taskId = null,
    scope,
    budget = {},
    costPerCall = 1,
    remainingCalls = null,
    allowedPaths = [],
    autoRevoke = true,
    expiresAt = null,
  }) {
    if (!leaseId || !scope) throw new Error("leaseId and scope are required for createLease");
    const budgetJson = typeof budget === "string" ? budget : JSON.stringify(budget);
    const parsedBudget = typeof budget === "string" ? this.safeParseJson(budget, {}) : budget;
    const calls = remainingCalls !== null ? Number(remainingCalls) : (Number(parsedBudget.max_calls) || Number(parsedBudget.maxCalls) || Number(parsedBudget.calls) || 1);
    const cost = Number(parsedBudget.cost_per_call || parsedBudget.costPerCall || costPerCall) || 1;
    const allowedJson = JSON.stringify(Array.isArray(allowedPaths) ? allowedPaths : (parsedBudget.allowed_paths || parsedBudget.allowedPaths || []));

    const stmt = this.db.prepare(`
      INSERT INTO capability_leases (
        lease_id, run_id, task_id, scope, budget_json, cost_per_call,
        remaining_calls, allowed_paths_json, auto_revoke, status,
        created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, ?);
    `);

    stmt.run(
      leaseId,
      runId,
      taskId,
      scope,
      budgetJson,
      cost,
      calls,
      allowedJson,
      autoRevoke ? 1 : 0,
      expiresAt
    );

    this.recordLeaseEvent({
      leaseId,
      runId,
      taskId,
      action: "grant",
      route: scope,
      decision: "GRANTED",
      cost,
      reason: "lease_created",
    });

    return this.getLease(leaseId);
  }

  getLease(leaseId) {
    if (!leaseId) return null;
    const row = this.db.prepare("SELECT * FROM capability_leases WHERE lease_id = ?").get(leaseId);
    if (!row) return null;

    return {
      leaseId: row.lease_id,
      runId: row.run_id,
      taskId: row.task_id,
      scope: row.scope,
      budget: { ...this.safeParseJson(row.budget_json, {}), calls: row.remaining_calls },
      costPerCall: row.cost_per_call,
      remainingCalls: row.remaining_calls,
      allowedPaths: this.safeParseJson(row.allowed_paths_json, []),
      autoRevoke: Boolean(row.auto_revoke),
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      revokeReason: row.revoke_reason,
    };
  }

  listActiveLeases({ runId = null, taskId = null, scope = null } = {}) {
    let query = "SELECT * FROM capability_leases WHERE status = 'active'";
    const params = [];
    if (runId) {
      query += " AND (run_id = ? OR run_id IS NULL)";
      params.push(runId);
    }
    if (taskId) {
      query += " AND (task_id = ? OR task_id IS NULL)";
      params.push(taskId);
    }
    if (scope && scope !== "*") {
      query += " AND (scope = ? OR scope = '*')";
      params.push(scope);
    }
    query += " ORDER BY created_at DESC";

    const rows = this.db.prepare(query).all(...params);
    return rows.map((r) => ({
      leaseId: r.lease_id,
      runId: r.run_id,
      taskId: r.task_id,
      scope: r.scope,
      budget: { ...this.safeParseJson(r.budget_json, {}), calls: r.remaining_calls },
      costPerCall: r.cost_per_call,
      remainingCalls: r.remaining_calls,
      allowedPaths: this.safeParseJson(r.allowed_paths_json, []),
      autoRevoke: Boolean(r.auto_revoke),
      status: r.status,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at,
      revokeReason: r.revoke_reason,
    }));
  }

  consumeLeaseQuota(leaseId, cost = 1, context = {}) {
    if (!leaseId) throw new Error("leaseId is required for consumeLeaseQuota");
    const lease = this.getLease(leaseId);
    if (!lease) {
      const err = new Error(`Capability lease '${leaseId}' not found.`);
      err.code = "LEASE_NOT_FOUND";
      throw err;
    }

    if (lease.status === "revoked") {
      const err = new Error(`Capability lease '${leaseId}' is revoked (${lease.revokeReason || 'unknown'}).`);
      err.code = "LEASE_REVOKED";
      throw err;
    }

    if (lease.status === "exhausted") {
      const err = new Error(`Capability lease '${leaseId}' budget is exhausted (0 remaining calls).`);
      err.code = "LEASE_BUDGET_EXHAUSTED";
      throw err;
    }

    if (lease.expiresAt && new Date(lease.expiresAt).getTime() <= Date.now()) {
      this.db.prepare("UPDATE capability_leases SET status = 'expired', revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'expired' WHERE lease_id = ?").run(leaseId);
      const err = new Error(`Capability lease '${leaseId}' has expired.`);
      err.code = "LEASE_EXPIRED";
      throw err;
    }

    if (lease.remainingCalls < cost) {
      const err = new Error(`Capability lease '${leaseId}' has insufficient budget (${lease.remainingCalls} remaining, requested ${cost}).`);
      err.code = "LEASE_BUDGET_EXHAUSTED";
      throw err;
    }

    // Atomic SQL decrement with auto-revocation to 'exhausted'
    const stmt = this.db.prepare(`
      UPDATE capability_leases
      SET remaining_calls = remaining_calls - ?,
          status = CASE
            WHEN (remaining_calls - ?) <= 0 AND auto_revoke = 1 THEN 'exhausted'
            ELSE status
          END,
          revoked_at = CASE
            WHEN (remaining_calls - ?) <= 0 AND auto_revoke = 1 THEN CURRENT_TIMESTAMP
            ELSE revoked_at
          END,
          revoke_reason = CASE
            WHEN (remaining_calls - ?) <= 0 AND auto_revoke = 1 THEN 'quota_exhausted'
            ELSE revoke_reason
          END
      WHERE lease_id = ?
        AND status = 'active'
        AND remaining_calls >= ?;
    `);

    const result = stmt.run(cost, cost, cost, cost, leaseId, cost);
    if (result.changes === 0) {
      const err = new Error(`Capability lease '${leaseId}' budget was exhausted concurrently.`);
      err.code = "LEASE_BUDGET_EXHAUSTED";
      this.recordLeaseEvent({
        leaseId,
        runId: lease.runId,
        taskId: lease.taskId,
        action: context.action || "execute",
        route: context.route || "",
        decision: "REJECTED",
        cost,
        reason: "LEASE_BUDGET_EXHAUSTED_CONCURRENT",
      });
      throw err;
    }

    const updated = this.getLease(leaseId);
    this.recordLeaseEvent({
      leaseId,
      runId: lease.runId,
      taskId: lease.taskId,
      action: context.action || "execute",
      route: context.route || "",
      decision: updated.status === "exhausted" ? "EXHAUSTED" : "CONSUMED",
      cost,
      reason: updated.status === "exhausted" ? "quota_exhausted" : "authorized_call",
    });

    return {
      ok: true,
      leaseId,
      remainingCalls: updated.remainingCalls,
      status: updated.status,
    };
  }

  revokeLease(leaseId, reason = "manual_revoke") {
    if (!leaseId) return { ok: false, message: "leaseId required" };
    const stmt = this.db.prepare(`
      UPDATE capability_leases
      SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, revoke_reason = ?
      WHERE lease_id = ? AND status = 'active';
    `);
    const res = stmt.run(reason, leaseId);

    if (res.changes > 0) {
      this.recordLeaseEvent({
        leaseId,
        action: "revoke",
        decision: "REVOKED",
        reason,
      });
    }

    return { ok: true, leaseId, changes: res.changes };
  }

  revokeLeasesByRun(runId, reason = "workflow_finished") {
    if (!runId) return { ok: true, changes: 0 };
    const stmt = this.db.prepare(`
      UPDATE capability_leases
      SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, revoke_reason = ?
      WHERE run_id = ? AND status = 'active';
    `);
    const res = stmt.run(reason, runId);
    return { ok: true, runId, changes: res.changes };
  }

  revokeLeasesByTask(taskId, reason = "task_finished") {
    if (!taskId) return { ok: true, changes: 0 };
    const stmt = this.db.prepare(`
      UPDATE capability_leases
      SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, revoke_reason = ?
      WHERE task_id = ? AND status = 'active';
    `);
    const res = stmt.run(reason, taskId);
    return { ok: true, taskId, changes: res.changes };
  }

  recordLeaseEvent({ leaseId, runId = null, taskId = null, action = "call", route = null, decision = "UNKNOWN", cost = 1, reason = null }) {
    try {
      this.db.prepare(`
        INSERT INTO capability_lease_events (lease_id, run_id, task_id, action, route, decision, cost, reason, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
      `).run(leaseId, runId, taskId, action, route, decision, cost, reason);
    } catch {}
  }

  // ── WORM (Write Once, Read Many) Audit Log ────────────────────────────────
  appendWormAudit({
    operation,
    tool = null,
    action = null,
    permissionLevel = 0,
    principal = "default",
    leaseId = null,
    details = {},
  }) {
    if (!this.db) return null;
    const op = String(operation || `${tool}.${action}`);
    const t = tool ? String(tool) : op.split(".")[0] || "system";
    const a = action ? String(action) : (op.split(".")[1] || op);
    const detailsJson = typeof details === "string" ? details : JSON.stringify(details || {});
    const nowIso = new Date().toISOString();

    // Get last record hash for the cryptographic chain
    const lastRow = this.db.prepare("SELECT record_hash FROM worm_audit_log ORDER BY id DESC LIMIT 1").get();
    const prevHash = lastRow?.record_hash || "GENESIS_FLUXER_WORM_V30";

    const hashPayload = `${prevHash}:${nowIso}:${op}:${t}:${a}:${permissionLevel}:${principal}:${leaseId || ""}:${detailsJson}`;
    const recordHash = crypto.createHash("sha256").update(hashPayload).digest("hex");

    const stmt = this.db.prepare(`
      INSERT INTO worm_audit_log (
        ts, operation, tool, action, permission_level, principal, lease_id, details_json, prev_hash, record_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    const res = stmt.run(
      nowIso,
      op,
      t,
      a,
      Number(permissionLevel) || 0,
      principal,
      leaseId,
      detailsJson,
      prevHash,
      recordHash
    );

    const rowId = Number(res.lastInsertRowid);
    const wormId = `worm_${rowId}`;
    return {
      id: rowId,
      entryId: wormId,
      entry_id: wormId,
      ts: nowIso,
      operation: op,
      tool: t,
      action: a,
      permissionLevel: Number(permissionLevel) || 0,
      principal,
      leaseId,
      prevHash,
      recordHash,
      toString() { return wormId; },
      [Symbol.toPrimitive]() { return wormId; },
    };
  }

  getWormAuditLog({ limit = 50, operation = null } = {}) {
    if (!this.db) return [];
    let sql = "SELECT * FROM worm_audit_log";
    const params = [];
    if (operation) {
      sql += " WHERE operation = ? OR tool = ?";
      params.push(operation, operation);
    }
    sql += " ORDER BY id DESC LIMIT ?";
    params.push(Math.max(1, Math.min(Number(limit) || 50, 500)));

    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r) => ({
      id: r.id,
      entryId: `worm_${r.id}`,
      entry_id: `worm_${r.id}`,
      ts: r.ts,
      operation: r.operation,
      tool: r.tool,
      action: r.action,
      permissionLevel: r.permission_level,
      permission_level: r.permission_level,
      principal: r.principal,
      leaseId: r.lease_id,
      details: this.safeParseJson(r.details_json, {}),
      prevHash: r.prev_hash,
      recordHash: r.record_hash,
    }));
  }

  verifyWormAuditIntegrity() {
    if (!this.db) return { ok: false, error: "Database not loaded" };
    const rows = this.db.prepare("SELECT * FROM worm_audit_log ORDER BY id ASC").all();
    let prev = "GENESIS_FLUXER_WORM_V30";
    let verifiedCount = 0;

    for (const r of rows) {
      if (r.prev_hash !== prev) {
        return {
          ok: false,
          verified: false,
          error: `Chain broken at entry ID ${r.id}: expected prev_hash ${prev}, got ${r.prev_hash}`,
          brokenId: r.id,
        };
      }
      const hashPayload = `${r.prev_hash}:${r.ts}:${r.operation}:${r.tool}:${r.action}:${r.permission_level}:${r.principal}:${r.lease_id || ""}:${r.details_json}`;
      const computedHash = crypto.createHash("sha256").update(hashPayload).digest("hex");
      if (computedHash !== r.record_hash) {
        return {
          ok: false,
          verified: false,
          error: `Hash mismatch at entry ID ${r.id}: computed ${computedHash}, stored ${r.record_hash}`,
          brokenId: r.id,
        };
      }
      prev = r.record_hash;
      verifiedCount++;
    }

    return {
      ok: true,
      verified: true,
      totalEntries: verifiedCount,
      verifiedCount,
      headHash: prev,
    };
  }
}
