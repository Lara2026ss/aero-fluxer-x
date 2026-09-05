export function createGuideDomain({ runtime, domain }) {
  const actions = {
    permissions_info: async () => {
      return {
        ok: true,
        levels: [
          { name: "visitor", aliases: ["guest"], description: "Acceso mínimo de solo lectura exploratorio." },
          { name: "standard", aliases: ["user"], description: "Nivel por defecto. Operaciones de lectura y escritura seguras, inspección de paquetes y estado." },
          { name: "advanced", aliases: ["poweruser"], description: "Operaciones avanzadas, instalación de paquetes y ejecución controlada de terminal." },
          { name: "maintainer", aliases: ["admin"], description: "Gestión de red, procesos, scripts de mantenimiento y configuración avanzada." },
          { name: "developer", aliases: [], description: "Modificaciones al core del MCP, diagnósticos profundos y debugging del motor." },
          { name: "system_root", aliases: ["admintotaluser"], description: "Máxima autoridad funcional y bypass de restricciones con autorización explícita del usuario." }
        ],
        security_rationale: {
          why_permissions_exist: "Para proteger la privacidad y seguridad del equipo del usuario, este servidor MCP aplica el Principio de Mínimo Privilegio. Evita que el asistente AI ejecute comandos de consola o mutaciones sensibles de forma desatendida o accidental.",
          safety_guarantee: "Las autorizaciones son estrictamente internas del protocolo MCP para asegurar la supervisión de operaciones locales en el entorno de desarrollo.",
          golden_rule: "REGLA DE CONSENTIMIENTO: El asistente debe consultar SIEMPRE al usuario en el chat de forma cordial, educativa y transparente antes de solicitar o ejecutar cualquier acción con impacto en el sistema."
        },
        path_privacy: {
          concept: "Privacidad automática de rutas de usuario de Windows (ofuscación con ~ o <user>) para evitar exposiciones involuntarias en repositorios o logs.",
          how_to_reveal: "Si se necesita visualizar la ruta absoluta real para depuración o confirmación del usuario, pasa 'revealPath: true' o 'allow_user_path: true' en herramientas como 'developer.upd_check', 'git_status_structured', etc."
        },
        workflow_system: {
          concept: "Ventana de trabajo temporal autorizada por el usuario para tareas de desarrollo avanzadas.",
          how_to_use: "Si requieres ejecutar operaciones de alto impacto continuadas (ej. terminal o mutaciones), consulta al usuario en el chat. Tras su confirmación explícita, usa 'security.approve_request({ requestId, confirmationCode, grantMinutes: 5 })' o 'security.start_workflow({ level: 'advanced', durationMinutes: 5 })'.",
          expiration: "Al expirar la ventana de tiempo autorizada, la sesión vuelve al nivel 'standard' automáticamente sin dejar puertas traseras abiertas.",
          best_practice: "Pide el nivel canónico adecuado (ej. 'advanced') por el tiempo estimado (ej. 5 a 20 min) solo cuando sea estrictamente necesario."
        },
        updates: {
          how_to_update: "Para aplicar actualizaciones oficiales de Fluxer X, usa la herramienta 'upd' con action: 'apply'. Pide siempre confirmación al usuario en el chat (ej: '¿Deseas actualizar a vX.X.X?') y cuando te dé su visto bueno llama a 'upd' con { action: 'apply', confirm: true }. No requiere elevación ni configuraciones complejas."
        },
        permission_denied: "Si recibes PERMISSION_DENIED o CONFIRMATION_REQUIRED en una acción sensible, explica al usuario de manera clara y amigable qué operación deseas ejecutar y solicita su visto bueno antes de continuar."
      };
    },

    best_practices: async () => {
      return {
        ok: true,
        guidelines: [
          { rule: "read_before_write", detail: "Siempre lee el contenido de un archivo (con 'files.read_text_file' o 'files.read_file_range') antes de intentar sobrescribirlo o editarlo." },
          { rule: "use_compact_mode", detail: "Para directorios grandes o archivos largos, usa 'compact: true' para ahorrar tokens y no desbordar el contexto." },
          { rule: "path_privacy_awareness", detail: "Las rutas de usuario están ofuscadas por defecto para mayor privacidad. Usa 'revealPath: true' o 'allow_user_path: true' cuando el usuario te autorice ver la ruta completa." },
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
            "Usa 'approve_request' con confirmationCode y grantMinutes para habilitar una ventana de trabajo aprobada.",
            "Usa 'start_workflow' si te encuentras con PERMISSION_DENIED tras la autorización explícita del usuario.",
            "Solo puede haber 1 workflow activo. Si llamas a 'start_workflow' de nuevo, sobreescribirá el anterior."
          ]
        },
        diagnostics: {
          description: "Salud del servidor y diagnósticos.",
          tips: [
            "Si sospechas que perdiste permisos, usa 'diagnostics.health' o 'security.get_workflow' para ver tu estado actual."
          ]
        },
        developer: {
          description: "Herramientas de inspección Git y actualizaciones del MCP.",
          tips: [
            "Usa 'upd_check' con 'checkRepo: true' para validar contra el repositorio remoto y etiquetas locales.",
            "Usa 'revealPath: true' si requieres la ruta absoluta desofuscada."
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
    permissions_info: "standard",
    best_practices: "standard",
    tool_usage: "standard",
    search_tools: "standard",
  };

  return domain("guide", "Documentación oficial interna, reglas y mejores prácticas para IAs que operan este MCP.", actions, permissions);
}
