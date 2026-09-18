import { existsSync } from "node:fs";
import { Validator } from "../core/validator.mjs";

let sqliteDbSync = null;
try { sqliteDbSync = (await import("node:sqlite")).DatabaseSync; } catch {}

// Los nombres de tabla/columna no pueden parametrizarse en SQLite (a diferencia
// de los valores), así que se validan contra un allowlist estricto para evitar
// inyección SQL vía identificador (ej: table = "users; DROP TABLE secrets; --").
function assertSafeIdentifier(name, kind = "identificador") {
  if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`${kind} inválido: "${name}". Solo se permiten letras, números y guion bajo, sin empezar con número.`);
  }
  return name;
}

export function createDatabaseDomain({ runtime, path, fs, domain, splitLines }) {
  const actions = {
    execute_query: async ({ engine = "sqlite", database, query, user, password, host } = {}) => {
      if (!database || !query) return { ok: false, error: "Los parámetros 'database' y 'query' son requeridos." };
      const env = { ...process.env };
      if (engine === "sqlite") {
        const isMemory = database === ":memory:" || database === "memory";
        const target = isMemory ? ":memory:" : runtime.hp(database);
        const existedBefore = isMemory ? true : existsSync(target);
        if (!isMemory) await fs.mkdir(path.dirname(target), { recursive: true });
        if (sqliteDbSync) {
          let db;
          try {
            db = new sqliteDbSync(target);
            const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN|WITH)\b/i.test(query);
            let output;
            if (isSelect) { const stmt = db.prepare(query); output = JSON.stringify(stmt.all(), null, 2); }
            else { db.exec(query); output = "Query ejecutada exitosamente."; }
            const resObj = { ok: true, output };
            if (!isMemory) {
              resObj.db_created = !existedBefore;
              if (!existedBefore) {
                resObj.warning = `La base de datos SQLite '${database}' no existía previamente y fue creada automáticamente en disco.`;
              }
            }
            return resObj;
          } catch (err) {
            try { db?.close(); db = null; } catch {}
            // Si la base de datos no existía antes de la consulta y falló, limpiar el archivo huérfano de 0 bytes
            if (!existedBefore && !isMemory) {
              try {
                if (existsSync(target)) {
                  const st = await fs.stat(target);
                  if (st.size === 0) await fs.unlink(target);
                }
              } catch {}
            }
            return { ok: false, error: `SQLite error: ${err.message}` };
          } finally { try { db?.close(); } catch {} }
        }
        const res = await runtime.run(`sqlite3 ${runtime.shellQuote(target)} ${runtime.shellQuote(query)}`);
        const resObj = { ok: res.ok, output: res.stdout || res.stderr };
        if (!isMemory && res.ok) {
          resObj.db_created = !existedBefore;
          if (!existedBefore) {
            resObj.warning = `La base de datos SQLite '${database}' no existía previamente y fue creada automáticamente en disco.`;
          }
        }
        return resObj;
      }
      if (engine === "postgres") {
        if (password) env.PGPASSWORD = password;
        const auth = (user ? ` -U ${runtime.shellQuote(user)}` : "") + (host ? ` -h ${runtime.shellQuote(host)}` : "");
        const res = await runtime.run(`psql${auth} -d ${runtime.shellQuote(database)} -c ${runtime.shellQuote(query)}`, { env });
        return { ok: res.ok, output: res.stdout };
      }
      if (engine === "mysql") {
        if (password) env.MYSQL_PWD = password;
        const auth = (user ? ` -u ${runtime.shellQuote(user)}` : "") + (host ? ` -h ${runtime.shellQuote(host)}` : "");
        const res = await runtime.run(`mysql${auth} ${runtime.shellQuote(database)} -e ${runtime.shellQuote(query)}`, { env });
        return { ok: res.ok, output: res.stdout };
      }
      return { ok: false, error: `Motor no soportado: ${engine}` };
    },

    explain_query: async ({ database, query } = {}) => {
      if (!database || !query) return { ok: false, error: "Los parámetros 'database' y 'query' son requeridos." };
      const isMemory = database === ":memory:" || database === "memory";
      const target = isMemory ? ":memory:" : runtime.hp(database);
      if (!isMemory && !existsSync(target)) {
        return { ok: false, error: `La base de datos SQLite '${database}' no existe en disco.` };
      }
      if (sqliteDbSync) {
        let db;
        try {
          db = new sqliteDbSync(target);
          const plan = db.prepare(`EXPLAIN QUERY PLAN ${query}`).all();
          return { ok: true, database, plan };
        } catch (e) {
          return { ok: false, error: e.message };
        } finally {
          try { db?.close(); } catch {}
        }
      }
      const res = await runtime.run(`sqlite3 ${runtime.shellQuote(target)} "EXPLAIN QUERY PLAN ${query}"`);
      return { ok: res.ok, plan: res.stdout };
    },

    export_table: async ({ database, table, format = "json", destination } = {}) => {
      if (!database || !table) return { ok: false, error: "Los parámetros 'database' y 'table' son requeridos." };
      const target = runtime.hp(database);
      if (!existsSync(target)) {
        return { ok: false, error: `La base de datos SQLite '${database}' no existe en disco.` };
      }
      if (!sqliteDbSync) return { ok: false, error: "Exportación requiere módulo SQLite activo." };
      let db;
      try {
        assertSafeIdentifier(table, "nombre de tabla");
        db = new sqliteDbSync(target);
        const rows = db.prepare(`SELECT * FROM "${table}"`).all();
        let content = "";
        if (format.toLowerCase() === "csv") {
          if (rows.length > 0) {
            const headers = Object.keys(rows[0]);
            content = headers.join(",") + "\n" + rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")).join("\n");
          }
        } else {
          content = JSON.stringify(rows, null, 2);
        }
        if (destination) {
          const dest = runtime.hp(destination);
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.writeFile(dest, content, "utf8");
          return { ok: true, table, rowCount: rows.length, destination: dest };
        }
        return { ok: true, table, rowCount: rows.length, data: rows };
      } catch (e) {
        return { ok: false, error: e.message };
      } finally {
        try { db?.close(); } catch {}
      }
    },

    import_table: async ({ database, table, data, source } = {}) => {
      if (!database || !table) return { ok: false, error: "Los parámetros 'database' y 'table' son requeridos." };
      const target = runtime.hp(database);
      let rows = data;
      if (source) {
        try {
          const srcContent = await fs.readFile(runtime.hp(source), "utf8");
          rows = JSON.parse(srcContent);
        } catch (e) {
          return { ok: false, error: `Error leyendo archivo origen: ${e.message}` };
        }
      }
      if (!Array.isArray(rows) || rows.length === 0) {
        return { ok: false, error: "Se requiere un array de filas para importar." };
      }
      let db;
      try {
        assertSafeIdentifier(table, "nombre de tabla");
        const keys = Object.keys(rows[0]);
        for (const k of keys) assertSafeIdentifier(k, "nombre de columna");
        db = new sqliteDbSync(target);
        const cols = keys.map((k) => `"${k}" TEXT`).join(", ");
        db.exec(`CREATE TABLE IF NOT EXISTS "${table}" (${cols});`);
        const placeholders = keys.map(() => "?").join(", ");
        const insertStmt = db.prepare(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${placeholders})`);
        for (const row of rows) {
          insertStmt.run(...keys.map((k) => row[k]));
        }
        return { ok: true, table, importedCount: rows.length };
      } catch (e) {
        return { ok: false, error: e.message };
      } finally {
        try { db?.close(); } catch {}
      }
    },

    analyze_database: async ({ database } = {}) => {
      if (!database) return { ok: false, error: "El parámetro 'database' es requerido." };
      const target = runtime.hp(database);
      if (!existsSync(target)) return { ok: false, error: `La base de datos SQLite '${database}' no existe en disco.` };
      try {
        const stat = await fs.stat(target).catch(() => null);
        if (sqliteDbSync) {
          let db;
          try {
            db = new sqliteDbSync(target);
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
            const tableDetails = [];
            for (const t of tables) {
              const countRow = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get();
              const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all();
              tableDetails.push({ name: t.name, rowCount: countRow?.c || 0, columnCount: cols.length, columns: cols.map((c) => c.name) });
            }
            return { ok: true, database: target, sizeBytes: stat?.size || 0, tableCount: tables.length, tables: tableDetails };
          } finally {
            try { db?.close(); } catch {}
          }
        }
        return { ok: true, database: target, sizeBytes: stat?.size || 0 };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    execute_script: async ({ engine = "sqlite", database, scriptFile } = {}) => {
      if (!database || !scriptFile) {
        return { ok: false, error: "Los parámetros 'database' y 'scriptFile' son requeridos." };
      }
      const isMemory = database === ":memory:" || database === "memory";
      const targetDb = isMemory ? ":memory:" : runtime.hp(database);
      const targetScript = runtime.hp(scriptFile);
      try {
        const scriptContent = await fs.readFile(targetScript, "utf8");
        if (sqliteDbSync) {
          let db;
          try {
            db = new sqliteDbSync(targetDb);
            db.exec(scriptContent);
            return { ok: true, output: "Script ejecutado exitosamente." };
          } finally {
            try { db?.close(); } catch {}
          }
        }
        const normalizedScript = targetScript.replace(/\\/g, "/");
        const res = await runtime.run(`sqlite3 ${runtime.shellQuote(targetDb)} ".read '${normalizedScript}'"`);
        return { ok: res.ok, output: res.stdout };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    search_tables: async ({ database } = {}) => {
      if (!database) return { ok: false, error: "El parámetro 'database' es requerido." };
      const isMemory = database === ":memory:" || database === "memory";
      const target = isMemory ? ":memory:" : runtime.hp(database);
      if (!isMemory && !existsSync(target)) {
        return { ok: false, error: `La base de datos SQLite '${database}' no existe en disco.` };
      }
      if (sqliteDbSync) {
        let db;
        try {
          db = new sqliteDbSync(target);
          const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
          return { ok: true, tables: rows.map((r) => r.name) };
        } catch (e) {
          return { ok: false, error: e.message };
        } finally {
          try { db?.close(); } catch {}
        }
      }
      const res = await runtime.run(`sqlite3 ${runtime.shellQuote(target)} ".tables"`);
      return { ok: true, tables: splitLines(res.stdout) };
    },

    describe_table: async ({ database, table } = {}) => {
      if (!database || !table) return { ok: false, error: "Los parámetros 'database' y 'table' son requeridos." };
      const isMemory = database === ":memory:" || database === "memory";
      const target = isMemory ? ":memory:" : runtime.hp(database);
      if (!isMemory && !existsSync(target)) {
        return { ok: false, error: `La base de datos SQLite '${database}' no existe en disco.` };
      }
      if (sqliteDbSync) {
        let db;
        try {
          db = new sqliteDbSync(target);
          const rows = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND lower(name)=lower(?)`).all(table);
          let cols = [];
          try {
            cols = db.prepare(`PRAGMA table_info("${table}")`).all();
          } catch {}
          return { ok: true, schema: rows[0]?.sql || "", columns: cols };
        } catch (e) {
          return { ok: false, error: e.message };
        } finally {
          try { db?.close(); } catch {}
        }
      }
      const res = await runtime.run(`sqlite3 ${runtime.shellQuote(target)} ".schema ${runtime.shellQuote(table)}"`);
      return { ok: true, schema: res.stdout };
    },

    create_database: async ({ database } = {}) => {
      if (!database) return { ok: false, error: "El parámetro 'database' es requerido." };
      try {
        const isMemory = database === ":memory:" || database === "memory";
        const target = isMemory ? ":memory:" : runtime.hp(database);
        if (isMemory) return { ok: true, database: ":memory:", created: true, inMemory: true };
        await fs.mkdir(path.dirname(target), { recursive: true });
        if (sqliteDbSync) {
          const db = new sqliteDbSync(target);
          db.exec("PRAGMA user_version = 0;");
          db.close();
          return { ok: true, database: target, created: true };
        }
        await runtime.run(`sqlite3 ${runtime.shellQuote(target)} "VACUUM;"`);
        return { ok: true, database: target, created: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    delete_database: async ({ database } = {}) => {
      if (!database) return { ok: false, error: "El parámetro 'database' es requerido." };
      try {
        await fs.rm(runtime.hp(database), { force: true });
        return { ok: true, deleted: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    backup_database: async ({ database, destination } = {}) => {
      if (!database) return { ok: false, error: "El parámetro 'database' es requerido." };
      try {
        const dest = destination ? runtime.hp(destination) : `${runtime.hp(database)}.bak`;
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(runtime.hp(database), dest);
        return { ok: true, destination: dest };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    restore_database: async ({ database, source } = {}) => {
      if (!database || !source) return { ok: false, error: "Los parámetros 'database' y 'source' son requeridos." };
      try {
        const target = runtime.hp(database);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(runtime.hp(source), target);
        return { ok: true, restored: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    remember_note: async ({ title, content, tags = [], category = "general", projectPath = null } = {}) => {
      try {
        const validTitle = Validator.validateNonEmptyString(title, "title");
        const validContent = Validator.validateNonEmptyString(content, "content");
        if (!runtime.memory?.rememberNote) {
          return { ok: false, error: "MEMORY_NOT_AVAILABLE", message: "El subsistema de memoria persistente no está inicializado." };
        }
        const note = runtime.memory.rememberNote({
          title: validTitle,
          content: validContent,
          tags,
          category,
          projectPath
        });
        return {
          ok: true,
          note,
          message: note.redacted
            ? "Nota guardada con éxito en SQLite (se redactaron secretos sensibles detectados automáticamente)."
            : "Nota guardada con éxito en SQLite y sincronizada en el índice FTS5."
        };
      } catch (err) {
        return { ok: false, error: err.message, code: err.code || "INVALID_INPUT" };
      }
    },

    search_notes: async ({ query, tag, category, limit = 20 } = {}) => {
      if (!runtime.memory?.searchNotes) {
        return { ok: false, error: "MEMORY_NOT_AVAILABLE", message: "El subsistema de memoria persistente no está inicializado." };
      }
      try {
        const notes = runtime.memory.searchNotes({ query, tag, category, limit });
        return {
          ok: true,
          count: notes.length,
          query: query || null,
          category: category || null,
          tag: tag || null,
          notes
        };
      } catch (err) {
        return { ok: false, error: "SEARCH_NOTES_FAILED", message: err.message };
      }
    }
  };

  // Alias intuitivos para llamadas de LLMs
  actions.list_tables = actions.search_tables;
  actions.show_tables = actions.search_tables;
  actions.tables = actions.search_tables;
  actions.query = actions.execute_query;
  actions.schema = actions.describe_table;
  actions.describe = actions.describe_table;
  actions.script = actions.execute_script;

  const permissions = {
    delete_database: "advanced",
    restore_database: "advanced",
    execute_query: "standard",
    explain_query: "standard",
    remember_note: "standard",
    search_notes: "standard",
  };

  return domain("database", "Consultas, análisis, exportación CSV/JSON y administración de bases de datos (SQLite, PostgreSQL, MySQL).", actions, permissions);
}
