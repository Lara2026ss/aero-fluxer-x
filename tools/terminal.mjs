/**
 * FLUXER — tools/terminal.mjs
 * Dominio: ejecución de comandos, scripts, tareas en background, sesiones interactivas
 * y gestión avanzada de procesos del sistema operativo.
 *
 * @version 8.1.0
 * @param {object} ctx — { runtime, path, fs, crypto, domain }
 */
export function createTerminalDomain({ runtime, path, fs, crypto, domain }) {
  // ── Utilidades internas ───────────────────────────────────────────────────

  function stripAnsiCodes(str) {
    if (!str) return "";
    return String(str)
      .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
      .replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, "")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  }

  function resolveInterpreter(scriptPath, customInterp) {
    if (customInterp) return customInterp;
    const lower = scriptPath.toLowerCase();
    if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "node";
    if (lower.endsWith(".py")) return "python";
    if (lower.endsWith(".ps1")) return "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File";
    if (lower.endsWith(".bat") || lower.endsWith(".cmd")) return "cmd.exe /c";
    if (lower.endsWith(".ts")) return "npx ts-node";
    return "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File";
  }

  function extractEnvAssignments(command) {
    const envVars = {};
    if (!command || typeof command !== "string") return envVars;

    // Divide el comando en instrucciones individuales separadas por ';' o saltos de línea,
    // respetando las comillas simples y dobles para no dividir dentro de cadenas.
    const statements = [];
    let current = "";
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < command.length; i++) {
      const char = command[i];
      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        current += char;
      } else if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        current += char;
      } else if ((char === ";" || char === "\n" || (char === "&" && command[i + 1] !== "&")) && !inSingleQuote && !inDoubleQuote) {
        if (current.trim()) statements.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim()) statements.push(current.trim());

    for (const stmt of statements) {
      // 1. PowerShell: $env:VAR = 'val' o $env:VAR = "val" o $env:VAR = val
      const psMatch = stmt.match(/^\$env:([a-zA-Z_]\w*)\s*=\s*(.*)$/i);
      if (psMatch) {
        const name = psMatch[1];
        let val = psMatch[2].trim();
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
          val = val.slice(1, -1);
        }
        envVars[name] = val;
        continue;
      }

      // 2. POSIX: export VAR='val' o export VAR="val" o export VAR=val
      const exportMatch = stmt.match(/^export\s+([a-zA-Z_]\w*)\s*=\s*(.*)$/i);
      if (exportMatch) {
        const name = exportMatch[1];
        let val = exportMatch[2].trim();
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
          val = val.slice(1, -1);
        }
        envVars[name] = val;
        continue;
      }

      // 3. Windows CMD: set VAR=val o set "VAR=val"
      const cmdMatch = stmt.match(/^set\s+([a-zA-Z_]\w*)\s*=\s*(.*)$/i);
      if (cmdMatch) {
        const name = cmdMatch[1];
        let val = cmdMatch[2].trim();
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
          val = val.slice(1, -1);
        }
        envVars[name] = val;
        continue;
      }
    }

    return envVars;
  }

  const actions = {
    // ── 1. Ejecución de Comandos ─────────────────────────────────────────────
    run_command: async ({ command, timeout, cwd, env: extraEnv, shell = "powershell", stripAnsi = true, maxOutputChars = 500000 } = {}) => {
      if (!command) return { ok: false, error: "El parámetro 'command' es requerido." };
      const targetCwd = cwd ? runtime.hp(cwd) : undefined;

      const res = await runtime.run(command, { timeout, cwd: targetCwd, env: extraEnv, shell });

      let out = stripAnsi ? stripAnsiCodes(res.stdout) : res.stdout;
      let err = stripAnsi ? stripAnsiCodes(res.stderr) : res.stderr;

      let truncated = false;
      const maxChars = Number(maxOutputChars) || 500000;
      if (out && out.length > maxChars) {
        out = out.slice(0, maxChars) + `\n... [TRUNCADO: Salida recortada a ${maxChars} caracteres de un total de ${out.length}]`;
        truncated = true;
      }
      if (err && err.length > maxChars) {
        err = err.slice(0, maxChars) + `\n... [TRUNCADO: Error recortado a ${maxChars} caracteres de un total de ${err.length}]`;
        truncated = true;
      }

      return {
        ok: res.ok,
        stdout: out,
        stderr: err,
        code: res.code ?? res.exitCode ?? (res.ok ? 0 : 1),
        exit_code: res.exitCode ?? res.code ?? (res.ok ? 0 : 1),
        exitCode: res.exitCode ?? res.code ?? (res.ok ? 0 : 1),
        durationMs: res.durationMs ?? 0,
        effectiveShell: res.effectiveShell || shell,
        effectiveCwd: res.effectiveCwd || targetCwd || process.cwd(),
        resolvedCommand: res.resolvedCommand || command,
        effectiveEnvPath: res.effectiveEnvPath,
        encoding: res.encoding || "utf-8",
        ...(res.error ? { error: res.error } : {}),
        ...(truncated ? { truncated } : {}),
        ...(res.aborted ? { timedOut: true } : {}),
      };
    },

    // ── 2. Ejecución de Scripts (Archivos e In-Line) ─────────────────────────
    run_script: async ({ path: scriptPath, args = [], interpreter, cwd, env: extraEnv, timeout, stripAnsi = true, maxOutputChars = 500000 } = {}) => {
      if (!scriptPath) return { ok: false, error: "El parámetro 'path' es requerido." };
      const fullScript = runtime.hp(scriptPath);
      const targetCwd = cwd ? runtime.hp(cwd) : path.dirname(fullScript);
      const interp = resolveInterpreter(fullScript, interpreter);

      const formattedArgs = Array.isArray(args) ? args.map((a) => runtime.shellQuote(String(a))).join(" ") : String(args);
      const cmd = `${interp} ${runtime.shellQuote(fullScript)} ${formattedArgs}`.trim();

      const startTime = performance.now();
      const res = await runtime.run(cmd, { cwd: targetCwd, env: extraEnv, timeout });
      const durationMs = Math.round(performance.now() - startTime);

      let out = stripAnsi ? stripAnsiCodes(res.stdout) : res.stdout;
      let err = stripAnsi ? stripAnsiCodes(res.stderr) : res.stderr;

      const maxChars = Number(maxOutputChars) || 500000;
      if (out && out.length > maxChars) {
        out = out.slice(0, maxChars) + `\n... [TRUNCADO: Salida recortada a ${maxChars} caracteres]`;
      }

      return {
        ok: res.ok,
        script: fullScript,
        interpreter: interp,
        stdout: out,
        stderr: err,
        code: res.code ?? res.exitCode ?? (res.ok ? 0 : 1),
        exit_code: res.exitCode ?? res.code ?? (res.ok ? 0 : 1),
        exitCode: res.exitCode ?? res.code ?? (res.ok ? 0 : 1),
        durationMs,
        effectiveShell: res.effectiveShell || "powershell",
        effectiveCwd: res.effectiveCwd || targetCwd,
        ...(res.error ? { error: res.error } : {}),
        ...(res.aborted ? { timedOut: true } : {}),
      };
    },

    run_inline_script: async ({ code: scriptCode, language = "javascript", args = [], cwd, timeout, stripAnsi = true } = {}) => {
      if (!scriptCode) return { ok: false, error: "El parámetro 'code' es requerido." };
      const lang = String(language).toLowerCase();
      const tempDir = path.join(runtime.dirs.cache, "temp_scripts");
      await fs.mkdir(tempDir, { recursive: true });

      const extMap = {
        javascript: ".mjs",
        js: ".mjs",
        python: ".py",
        py: ".py",
        powershell: ".ps1",
        ps1: ".ps1",
        shell: ".sh",
        bash: ".sh",
        batch: ".bat",
        cmd: ".bat",
      };

      const ext = extMap[lang] || ".mjs";
      const tempFile = path.join(tempDir, `inline_${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`);

      try {
        await fs.writeFile(tempFile, scriptCode, "utf8");
        const interp = resolveInterpreter(tempFile);
        const formattedArgs = Array.isArray(args) ? args.map((a) => runtime.shellQuote(String(a))).join(" ") : String(args);
        const cmd = `${interp} ${runtime.shellQuote(tempFile)} ${formattedArgs}`.trim();

        const startTime = performance.now();
        const res = await runtime.run(cmd, { cwd: cwd ? runtime.hp(cwd) : undefined, timeout });
        const durationMs = Math.round(performance.now() - startTime);

        return {
          ok: res.ok,
          language: lang,
          stdout: stripAnsi ? stripAnsiCodes(res.stdout) : res.stdout,
          stderr: stripAnsi ? stripAnsiCodes(res.stderr) : res.stderr,
          code: res.code ?? (res.ok ? 0 : 1),
          exit_code: res.code ?? (res.ok ? 0 : 1),
          durationMs,
          ...(res.ok ? {} : { error: res.stderr || "El script in-line finalizó con código de error non-zero." }),
          ...(res.aborted ? { timedOut: true } : {}),
        };
      } finally {
        await fs.rm(tempFile, { force: true }).catch(() => {});
      }
    },

    // ── 3. Tareas en Segundo Plano (Background / Daemons) ────────────────────
    run_background: async ({ command, cwd } = {}) => {
      if (!command) return { ok: false, error: "El parámetro 'command' es requerido." };
      const targetCwd = cwd ? runtime.hp(cwd) : undefined;
      const info = runtime.bg(command, { cwd: targetCwd });
      return { ok: info.status !== "failed", ...info };
    },

    list_background_tasks: async () => {
      const tasks = runtime.getBgTasks();
      return { ok: true, count: tasks.length, tasks };
    },

    get_background_output: async ({ taskId, pid, tailLines } = {}) => {
      const id = taskId || pid;
      if (!id) return { ok: false, error: "Se requiere 'taskId' o 'pid'." };
      const record = runtime.getBgTaskLogs(id);
      if (!record) return { ok: false, error: `Tarea background '${id}' no encontrada.` };

      if (tailLines && typeof record.output === "string") {
        const lines = record.output.split(/\r?\n/);
        const n = Math.max(1, Number(tailLines));
        return { ok: true, task: { ...record, output: lines.slice(-n).join("\n"), totalLines: lines.length } };
      }
      return { ok: true, task: record };
    },

    kill_background_task: async ({ taskId, pid } = {}) => {
      const id = taskId || pid;
      if (!id) return { ok: false, error: "Se requiere 'taskId' o 'pid'." };
      const killed = runtime.killBgTask(id);
      return { ok: killed, taskId: id, killed };
    },

    stop_background_task: async ({ taskId, pid } = {}) => {
      const id = taskId || pid;
      if (!id) return { ok: false, error: "Se requiere 'taskId' o 'pid'." };
      const killed = runtime.killBgTask(id);
      return { ok: killed, taskId: id, killed };
    },

    wait_for_background_task: async ({ taskId, pid, timeoutMs = 30000, pollIntervalMs = 500 } = {}) => {
      const id = taskId || pid;
      if (!id) return { ok: false, error: "Se requiere 'taskId' o 'pid'." };
      const startTime = Date.now();

      while (Date.now() - startTime < timeoutMs) {
        const record = runtime.getBgTaskLogs(id);
        if (!record) return { ok: false, error: `Tarea '${id}' no encontrada.` };
        if (record.status === "completed" || record.status === "failed" || record.status === "stopped") {
          return { ok: record.status === "completed", status: record.status, task: record, waitedMs: Date.now() - startTime };
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }
      return { ok: false, error: `Tiempo de espera agotado (${timeoutMs}ms) para tarea '${id}'.`, timedOut: true };
    },

    // ── 4. Sesiones de Terminal Persistentes ─────────────────────────────────
    create_session: async ({ sessionId, cwd = ".", env = {} } = {}) => {
      runtime._termSessions = runtime._termSessions || new Map();
      const sid = sessionId || crypto.randomUUID();
      const sessionCwd = runtime.hp(cwd);
      const session = {
        id: sid,
        cwd: sessionCwd,
        env: { ...env },
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      runtime._termSessions.set(sid, session);
      return { ok: true, sessionId: sid, cwd: sessionCwd };
    },

    run_session_command: async ({ sessionId, command, cwd, env: extraEnv } = {}) => {
      if (!command) return { ok: false, error: "El parámetro 'command' es requerido." };
      runtime._termSessions = runtime._termSessions || new Map();
      const sid = sessionId || "default";
      let session = runtime._termSessions.get(sid);
      if (!session) {
        session = {
          id: sid,
          cwd: runtime.hp(cwd || "."),
          env: {},
          history: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        runtime._termSessions.set(sid, session);
      }

      if (cwd) session.cwd = runtime.hp(cwd);
      if (extraEnv) session.env = { ...session.env, ...extraEnv };

      const trimmed = command.trim();

      // Detección y navegación inteligente de comandos 'cd'
      if (/^cd(\s+|$)/i.test(trimmed)) {
        const rawTarget = trimmed.replace(/^cd\s*/i, "").trim().replace(/['"]/g, "");
        let targetDir = rawTarget;
        if (!targetDir || targetDir === "~") {
          targetDir = runtime.dirs.home;
        } else if (targetDir.startsWith("~/") || targetDir.startsWith("~\\")) {
          targetDir = path.join(runtime.dirs.home, targetDir.slice(2));
        }

        const resolvedDir = path.resolve(session.cwd, targetDir);
        try {
          const stat = await fs.stat(resolvedDir);
          if (stat.isDirectory()) {
            session.cwd = resolvedDir;
            session.updatedAt = new Date().toISOString();
            session.history.push({ command, stdout: `Directorio cambiado a: ${session.cwd}`, stderr: "", cwd: session.cwd, ok: true, timestamp: new Date().toISOString() });
            return { ok: true, sessionId: sid, cwd: session.cwd, stdout: `Directorio cambiado a: ${session.cwd}` };
          }
        } catch (e) {
          return { ok: false, sessionId: sid, cwd: session.cwd, error: `Directorio no encontrado: ${resolvedDir}` };
        }
      }

      // Detección y persistencia robusta de variables de entorno en la sesión (PowerShell, bash, cmd)
      const extractedEnvs = extractEnvAssignments(trimmed);
      if (Object.keys(extractedEnvs).length > 0) {
        Object.assign(session.env, extractedEnvs);
        session.updatedAt = new Date().toISOString();
      }

      const mergedEnv = { ...session.env, ...(extraEnv || {}) };
      const startTime = performance.now();
      const res = await runtime.run(command, { cwd: session.cwd, env: Object.keys(mergedEnv).length ? mergedEnv : undefined });
      const durationMs = Math.round(performance.now() - startTime);

      session.updatedAt = new Date().toISOString();
      session.history.push({
        command,
        stdout: res.stdout,
        stderr: res.stderr,
        cwd: session.cwd,
        ok: res.ok,
        code: res.code ?? (res.ok ? 0 : 1),
        durationMs,
        timestamp: new Date().toISOString(),
      });

      if (session.history.length > 100) session.history.shift();

      return {
        ok: res.ok,
        sessionId: sid,
        cwd: session.cwd,
        stdout: res.stdout,
        stderr: res.stderr,
        code: res.code ?? (res.ok ? 0 : 1),
        durationMs,
      };
    },

    attach_session: async ({ sessionId } = {}) => {
      runtime._termSessions = runtime._termSessions || new Map();
      const sid = sessionId || "default";
      const session = runtime._termSessions.get(sid);
      if (!session) return { ok: false, error: `Sesión '${sid}' no encontrada.` };
      return { ok: true, sessionId: sid, cwd: session.cwd, env: session.env, history: session.history.slice(-30) };
    },

    close_session: async ({ sessionId } = {}) => {
      runtime._termSessions = runtime._termSessions || new Map();
      const sid = sessionId || "default";
      const exists = runtime._termSessions.has(sid);
      if (exists) {
        runtime._termSessions.delete(sid);
        return { ok: true, sessionId: sid, closed: true };
      }
      return { ok: false, error: `Sesión '${sid}' no encontrada.` };
    },

    list_sessions: async () => {
      runtime._termSessions = runtime._termSessions || new Map();
      const sessions = [];
      for (const [id, s] of runtime._termSessions.entries()) {
        sessions.push({
          id,
          cwd: s.cwd,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          historyCount: s.history.length,
          envKeysCount: Object.keys(s.env || {}).length,
        });
      }
      return { ok: true, count: sessions.length, sessions };
    },

    // ── 5. Gestión Avanzada de Procesos ─────────────────────────────────────
    list_processes: async ({ filterName, limit = 50, sortBy = "memory" } = {}) => {
      try {
        const cmd = "Get-Process | Select-Object Id, ProcessName, WorkingSet64, CPU, Responding | ConvertTo-Json -Compress";
        const res = await runtime.run(cmd);
        if (!res.ok) return { ok: false, error: res.stderr || "Error consultando procesos." };

        let processes = [];
        try {
          const parsed = JSON.parse(res.stdout);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          processes = list.map((p) => ({
            pid: p.Id,
            name: p.ProcessName,
            memoryMB: Math.round((p.WorkingSet64 || 0) / (1024 * 1024)),
            cpu: p.CPU ? Number(p.CPU.toFixed(1)) : 0,
            responding: p.Responding !== false,
          }));
        } catch {
          return { ok: false, error: "Error procesando lista JSON de procesos en Windows." };
        }

        if (filterName) {
          const lower = filterName.toLowerCase();
          processes = processes.filter((p) => p.name.toLowerCase().includes(lower));
        }

        if (sortBy === "cpu") processes.sort((a, b) => (b.cpu || 0) - (a.cpu || 0));
        else if (sortBy === "name") processes.sort((a, b) => a.name.localeCompare(b.name));
        else processes.sort((a, b) => (b.memoryMB || 0) - (a.memoryMB || 0));

        const max = Math.min(Number(limit) || 50, 200);
        return { ok: true, count: Math.min(processes.length, max), total: processes.length, processes: processes.slice(0, max) };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    kill_process: async ({ pid } = {}) => {
      if (!pid) return { ok: false, code: "INVALID_INPUT", error: "El parámetro 'pid' es requerido." };
      const numPid = Number(pid);
      const res = await runtime.run(`Stop-Process -Id ${numPid} -Force -ErrorAction SilentlyContinue`);
      return {
        ok: res.ok,
        pid: numPid,
        killed: res.ok,
        code: res.ok ? "OK" : "NOT_FOUND",
        error: res.ok ? undefined : `Proceso con PID ${numPid} no encontrado o no se pudo terminar.`
      };
    },

    kill_process_tree: async ({ pid } = {}) => {
      if (!pid) return { ok: false, code: "INVALID_INPUT", error: "El parámetro 'pid' es requerido." };
      const numPid = Number(pid);
      try {
        const res = await runtime.run(`taskkill /PID ${numPid} /T /F`);
        return {
          ok: res.ok,
          pid: numPid,
          killedTree: res.ok,
          code: res.ok ? "OK" : "NOT_FOUND",
          output: res.stdout || res.stderr,
          error: res.ok ? undefined : (res.stderr || res.stdout || `Proceso con PID ${numPid} no encontrado.`)
        };
      } catch (e) {
        return { ok: false, pid: numPid, code: "PROCESS_FAILED", error: e.message };
      }
    },

    // ── Acciones de Interfaz / Apertura ──────────────────────────────────────
    open_url: async ({ url } = {}) => {
      if (!url) return { ok: false, error: "El parámetro 'url' es requerido." };
      const res = await runtime.run(`Start-Process ${runtime.shellQuote(url)}`);
      return { ok: res.ok, url };
    },

    open_file_explorer: async ({ path: folderPath } = {}) => {
      const target = folderPath ? runtime.hp(folderPath) : (process.env.USERPROFILE || runtime.home);
      const res = await runtime.run(`Start-Process explorer.exe ${runtime.shellQuote(target)}`);
      return { ok: res.ok, opened: target };
    },

    // ── Ejecución Elevada ─────────────────────────────────────────────────────
    run_as_admin: async ({ command, cwd } = {}) => {
      if (!command) return { ok: false, error: "El parámetro 'command' es requerido." };
      if (!runtime.permissions?.isElevationActive()) {
        return {
          ok: false,
          requires_elevation: true,
          error: "ELEVATION_REQUIRED",
          message: "Esta acción en terminal requiere permisos elevados de administración. Solicita autorización al usuario (ej. 'te doy permiso total' para 20 minutos o 'permiso de 1 hora').",
          prompt_to_user: "Esta operación requiere permisos elevados de administrador en la terminal. ¿Deseas autorizar la ejecución? (Diga 'te doy permiso total' para 20 minutos o especifica una duración).",
        };
      }
      try {
        const result = await runtime.runElevated(command, { cwd: cwd ? runtime.hp(cwd) : undefined });
        return { ok: true, elevated: true, stdout: result.stdout, stderr: result.stderr, exitCode: result.code };
      } catch (e) {
        return { ok: false, elevated: true, error: e.message };
      }
    },

    admin_terminal: async (args) => {
      return actions.run_as_admin(args);
    },

    terminal_admin: async (args) => {
      return actions.run_as_admin(args);
    },

    run_admin_command: async (args) => {
      return actions.run_as_admin(args);
    },
  };

  // Alias intuitivos para llamadas de LLMs
  actions.execute_command = actions.run_command;
  actions.exec = actions.run_command;
  actions.command = actions.run_command;
  actions.execute = actions.run_command;

  const permissions = {
    run_command: "poweruser",
    execute_command: "poweruser",
    exec: "poweruser",
    command: "poweruser",
    execute: "poweruser",
    run_background: "poweruser",
    run_script: "poweruser",
    run_inline_script: "poweruser",
    run_as_admin: "admin",
    admin_terminal: "admin",
    terminal_admin: "admin",
    run_admin_command: "admin",
    kill_process: "poweruser",
    kill_process_tree: "poweruser",
    kill_background_task: "poweruser",
    run_session_command: "poweruser",
    open_url: "user",
    open_file_explorer: "user",
    create_session: "user",
    attach_session: "user",
    close_session: "user",
    list_sessions: "user",
    list_background_tasks: "user",
    get_background_output: "user",
    wait_for_background_task: "user",
    list_processes: "user",
  };

  return domain(
    "terminal",
    "Ejecución profesional de comandos, scripts interactivos, sesiones persistentes con gestión de entorno, tareas background y control de procesos del sistema.",
    actions,
    permissions
  );
}
