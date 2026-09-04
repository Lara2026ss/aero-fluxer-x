import crypto from "node:crypto";
import { unwrapArgs } from "./json-utils.mjs";

function classifyError(error, tool, action) {
  const msg = String(error?.message || error || "").toLowerCase();
  if (msg.includes("required") || msg.includes("inválid") || msg.includes("invalid") || msg.includes("se requiere") || msg.includes("es requerido")) {
    return {
      code: "INVALID_INPUT",
      suggestion: `Verifique los parámetros requeridos para la acción "${tool}.${action}".`,
      recoverable: true,
    };
  }
  if (msg.includes("no existe") || msg.includes("not found") || msg.includes("enoent") || msg.includes("no encontrado")) {
    return {
      code: "NOT_FOUND",
      suggestion: "Verifique que la ruta o el recurso solicitado exista y sea accesible.",
      recoverable: true,
    };
  }
  if (msg.includes("permission") || msg.includes("denied") || msg.includes("permiso") || msg.includes("requiere nivel") || msg.includes("unauthorized")) {
    return {
      code: "PERMISSION_DENIED",
      suggestion: "Solicite confirmación o elevación de permisos al usuario.",
      recoverable: true,
    };
  }
  if (msg.includes("timed out") || msg.includes("timeout") || msg.includes("tiempo de espera agotado") || msg.includes("abort")) {
    return {
      code: "TIMEOUT",
      suggestion: "Aumente el parámetro de timeout o ejecute la operación en background.",
      recoverable: true,
    };
  }
  if (msg.includes("blocked") || msg.includes("bloquead") || msg.includes("security")) {
    return {
      code: "SECURITY_BLOCKED",
      suggestion: "La operación fue restringida por las reglas de seguridad activas.",
      recoverable: false,
    };
  }
  return {
    code: "PROCESS_FAILED",
    suggestion: "Consulte el detalle del error para diagnosticar la causa raíz.",
    recoverable: true,
  };
}

export class Router {
  constructor({ runtime, registry }) {
    this.runtime = runtime;
    this.registry = registry;
    if (this.runtime) {
      this.runtime.router = this;
    }
    this.beforeHooks = [];
    this.afterHooks = [];
  }

  before(fn) {
    if (typeof fn === "function" && !this.beforeHooks.includes(fn)) {
      this.beforeHooks.push(fn);
    }
    return this;
  }

  after(fn) {
    if (typeof fn === "function" && !this.afterHooks.includes(fn)) {
      this.afterHooks.push(fn);
    }
    return this;
  }

  removeBefore(fn) {
    const idx = this.beforeHooks.indexOf(fn);
    if (idx !== -1) this.beforeHooks.splice(idx, 1);
    return this;
  }

  removeAfter(fn) {
    const idx = this.afterHooks.indexOf(fn);
    if (idx !== -1) this.afterHooks.splice(idx, 1);
    return this;
  }

  clearBeforeHooks() {
    this.beforeHooks = [];
    return this;
  }

  clearAfterHooks() {
    this.afterHooks = [];
    return this;
  }

  clearHooks() {
    this.beforeHooks = [];
    this.afterHooks = [];
    return this;
  }

