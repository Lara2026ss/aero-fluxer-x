export function createGuideDomain({ runtime, domain }) {
  const actions = {
    permissions_info: async () => {
      return {
        ok: true,
        levels: [
          { name: "guest", description: "Acceso mínimo. Casi nulo." },
          { name: "user", description: "Nivel por defecto. Operaciones de lectura y escritura seguras." },
          { name: "poweruser", description: "Permisos para herramientas como instalación de paquetes básicos y comandos simples de terminal." },
          { name: "admin", description: "Gestión de red, ejecución avanzada de scripts." },
          { name: "developer", description: "Modificaciones al core del MCP y debugging." },
          { name: "admintotaluser", description: "Acceso total, bypass de modos de seguridad, máxima autoridad funcional." }
        ],
        workflow_system: {
          concept: "Una elevación de permisos temporal solicitada por la IA.",
          how_to_use: "Usa 'security.start_workflow({ level, durationMinutes: 5 })'. Al hacerlo, el servidor te devolverá CONFIRMATION_REQUIRED. Debes preguntar AL USUARIO (en el chat) si te da permiso. Si el usuario dice que sí, debes llamar a 'security.approve_request({ requestId })'.",
          expiration: "Al expirar, volverás al nivel 'user' y cualquier operación privilegiada devolverá PERMISSION_DENIED.",
          best_practice: "Pide el nivel que necesitas (ej. 'poweruser') por el tiempo que estimes (ej. 20) solo cuando debas usar herramientas de alto riesgo."
        },
        permission_denied: "Si recibes PERMISSION_DENIED, el servidor te dirá exactamente qué nivel necesitas. Llama a 'security.start_workflow' para solicitar dicho nivel y reintenta."
      };
    },

    best_practices: async () => {
      return {
        ok: true,
        guidelines: [
          { rule: "read_before_write", detail: "Siempre lee el contenido de un archivo (con 'files.read_text_file' o 'files.read_file_range') antes de intentar sobrescribirlo o editarlo." },
          { rule: "use_compact_mode", detail: "Para directorios grandes o archivos largos, usa 'compact: true' para ahorrar tokens y no desbordar el contexto." },
          { rule: "verify_results", detail: "No asumas que HTTP 200 o 'ok: true' significa éxito. Verifica los cambios reales en disco." },
          { rule: "handle_errors", detail: "Si una herramienta falla, lee el mensaje de error estructurado y adapta tu estrategia. No repitas el mismo comando ciegamente." },
          { rule: "step_by_step", detail: "Trabaja por fases, no intentes hacer refactors masivos en una sola llamada." }
        ]
      };
    },

    tool_usage: async ({ tool_name = "all" } = {}) => {
      const usage = {
        files: {
          description: "Manejo de sistema de archivos local.",
          tips: [
            "Usa 'list_directory' con 'compact: true' para reducir output.",
            "Usa 'read_text_file' con 'compact: true' para ignorar líneas vacías y comprimir espacios.",
            "Usa 'replace_file_content' para ediciones precisas (si estuviera disponible) o reescribe cuidando no perder datos importantes."
          ]
        },
        security: {
          description: "Permisos, criptografía y auditoría.",
          tips: [
            "Usa 'start_workflow' si te encuentras con PERMISSION_DENIED.",
            "Solo puede haber 1 workflow activo. Si llamas a 'start_workflow' de nuevo, sobreescribirá el anterior."
          ]
        },
        diagnostics: {
          description: "Salud del servidor y diagnósticos.",
          tips: [
            "Si sospechas que perdiste permisos, usa 'diagnostics.health' o 'security.get_workflow' para ver tu estado actual."
          ]
        },
        system: {
          description: "Interacción con OS, espera síncrona.",
          tips: [
            "Usa 'system.wait' para pausas reales. Si el servidor te avisa de un timeout seguro, simplemente vuelve a invocar 'wait' con los segundos restantes para completar tu pausa."
          ]
        }
      };

      if (tool_name !== "all" && usage[tool_name]) {
        return { ok: true, tool: tool_name, usage: usage[tool_name] };
      }
      return { ok: true, usage };
    },

    search_tools: async ({ query, domain: dom, limit = 10 } = {}) => {
      if (!runtime._registry) return { ok: false, error: "Registry no disponible." };
      const matches = runtime._registry.searchTools(query, { domain: dom, limit });
      return { ok: true, query, count: matches.length, matches };
    }
  };

  const permissions = {
    permissions_info: "user",
    best_practices: "user",
    tool_usage: "user",
    search_tools: "user",
  };

  return domain("guide", "Documentación oficial interna, reglas y mejores prácticas para IAs que operan este MCP.", actions, permissions);
}