  async execute(request, actionParam, argsParam) {
    let tool = "";
    let action = "";
    let args = {};

    if (typeof request === "string") {
      tool = request;
      action = String(actionParam || "");
      args = argsParam ?? {};
    } else if (request && typeof request === "object") {
      tool = String(request.tool || "");
      action = String(request.action || "");
      if (request.args && typeof request.args === "object") {
        const { tool: _t, action: _a, args: nested, ...rest } = request;
        args = { ...rest, ...nested };
      } else {
        const { tool: _t, action: _a, ...rest } = request;
        args = rest;
      }
    }

    // Normalización de args: soporta serialización en JSON string o anidación excesiva de clientes MCP (Claude Desktop)
    args = unwrapArgs(args);

    // Normalización inteligente de rutas y prefijos de clientes MCP (ej: "Aeron Fluxer X:upd_info", "fluxer:files.write_file", etc.)
    tool = tool
      .replace(/^aeron[_\s-]?fluxer[_\s-]?x[:_\s-]*/i, "")
      .replace(/^(fluxer|mcp)[:_\s-]*/i, "")
      .trim();
    action = action
      .replace(/^aeron[_\s-]?fluxer[_\s-]?x[:_\s-]*/i, "")
      .replace(/^(fluxer|mcp)[:_\s-]*/i, "")
      .trim();

    if (tool.includes(".")) {
      const parts = tool.split(".");
      tool = parts[0];
      if (!action || action === parts[1]) action = parts[1];
    }

    if (action.includes(".")) {
      const parts = action.split(".");
      if (!tool || tool === parts[0]) tool = parts[0];
      action = parts[1];
    }

    // Si action no vino explícitamente, extraer de args si existe
    if (!action && args && typeof args === "object") {
      if (args.action) {
        action = String(args.action);
        delete args.action;
      } else if (args.subaction) {
        action = String(args.subaction);
        delete args.subaction;
      } else if (args.subcommand) {
        action = String(args.subcommand);
        delete args.subcommand;
      } else if (args.subtool) {
        action = String(args.subtool);
        delete args.subtool;
      }
    }

    // Soporte nativo para sleep / wait (ej: tool: "sleep", action: "5")
    if (["sleep", "wait", "delay"].includes(tool.toLowerCase())) {
      const sec = Number(action) || Number(args.seconds) || Number(args.sec) || 1;
      tool = "system";
      action = "sleep";
      args = { seconds: sec, ...args };
    }

    // Soporte unificado para la herramienta "upd" y sus subherramientas
    if (tool.toLowerCase() === "upd") {
      tool = "developer";
      const requestedAction = String(action || args.action || "").toLowerCase().trim();
      if (requestedAction === "check" || requestedAction === "upd_check") {
        action = "upd_check";
      } else if (requestedAction === "info" || requestedAction === "upd_info") {
        action = "upd_info";
      } else if (requestedAction === "data" || requestedAction === "status" || requestedAction === "upd_data") {
        action = "upd_data";
      } else if (requestedAction === "apply" || requestedAction === "update" || requestedAction === "upd" || !requestedAction) {
        action = "upd";
      } else {
        action = "upd";
      }
    } else if (["upd_check", "upd_info", "upd_data"].includes(tool.toLowerCase())) {
      action = tool.toLowerCase();
      tool = "developer";
    }

    // Soporte nativo para skills invocados directamente como tool
    if (["create_skill", "edit_skill", "delete_skill", "get_skill", "list_skills", "validate_skill"].includes(tool.toLowerCase())) {
      action = tool.toLowerCase();
      tool = "developer";
    }

    // Soporte nativo para str_replace / replace_in_file invocados directamente como tool
    if (["str_replace", "replace_in_file", "replace_file_content"].includes(tool.toLowerCase())) {
      action = tool.toLowerCase();
      tool = "files";
    }

    // Soporte nativo para verify_html_integrity invocado directamente como tool
    if (["verify_html_integrity", "html_integrity", "check_html"].includes(tool.toLowerCase())) {
      action = "verify_html_integrity";
      tool = "diagnostics";
    }

    // Soporte nativo para clean_ram / analyze_memory / terminate_process
    if (["clean_ram", "optimize_ram", "clean_memory"].includes(tool.toLowerCase())) {
      action = "clean_ram";
      tool = "system";
    }
    if (["analyze_memory", "analyze_memory_usage"].includes(tool.toLowerCase())) {
      action = "analyze_memory_usage";
      tool = "system";
    }
    if (["terminate_process", "kill_process_by_name"].includes(tool.toLowerCase())) {
      action = "terminate_process";
      tool = "system";
    }

    // Soporte nativo para bcd_manager y manage_disks
    if (["bcd_manager", "bcdedit", "bcd"].includes(tool.toLowerCase())) {
      action = "bcd_manager";
      tool = "system";
    }
    if (["manage_disks", "disk_manager", "disks"].includes(tool.toLowerCase())) {
      action = "manage_disks";
      tool = "system";
    }

    // Soporte nativo para admin_terminal y elevación de permisos
    if (["admin_terminal", "terminal_admin", "run_admin_command", "run_as_admin"].includes(tool.toLowerCase())) {
      action = "run_as_admin";
      tool = "terminal";
    }
    if (["grant_elevation", "grant_admin_permission", "te_doy_permiso_total", "permiso_total"].includes(tool.toLowerCase())) {
      action = "grant_elevation";
      tool = "security";
    }
    if (["get_elevation_status", "elevation_status"].includes(tool.toLowerCase())) {
      action = "get_elevation_status";
      tool = "security";
    }
    if (["revoke_elevation"].includes(tool.toLowerCase())) {
      action = "revoke_elevation";
      tool = "security";
    }

    // Mapeo exhaustivo de alias para compatibilidad total con llamadas de LLMs
    const DOMAIN_ACTION_ALIASES = {
      files: {
        read_file: "read_text_file",
        create_file: "write_file",
        delete_file: "delete_path",
        delete: "delete_path",
        list_files: "list_directory",
        get_metadata: "get_file_info",
        get_info: "get_file_info",
        patch_file: "patch_file",
        surgical_edit: "surgical_edit",
        diff: "compare_files",
        compare: "compare_files",
        check_path: "validate_path",
      },
      packages: {
        list_installed_packages: "list_installed",
        list_packages: "list_installed",
        list: "list_installed",
        search: "search_package",
        info: "package_info",
        install: "install_package",
        remove: "remove_package",
        uninstall: "remove_package",
        update: "update_package",
        upgrade: "update_package",
      },
      database: {
        list_tables: "search_tables",
        show_tables: "search_tables",
        tables: "search_tables",
        query: "execute_query",
        schema: "describe_table",
        describe: "describe_table",
        script: "execute_script",
      },
      shortcuts: {
        list_shortcuts: "list",
        list_all: "list",
        create_shortcut: "create",
        add_shortcut: "create",
        run: "execute",
        run_shortcut: "execute",
        execute_shortcut: "execute",
        delete_shortcut: "delete",
        get_shortcut: "get",
        backup_shortcuts: "backup_shortcuts",
        restore_shortcuts: "restore_shortcuts",
        export_shortcuts: "export_shortcuts",
        import_shortcuts: "import_shortcuts",
      },
      terminal: {
        execute_command: "run_command",
        exec: "run_command",
        command: "run_command",
        execute: "run_command",
      },
      system: {
        get_info: "get_system_snapshot",
        info: "get_system_snapshot",
        system_info: "get_system_snapshot",
        snapshot: "get_system_snapshot",
        ram: "analyze_memory_usage",
        memory: "analyze_memory_usage",
        free_ram: "clean_ram",
        optimize_windows: "optimize_windows",
        revert_windows_optimization: "revert_windows_optimization",
        get_optimization_status: "get_optimization_status",
        optimize_gpu_memory: "optimize_gpu_memory",
        performance: "get_performance_summary",
        performance_summary: "get_performance_summary",
      },
      diagnostics: {
        health: "health_check",
        check: "health_check",
        status: "health_check",
        doctor: "health_check",
        compact_status: "compact_status",
      },
      network: {
        ping: "test_connection",
        test: "test_connection",
        check: "test_connection",
      },
      security: {
        status: "get_elevation_status",
        elevation: "get_elevation_status",
        grant: "grant_elevation",
        revoke: "revoke_elevation",
      },
      developer: {
        detect: "detect_project",
        skills: "list_skills",
        check_update: "upd_check",
        update_info: "upd_info",
        update_status: "upd_data",
        upd_check: "upd_check",
        upd_info: "upd_info",
        upd_data: "upd_data",
        upd_apply: "upd_apply",
        upd_rollback: "upd_rollback",
      },
    };

    const registeredDomains = this.registry.moduleNames();
    let toolLower = tool.toLowerCase();

    // Si action no vino, comprobar si tool en realidad es el nombre de una acción o alias
    if (!action) {
      // 1. Buscar en aliases de dominios
      for (const [dom, aliases] of Object.entries(DOMAIN_ACTION_ALIASES)) {
        if (aliases[toolLower]) {
          action = aliases[toolLower];
          tool = dom;
          toolLower = dom;
          break;
        }
      }
      // 2. Buscar si tool coincide con alguna acción registrada directamente
      if (!action) {
        for (const dom of registeredDomains) {
          if (this.registry.actionsFor(dom).includes(toolLower)) {
            action = toolLower;
            tool = dom;
            toolLower = dom;
            break;
          }
        }
      }
      // 3. Si tool es un dominio registrado pero action falta, aplicar default inteligente según args
      if (!action && registeredDomains.includes(toolLower)) {
        if (toolLower === "files") {
          if (args.path && args.content !== undefined) action = "write_file";
          else if (args.path) action = "read_text_file";
          else action = "list_directory";
        } else if (toolLower === "terminal") {
          action = "run_command";
        } else if (toolLower === "system") {
          action = "get_system_snapshot";
        } else if (toolLower === "database") {
          action = args.query ? "execute_query" : "search_tables";
        } else if (toolLower === "packages") {
          action = "list_installed";
        } else if (toolLower === "shortcuts") {
          action = "list";
        } else if (toolLower === "security") {
          action = "get_elevation_status";
        } else if (toolLower === "network") {
          action = "test_connection";
        } else if (toolLower === "diagnostics") {
          action = "health_check";
        } else if (toolLower === "developer") {
          action = "detect_project";
        }
      }
    }

    const actionLower = action.toLowerCase();
    if (DOMAIN_ACTION_ALIASES[toolLower]?.[actionLower]) {
      action = DOMAIN_ACTION_ALIASES[toolLower][actionLower];
    }

    if (!tool || !action) throw new Error("tool and action are required");

    if (action === "reload" || action === "reload_server") {
      const reloadRes = await this.runtime.control.reload();
      return { ok: true, tool, action, data: reloadRes };
    }

    if (action === "shutdown" || action === "shutdown_server") {
      setTimeout(() => this.runtime.control.shutdown(), 50);
      return { ok: true, tool, action, message: "Server shutting down for graceful restart." };
    }

    let resolved = this.registry.resolve(tool, action);
    if (!resolved) {
      // Búsqueda inversa: solo permitida si el llamador NO especificó un dominio registrado concreto.
      // Si el tool especificado ES un módulo registrado (ej: 'system', 'files'), pero la acción no existe
      // en él, NO se debe secuestrar a otro dominio (previene cross-domain hijacking / confusión).
      const registeredDomains = this.registry.moduleNames();
      const isExplicitRegisteredDomain = registeredDomains.includes(tool);

      if (!isExplicitRegisteredDomain) {
        for (const domainName of registeredDomains) {
          if (this.registry.actionsFor(domainName).includes(action)) {
            tool = domainName;
            resolved = this.registry.resolve(tool, action);
            break;
          }
        }
      }
    }

    if (!resolved) throw new Error(`unknown route: ${tool}.${action}`);

    // ID único de trazabilidad para toda la cadena de ejecución
    const requestId = crypto.randomUUID();
    const started = performance.now();

    try {
      // Si la acción requiere más nivel del que hay activo, en vez de sólo
      // lanzar PERMISSION_DENIED creamos una solicitud de confirmación
      // puntual ("pedir permiso al usuario"). El cliente MCP (Claude) recibe
      // CONFIRMATION_REQUIRED + requestId, se lo muestra al humano, y si
      // dice que sí llama a security.approve_request con ese requestId —
      // lo cual reintenta ESTA llamada exacta, no un grant general.
      const required = this.runtime.permissions.requiredFor({ tool, action }, resolved.unit);
      const current = this.runtime.permissions.currentLevel();
      const trustedBypass = process.env.FLUXER_TRUSTED_CLIENT === "true" || this.runtime.config?.security?.trustedClient === true;

      const needsMoreLevel = this.runtime.permissions.levelRank(current) < this.runtime.permissions.levelRank(required);

      // No basta con que el llamador mande "__confirmed: true": eso sería
      // trivial de falsificar y anularía todo el sistema. Se exige el
      // requestId real emitido por este mismo router, y se verifica en el
      // store que esa solicitud sigue existiendo con status "approved" —
      // approve_request() es el único lugar que la pone en ese estado, y
      // solo lo hace tras una llamada explícita del humano.
      const confirmedReq = args.__confirmationRequestId
        ? this.runtime.confirmations.get(args.__confirmationRequestId)
        : null;
      const wasJustConfirmed = Boolean(
        confirmedReq &&
        confirmedReq.status === "approved" &&
        confirmedReq.tool === tool &&
        confirmedReq.action === action,
      );

      if (!trustedBypass && needsMoreLevel && !wasJustConfirmed) {
        const { requestId } = this.runtime.confirmations.request({ tool, action, args, required, current });
        const durationMs = Math.round(performance.now() - started);
        this.runtime.logger.warn("confirmation_required", { request_id: requestId, tool, action, required, current });
        // Audit log — acción requirió confirmación
        this.runtime.auditLog?.record({
          agent: this.runtime.client?.name,
          tool, action, args,
          permission: required,
          result: "confirmation_required",
          durationMs,
          traceId: requestId,
        });
        return {
          ok: false,
          code: "CONFIRMATION_REQUIRED",
          tool,
          action,
          requestId,
          required,
          current,
          durationMs,
          message: `La acción "${tool}.${action}" requiere nivel "${required}" (actual: "${current}"). Pide confirmación al usuario y, si acepta, llama a security.approve_request con { requestId: "${requestId}" }.`,
        };
      }

      // wasJustConfirmed=true significa que existe un requestId real, con
      // status "approved", emitido por este router para este tool.action
      // exacto — esa aprobación puntual del humano ES la autorización para
      // esta llamada, así que no volvemos a exigir el nivel general aquí.
      // Una vez consumida, se marca como gastada para que no sirva dos veces.
      if (!wasJustConfirmed) {
        this.runtime.permissions.assertAllowed({ tool, action }, resolved.unit);
      } else {
        confirmedReq.status = "consumed";
      }
      this.runtime.circuitBreaker.assert(`${tool}.${action}`);

      for (const hook of this.beforeHooks) {
        await hook({ request: { tool, action, args }, runtime: this.runtime });
      }


      const raw = await resolved.handler(args, this.runtime, this);
      const durationMs = Math.round(performance.now() - started);
      const compacted = this.runtime.compact(raw, args);

      // Determinar si la acción tuvo éxito o falló inspeccionando ok, status, code y error
      let isOk = true;
      if (raw && typeof raw === "object") {
        if (raw.ok !== undefined) {
          isOk = Boolean(raw.ok);
        } else if (raw.status !== undefined) {
          const successStatuses = ["ok", "received", "success", "duplicate", "queued"];
          isOk = successStatuses.includes(String(raw.status).toLowerCase());
        } else if (raw.error !== undefined) {
          isOk = false;
        } else if (raw.code && ["RATE_LIMITED", "INVALID_INPUT", "BLOCKED_SENSITIVE_DATA", "GATEWAY_UNAVAILABLE"].includes(raw.code)) {
          isOk = false;
        } else if (compacted && typeof compacted === "object" && compacted.ok !== undefined) {
          isOk = Boolean(compacted.ok);
        }
      }

      // Determinar resultado semántico exacto para el audit log
      let auditResult = isOk ? "ok" : "error";
      if (raw && typeof raw === "object") {
        if (raw.status === "rate_limited" || raw.code === "RATE_LIMITED") {
          auditResult = "rate_limited";
        } else if (raw.status === "blocked" || raw.code === "BLOCKED_SENSITIVE_DATA") {
          auditResult = "blocked";
        } else if (raw.status === "invalid_input" || raw.code === "INVALID_INPUT") {
          auditResult = "invalid_input";
        } else if (raw.status === "unavailable" || raw.code === "GATEWAY_UNAVAILABLE") {
          auditResult = "unavailable";
        } else if (raw.status === "duplicate") {
          auditResult = "duplicate";
        } else if (raw.status === "queued") {
          auditResult = "queued";
        } else if (!isOk) {
          auditResult = "error";
        }
      }

      const innerData = compacted.data !== undefined ? compacted.data : compacted;

      let response;
      if (typeof innerData === "object" && innerData !== null && !Array.isArray(innerData)) {
        response = {
          ok: isOk,
          tool,
          action,
          durationMs,
          ...innerData,
        };
        if (response.ok === undefined) response.ok = isOk;
      } else {
        response = {
          ok: isOk,
          tool,
          action,
          durationMs,
          data: innerData,
        };
      }

      if (isOk) {
        this.runtime.circuitBreaker.success(`${tool}.${action}`);
      }

      // Métricas automáticas por ruta
      this.runtime.metrics.timing("tool_duration", durationMs, {
        tool,
        action,
      });
      this.runtime.metrics.inc("tool_calls", { tool, action, ok: String(isOk) });

      this.runtime.memory.recordCall({
        tool,
        action,
        ok: isOk,
        durationMs,
        client: this.runtime.client,
        traceId: requestId,
      });

      // Audit log — registra el resultado real verificado
      const required2 = this.runtime.permissions.requiredFor({ tool, action }, resolved.unit);
      this.runtime.auditLog?.record({
        agent: this.runtime.client?.name,
        tool, action, args,
        permission: required2,
        result: auditResult,
        durationMs,
        traceId: requestId,
        ...(isOk ? {} : { error: raw?.message || raw?.error || auditResult }),
      });

      // Log estructurado con campos estándar
      this.runtime.logger.info("tool_ok", {
        request_id: requestId,
        client: this.runtime.client.name,
        tool,
        action,
        elapsed_ms: durationMs,
        queue_size: this.runtime.taskQueue.queueSize,
      });

      for (const hook of this.afterHooks) {
        await hook({
          request: { tool, action, args },
          response,
          runtime: this.runtime,
        });
      }

      // Format response if handler returned ok: false with error
      if (!isOk && response.error && !response.code) {
        const classification = classifyError(response.error, tool, action);
        response.code = classification.code;
        if (!response.suggestion) response.suggestion = classification.suggestion;
        if (response.recoverable === undefined) response.recoverable = classification.recoverable;
      }

      return response;
    } catch (error) {
      const durationMs = Math.round(performance.now() - started);
      const normalizedError =
        error instanceof Error
          ? error
          : new Error(
              typeof error === "string"
                ? error
                : JSON.stringify(error ?? "unknown_error"),
            );

      const classification = classifyError(normalizedError, tool, action);

      this.runtime.circuitBreaker.failure(`${tool}.${action}`);
      this.runtime.metrics.inc("tool_calls", { tool, action, ok: "false" });

      try {
        this.runtime.memory.recordCall({
          tool,
          action,
          ok: false,
          durationMs,
          client: this.runtime.client,
          error: normalizedError.message,
        });
      } catch {}

      // Audit log — herramienta falló
      this.runtime.auditLog?.record({
        agent: this.runtime.client?.name,
        tool, action, args,
        permission: "unknown",
        result: "error",
        durationMs,
        error: normalizedError.message,
        traceId: requestId,
      });

      this.runtime.logger.error("tool_fail", {
        request_id: requestId,
        client: this.runtime.client.name,
        tool,
        action,
        elapsed_ms: durationMs,
        error: normalizedError.message,
        code: classification.code,
        queue_size: this.runtime.taskQueue.queueSize,
      });

      // Enrich error object with structured fields
      normalizedError.code = normalizedError.code || classification.code;
      normalizedError.suggestion = classification.suggestion;
      normalizedError.recoverable = classification.recoverable;
      normalizedError.durationMs = durationMs;
      normalizedError.tool = tool;
      normalizedError.action = action;

      throw normalizedError;
    }
  }
}
