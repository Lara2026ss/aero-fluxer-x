import { CURRENT_VERSION } from "../core/version.mjs";

export function createGuideDomain({ runtime, domain }) {
  const actions = {

    // Table of contents / index
    index: async () => ({
      ok: true,
      version: CURRENT_VERSION,
      title: `Fluxer Core MCP v${CURRENT_VERSION} -- Guide Index`,
      sections: [
        { action: "image_to_pdf_guide", summary: "Guía completa: Conversión de Imágenes a PDF (álbumes, tamaños fit/A4/letter, orientación auto y calidad)" },
        { action: "print_guide", summary: "Guía completa: De PDF a Impresión Física (duplex, escala de grises, orientación auto, formatos compatibles, preflight y manejo de errores)" },
        { action: "web_search_guide", summary: "Guía completa: Búsqueda de Imágenes y Web (multi-proveedor, modo compacto, fallback estructurado, errores y recuperación)" },
        { action: "notifications_guide", summary: "Guía completa: Notificaciones nativas de Windows (conexión, desconexión, cierre/inicio de sesión, autorizaciones interactivas Sí/Declinar y control On/Off vía developer)" },
        { action: "recycle_bin_guide", summary: "Guía completa: Papelera de Reciclaje (eliminar a papelera, listar contenido y vaciado seguro)" },
        { action: "workflow_media_to_print", summary: "Flujo Integral: Buscar/descargar imagen web -> Convertir a PDF -> Preflight -> Imprimir en papel" },
        { action: "quick_start", summary: "Get started in 5 minutes -- new user setup" },
        { action: "tools", summary: "All tool domains overview (files, system, packages, terminal, flstudio, etc.)" },
        { action: "tool_usage", params: ["tool_name"], summary: "Detailed usage for a specific tool domain" },
        { action: "compact_mode", summary: "How compact mode works and when to enable/disable it" },
        { action: "best_practices", summary: "AI usage best practices and golden rules" },
        { action: "examples", params: ["domain"], summary: "Real usage examples per domain" },
        { action: "troubleshoot", params: ["issue?"], summary: "Common issues and how to fix them" },
        { action: "permissions", summary: "Security, permission levels, and workflow system" },
        { action: "changelog", summary: "Latest version changes and update history" },
        { action: "faq", summary: "Frequently asked questions" },
        { action: "search", params: ["query"], summary: "Search across all guide content" },
      ],
      tip: "Call guide { action: 'web_search_guide' }, guide { action: 'print_guide' }, or guide { action: 'image_to_pdf_guide' } for dedicated step-by-step guides.",
    }),

    quick_start: async () => ({
      ok: true,
      title: `Fluxer Core MCP v${CURRENT_VERSION} -- Quick Start`,
      steps: [
        { step: 1, title: "Verify installation", command: "diagnostics { action: 'health_check' }", note: "All checks should be PASS. If not, run diagnostics { action: 'report' } for details." },
        { step: 2, title: "Check for updates", command: "upd { action: 'check' }", note: "Always-fresh check from GitHub. If update available, confirm with upd { action: 'apply', confirm: true }." },
        { step: 3, title: "Run doctor", command: "upd { action: 'doctor' }", note: "20-point self-diagnostic. All invariants should PASS on a healthy install." },
        { step: 4, title: "Install on new client", command: "upd { action: 'install', mode: 'wizard' }", note: "Auto-detects Claude Desktop, Cursor, Windsurf, etc. and configures MCP automatically." },
        { step: 5, title: "Enable compact mode for bulk work", command: "diagnostics { action: 'set_compact', enabled: true }", note: "Reduces token usage during multi-step workflows. Disable before showing results to user." },
        { step: 6, title: "Read this guide", command: "guide { action: 'tools' }", note: "Get an overview of all tool domains." },
      ],
      github: "https://github.com/Lara2026ss/aero-fluxer-x",
      version: CURRENT_VERSION,
    }),

    image_to_pdf_guide: async () => ({
      ok: true,
      title: "Guía Maestra: Conversión de Imágenes a PDF (files.image_to_pdf)",
      overview: "Convierte imágenes individuales o álbumes multi-imagen a documentos PDF vectoriales optimizados, con control granular de dimensiones, orientación, márgenes y perfiles de calidad.",
      tool: "files",
      action: "image_to_pdf",
      aliases: ["convert_image_to_pdf", "img2pdf"],
      parameters: {
        path: "Ruta de la imagen de entrada (para conversión de una sola imagen). Ej: 'fotos/diagrama.png'",
        images: "Array de rutas de imágenes para compilar en un solo PDF multi-página ordenado. Ej: ['portada.png', 'pagina1.jpg', 'pagina2.png']",
        outPath: "Ruta del archivo PDF de salida. Si se omite, se genera con el mismo nombre y extensión .pdf.",
        paper_size: "Tamaño del lienzo: 'fit' (la hoja se adapta exactamente a las proporciones de la imagen sin bandas blancas), 'letter' (carta), 'a4', 'legal'. Por defecto: 'fit'.",
        orientation: "Orientación de la página: 'auto' (detecta si la imagen es horizontal o vertical y ajusta automáticamente), 'portrait' (vertical), 'landscape' (horizontal). Por defecto: 'auto'.",
        quality: "Perfil de compresión: 'alta' (mínima compresión, máxima nitidez para texto/gráficos), 'estandar' (balance equilibrado), 'basica' (ultra compacto).",
        fit: "Modo de escalado dentro de la página: 'contain' (mantiene aspect ratio completo dentro de los márgenes), 'cover' (llena la página recortando sobrantes), 'stretch' (estira sin respetar proporción). Por defecto: 'contain'.",
        margins: "Margen en puntos tipográficos (ej: 0, 10, 20). Por defecto: 0 para 'fit' o 20 para tamaños estándar de papel.",
      },
      recipes: [
        {
          title: "Conversión de Imagen Individual a su Tamaño Exacto (Sin bordes blancos)",
          code: "files { action: 'image_to_pdf', path: 'grafico.png', paper_size: 'fit', quality: 'alta' }",
          description: "Ideal para infografías, planos, capturas de pantalla y diagramas técnicos.",
        },
        {
          title: "Compilación de Álbum o Documento Escaneado Multi-Página",
          code: "files { action: 'image_to_pdf', images: ['escaneo_pag1.jpg', 'escaneo_pag2.jpg'], outPath: 'documento_completo.pdf', paper_size: 'a4', orientation: 'auto', quality: 'alta' }",
          description: "Une varias fotos de páginas en un único PDF ordenado listo para compartir o imprimir.",
        },
        {
          title: "Ficha en Tamaño Carta con Márgenes Profesionales",
          code: "files { action: 'image_to_pdf', path: 'foto.jpg', outPath: 'ficha.pdf', paper_size: 'letter', orientation: 'portrait', fit: 'contain', margins: 25 }",
          description: "Centra la fotografía en una hoja tamaño carta con márgenes limpios para impresión en oficina.",
        },
      ],
      best_practices: [
        "Para gráficos con texto o esquemas técnicos, usa siempre quality: 'alta' para evitar artefactos de compresión.",
        "Si la imagen ya tiene la proporción deseada, usa paper_size: 'fit' para evitar márgenes blancos no deseados.",
        "Para documentos oficiales en América usa paper_size: 'letter'; para Europa e internacional usa paper_size: 'a4'.",
      ],
    }),

    print_guide: async () => ({
      ok: true,
      title: "Guía Maestra: Impresión Inteligente v20.6 — Duplex, Escala de Grises, Orientación Auto y Recuperación de Errores",
      overview: "printcenter admite PDF, Word, imágenes y texto. Desde v20.5 incluye vistas previas ASCII+PNG; desde v20.6 añade impresión dúplex, escala de grises y orientación automática por dimensiones del contenido.",
      tool: "printcenter",
      workflow_steps: [
        {
          step: 1,
          title: "Descubrir impresoras instaladas",
          command: "printcenter { action: 'list_printers' }",
          detail: "Lista impresoras locales, de red, USB/WiFi y virtuales. Devuelve nombre, estado en línea, puerto y si soporta dúplex.",
        },
        {
          step: 2,
          title: "Vista previa — la IA 've' cómo quedará impreso",
          command: "printcenter { action: 'preview', file: 'documento.pdf', scale_mode: 'fit_to_printable_area' }",
          detail: "Genera un diagrama ASCII del layout de la hoja con márgenes, cobertura de tinta y si hay recorte (clipping_detected). También crea un PNG de referencia en caché.",
        },
        {
          step: 3,
          title: "Preflight preventivo (sin gastar papel)",
          command: "printcenter { action: 'preflight', file: 'documento.docx', preview: true }",
          detail: "Valida parámetros contra el driver: paper_size, duplex, dpi, color. Si la impresora no soporta dúplex, informa UNSUPPORTED_DUPLEX en rejections. Si no soporta color, informa UNSUPPORTED_COLOR.",
        },
        {
          step: 4,
          title: "Impresión con opciones avanzadas",
          command: "printcenter { action: 'print', file: 'reporte.pdf', duplex: 'duplex_long_edge', grayscale: true, orientation: 'auto' }",
          detail: "Envía al spooler de Windows con dúplex, monocromo y orientación auto-detectada desde las dimensiones del documento.",
        },
        {
          step: 5,
          title: "Impresión por lote de carpeta completa",
          command: "printcenter { action: 'print', folder: 'C:\\\\Users\\\\...\\\\Documentos' }",
          detail: "Escanea PDFs, Word e imágenes compatibles e imprime cada archivo secuencialmente con un informe consolidado.",
        },
      ],
      render_styles: {
        fit_to_page: "Ajusta el contenido a la hoja física completa manteniendo proporciones.",
        fit_to_printable_area: "Ajusta dentro de los márgenes imprimibles del hardware para evitar recortes.",
        actual_size: "Tamaño 100% sin alterar cotas; avisa si el contenido desborda la hoja.",
        shrink_oversized: "Reduce solo si sobrepasa la hoja; si cabe, mantiene al 100%.",
        custom: "Escala porcentual personalizada vía 'custom_scale' (ej: 85 para 85%).",
        stretch_to_fill: "Estira a toda el área ignorando el aspect ratio.",
        borderless: "Sin márgenes (ideal para fotos).",
      },
      advanced_options: {
        duplex: {
          description: "Impresión a dos caras. El motor reporta UNSUPPORTED_DUPLEX en preflight si la impresora no lo soporta.",
          values: {
            simplex: "Una sola cara (por defecto).",
            duplex_long_edge: "Doble cara con encuadernación horizontal (flip por el borde largo — modo libro).",
            duplex_short_edge: "Doble cara con encuadernación vertical (flip por el borde corto — modo bloc de notas).",
          },
          example: "printcenter { action: 'print', file: 'manual.pdf', duplex: 'duplex_long_edge' }",
          note: "Si la impresora no tiene unidad dúplex, el trabajo se envía sin dúplex y se reporta la advertencia. No se cancela silenciosamente.",
        },
        grayscale: {
          description: "Impresión en escala de grises / monocromática. Ahorra tóner/tinta de color.",
          values: { "grayscale: true": "Activa escala de grises.", "grayscale: false": "Color (por defecto)." },
          alternative: "color_mode: 'Grayscale' o color_mode: 'Monochrome' son equivalentes.",
          example: "printcenter { action: 'print', file: 'factura.pdf', grayscale: true }",
          note: "La respuesta incluye los campos 'grayscale: true' y 'color: false' confirmando el modo aplicado.",
        },
        orientation: {
          description: "Orientación de la página en la impresora.",
          values: {
            auto: "Detecta automáticamente Portrait/Landscape según dimensiones del contenido (imágenes: comparando ancho vs alto). Por defecto desde v20.6.",
            Portrait: "Vertical — calculado explícitamente.",
            Landscape: "Horizontal — calculado explícitamente.",
          },
          example: "printcenter { action: 'print', file: 'foto_panoramica.jpg', orientation: 'auto' }",
          note: "Para PDFs multi-página con 'auto', el engine detecta la orientación de la primera página renderizada. La respuesta incluye 'orientation' con el valor resuelto.",
        },
      },
      supported_formats: [
        "PDF (.pdf) — WinRT nativo a 300-600 DPI",
        "Word (.docx, .doc, .rtf) — Conversión automática vía Office COM",
        "Imágenes (.png, .jpg, .jpeg, .bmp, .webp, .gif, .tiff) — Directo",
        "Texto plano (.txt, .md, .log, .json, .csv) — Paginación automática",
      ],
      parameters: {
        file: "Ruta del archivo a imprimir o previsualizar.",
        folder: "Ruta de carpeta para impresión por lote.",
        printer: "Nombre de la impresora. Sin él, usa la predeterminada.",
        scale_mode: "Estilo de escalado. Ver render_styles arriba.",
        custom_scale: "Factor para modo custom (ej: 0.85 o 85).",
        alignment: "'center' o 'top_left'.",
        pages: "Rango de páginas (ej: '1', '1-3', '2,4').",
        copies: "Número de copias.",
        grayscale: "true para escala de grises, false para color.",
        color_mode: "'Color', 'Grayscale', 'Monochrome'.",
        paper_size: "'Letter', 'A4', 'Legal', etc.",
        orientation: "'auto', 'Portrait', 'Landscape'.",
        duplex: "'simplex', 'duplex_long_edge', 'duplex_short_edge'.",
        output_pdf: "Ruta de salida cuando se usa 'Microsoft Print to PDF' como destino.",
      },
      error_scenarios: [
        {
          error: "PRINTER_NOT_FOUND",
          cause: "El nombre de la impresora no coincide con ninguna instalada.",
          recovery: "Ejecutar printcenter { action: 'list_printers' } para ver nombres exactos. Usar el nombre completo sin abreviar.",
        },
        {
          error: "UNSUPPORTED_DUPLEX",
          cause: "Se solicitó duplex pero la impresora no tiene unidad dúplex.",
          recovery: "Cambiar a duplex: 'simplex' o imprimir manualmente a doble cara (voltear hojas). La advertencia aparece en rejections[] sin cancelar el trabajo.",
        },
        {
          error: "FILE_NOT_FOUND / UNSUPPORTED_FORMAT",
          cause: "El archivo no existe o su extensión no es compatible.",
          recovery: "Verificar la ruta con files { action: 'list' }. Formatos válidos: .pdf, .docx, .doc, .rtf, .png, .jpg, .jpeg, .bmp, .webp, .gif, .tiff, .txt, .md, .log, .json, .csv.",
        },
        {
          error: "WORD_COM_UNAVAILABLE",
          cause: "Office no está instalado o el proceso COM no responde al convertir .docx.",
          recovery: "Verificar instalación de Office con system { action: 'info' }. Alternativamente, convertir el .docx a PDF primero con files { action: 'image_to_pdf' } o una herramienta externa.",
        },
        {
          error: "spooler_seen: false tras el envío",
          cause: "El trabajo se enviló al API pero no apareció en la cola — posiblemente impresora sin papel, atasco o desconectada.",
          recovery: "Revisar printcenter { action: 'jobs', printer: '...' }. Si hay errores, printcenter { action: 'purge_queue', printer: '...' } limpia la cola.",
        },
      ],
      pages_selection: {
        continuous: "pages: 'continuous' o continuous: true imprime todas las páginas del documento secuencialmente con streaming eficiente y sin timeouts.",
        range: "pages: '1-5' o from_page: 1, to_page: 5 imprime un bloque contiguo.",
        specific: "pages: '1, 5, 7' o pages: [1, 5, 7] imprime únicamente las páginas elegidas.",
        mixed: "pages: '1-3, 5, 8-10' combina rangos y páginas sueltas.",
        inspection: "Para conocer el total exacto de páginas antes de imprimir, usa: printcenter { action: 'pdf_info', file: 'documento.pdf' }.",
      },
      folder_printing: {
        command: "printcenter { action: 'print', folder: 'C:\\\\Documentos\\\\Reportes' }",
        description: "Escanea e imprime todos los archivos compatibles. El informe consolidado indica cuáles se imprimieron y cuáles fallaron.",
        tip: "Usar preflight primero en carpetas grandes para detectar archivos problemáticos antes de gastar papel.",
      },
    }),

    web_search_guide: async () => ({
      ok: true,
      title: "Guía Maestra: Búsqueda Resiliente de Imágenes y Web v20.6 (web.search_images)",
      overview: "El motor web de Fluxer X v20.6 implementa búsqueda multi-proveedor paralela (Openverse, Wikimedia Commons, Wikipedia y DuckDuckGo), deduplicación por URL y contenido, modo compacto ultra eficiente en tokens, y fallback estructurado honesto sin imágenes falsas.",
      tool: "web",
      key_features: [
        "Multi-Proveedor Resiliente: Consulta en paralelo Openverse (CC), Wikimedia Commons ES/EN, Wikipedia PageImages y DuckDuckGo sin bloquearse si un proveedor falla.",
        "Puente Lingüístico (Keyword Bridge): Traduce consultas descriptivas visuales de español a inglés para maximizar resultados en repositorios globales de alta resolución.",
        "Modo Compacto por Defecto (compact: true): Devuelve un array ligero con solo id, title, url, thumb, dim, src y license, reduciendo hasta un 75% el consumo de tokens para la IA.",
        "Cero Alucinaciones / Sin Fallback Falso: Se eliminó cualquier URL estática fija. Si no hay resultados o la red falla, devuelve ok: false con error: 'NO_RESULTS_FOUND' y sugerencias de reformulación.",
        "Deduplicación y Ranking: Deduplica por hash de URL normalizada y dimensiones; prioriza imágenes con vista previa, resolución conocida y licencias libres.",
      ],
      actions: {
        search_images: {
          syntax: "web { action: 'search_images', query: 'jardín nocturno con flores azules' }",
          parameters: {
            query: "Término de búsqueda (admite descripciones complejas en español o inglés).",
            limit: "Número de resultados deseados (por defecto 12, mínimo 1, máximo 30).",
            compact: "true (por defecto) para payload reducido en tokens; false para metadatos completos y provider_status.",
            coloring: "true para priorizar dibujos y páginas para colorear (line-art).",
          },
          examples: [
            {
              title: "Búsqueda Visual Compacta de Alta Fidelidad",
              code: "web { action: 'search_images', query: 'luna llena sobre el océano' }",
              description: "Devuelve más de 9 opciones con thumbnail, URL directa, dimensiones y fuente.",
            },
            {
              title: "Búsqueda Especializada para Colorear / Dibujos",
              code: "web { action: 'search_images', query: 'mariposa para colorear', coloring: true }",
              description: "Prioriza ilustraciones lineales monocromáticas ideales para imprimir y colorear.",
            },
            {
              title: "Búsqueda Detallada con Diagnóstico de Proveedores",
              code: "web { action: 'search_images', query: 'arquitectura moderna', compact: false }",
              description: "Incluye el desglose provider_status indicando la latencia y estado de cada motor consultado.",
            },
          ],
        },
        search: {
          syntax: "web { action: 'search', query: 'noticias de ciencia' }",
          description: "Búsqueda web textual con soporte para compact: true (recorta snippets largos para ahorrar contexto).",
        },
      },
      error_handling_and_recovery: [
        {
          error: "NO_RESULTS_FOUND",
          cause: "La consulta fue demasiado restrictiva o los proveedores no arrojaron coincidencias.",
          recovery: "Utilizar una consulta más general (ej: 'flores azules noche' en vez de una frase subordinada larga) o consultar web { action: 'search' } textual.",
        },
        {
          error: "RATE_LIMITED (DuckDuckGo / Openverse)",
          cause: "Límite temporal de peticiones alcanzado en un proveedor específico.",
          recovery: "No es necesario reiniciar la red ni el Wi-Fi. Fluxer utiliza automáticamente los otros proveedores en paralelo sin fallar.",
        },
        {
          error: "INVALID_URL / DOWNLOAD_FAILED",
          cause: "Al intentar descargar una imagen con files.download_file, la URL remota expiró o bloquea hotlinking.",
          recovery: "Seleccionar la siguiente opción del array de resultados devuelto por search_images.",
        },
      ],
      end_to_end_recipe: {
        title: "Flujo Completo: De Búsqueda Web a Impresión en Papel",
        steps: [
          "1. Buscar: web { action: 'search_images', query: 'dibujo de elefante para colorear' }",
          "2. Descargar: files { action: 'download_file', url: '<url_elegida>', outPath: 'elefante.png' }",
          "3. Previsualizar: printcenter { action: 'preview', file: 'elefante.png', scale_mode: 'fit_to_printable_area' }",
          "4. Imprimir: printcenter { action: 'print', file: 'elefante.png', grayscale: true, orientation: 'auto' }",
        ],
      },
    }),


    notifications_guide: async () => ({
      ok: true,
      title: "Guía Maestra: Notificaciones Nativas y Autorizaciones de Seguridad en Windows (v20.6)",
      overview: "Fluxer Core MCP integra notificaciones de escritorio nativas en Windows 10/11 para el ciclo de vida de la conexión y ventanas interactivas emergentes con botones 'Sí, Autorizar' y 'Declinar' para permisos de seguridad.",
      sections: {
        connection_notifications: {
          title: "Notificaciones de Conexión y Desconexión",
          description: "Detecta automáticamente el inicio y cierre de sesión, y la apertura y cierre de la aplicación cliente (Claude Desktop, Cursor, etc.).",
          events: {
            app_open_or_connect: "Muestra un Toast nativo: 'La Inteligencia Artificial \"<Cliente>\" se conectó exitosamente a Fluxer Core v20.6.0'.",
            session_start: "Si se inicia una nueva sesión: 'La Inteligencia Artificial \"<Cliente>\" inició sesión y se conectó exitosamente a Fluxer Core v20.6.0'.",
            session_close: "Al cerrar sesión: 'La Inteligencia Artificial \"<Cliente>\" cerró sesión y se desconectó de Fluxer Core v20.6.0'.",
            app_close_or_disconnect: "Al cerrar completamente la app: 'La Inteligencia Artificial \"<Cliente>\" se desconectó exitosamente de Fluxer Core v20.6.0'.",
          },
          how_to_disable_or_enable: {
            turn_off: "developer { action: 'notifications_connection', state: 'off' }",
            turn_on: "developer { action: 'notifications_connection', state: 'on' }",
            user_interaction: "El usuario puede pedirle en cualquier momento a la IA que desactive estas alertas (ej: 'desactiva las notificaciones de conexión', 'no me muestres más alertas de conexión', 'apaga las notificaciones'). La IA debe ejecutar developer con notifications_connection en off.",
          },
        },
        security_notifications: {
          title: "Notificaciones Emergentes de Seguridad con Botones 'Sí, Autorizar' y 'Declinar'",
          description: "Cuando la IA solicita una acción con permisos elevados (advanced, maintainer o root), Fluxer X despliega una ventana nativa de diálogo emergente (TopMost) y un Toast en Windows.",
          features: [
            "Ventana emergente en primer plano con el escudo de seguridad de Windows.",
            "Detalle claro de la acción: herramienta, submétodo, nivel requerido y Código de Confirmación de 4 caracteres.",
            "Botón verde '✅ Sí, Autorizar' que aprueba inmediatamente la ejecución.",
            "Botón rojo '❌ Declinar' que deniega y cancela la solicitud de forma segura.",
            "Sonido de alerta suave de Windows para llamar la atención del usuario.",
          ],
          how_to_disable_or_enable: {
            turn_off: "developer { action: 'notifications_security', state: 'off' }",
            turn_on: "developer { action: 'notifications_security', state: 'on' }",
            note: "Al desactivarse, las confirmaciones seguirán disponibles a través del Dashboard local de Fluxer y por código en el chat, pero no abrirán la ventana emergente en Windows.",
          },
        },
      },
    }),

    recycle_bin_guide: async () => ({
      ok: true,
      title: "Guía de Papelera de Reciclaje y Eliminación Segura (files)",
      overview: "Permite enviar archivos a la Papelera de Reciclaje nativa de Windows preservando la capacidad de recuperación del usuario, además de inspeccionar y vaciar la papelera.",
      tool: "files",
      actions: {
        recycle_path: {
          syntax: "files { action: 'recycle_path', path: 'documento.txt' }",
          aliases: ["recycle_file", "delete_to_trash", "trash_path", "trash"],
          description: "Mueve el archivo o directorio especificado a la papelera de reciclaje sin eliminarlo permanentemente.",
        },
        delete_path_with_recycle: {
          syntax: "files { action: 'delete_path', path: 'archivo.txt', recycle: true }",
          description: "La subherramienta tradicional delete_path acepta ahora el flag recycle: true (o to_trash: true) para dirigir el borrado a la papelera.",
        },
        batch_delete_with_recycle: {
          syntax: "files { action: 'batch_delete', paths: ['a.txt', 'b.txt'], recycle: true }",
          description: "Envía múltiples elementos a la papelera en una sola llamada.",
        },
        list_recycle_bin: {
          syntax: "files { action: 'list_recycle_bin' }",
          aliases: ["get_recycle_bin", "trash_status"],
          description: "Lista el contenido de la papelera con nombre original, ruta, tamaño y fecha, más el peso total formateado.",
        },
        empty_recycle_bin: {
          syntax: "files { action: 'empty_recycle_bin' }",
          aliases: ["clear_recycle_bin", "purge_trash"],
          description: "Vacía de forma permanente la papelera de reciclaje. Opcionalmente acepta driveLetter: 'C' para vaciar una sola unidad.",
        },
      },
    }),

    workflow_media_to_print: async () => ({
      ok: true,
      title: "Flujo Integral: De Imagen Web a Impresión Física en Papel",
      description: "Paso a paso para buscar una imagen en internet, convertirla a PDF optimizado y enviarla a imprimir a una impresora física sin errores.",
      pipeline: [
        {
          step: 1,
          action: "web.search_images",
          example: "web { action: 'search_images', query: 'diagrama arquitectura software', limit: 4 }",
          note: "Explora y devuelve múltiples opciones con resolución y enlace directo.",
        },
        {
          step: 2,
          action: "web.download",
          example: "web { action: 'download', url: 'https://ejemplo.com/diagrama.png', filename: 'diagrama_descargado.png' }",
          note: "Descarga segura con validación de magic bytes (rechaza scripts o binarios camuflados).",
        },
        {
          step: 3,
          action: "files.image_to_pdf",
          example: "files { action: 'image_to_pdf', path: 'diagrama_descargado.png', outPath: 'diagrama_imprimible.pdf', paper_size: 'letter', orientation: 'auto', quality: 'alta' }",
          note: "Genera el PDF con alta fidelidad y orientación automática.",
        },
        {
          step: 4,
          action: "printcenter.preflight",
          example: "printcenter { action: 'preflight', file: 'diagrama_imprimible.pdf', printer: 'HP Lara Smart Tank' }",
          note: "Comprobación previa sin gasto de tinta.",
        },
        {
          step: 5,
          action: "printcenter.print",
          example: "printcenter { action: 'print', file: 'diagrama_imprimible.pdf', printer: 'HP Lara Smart Tank', quality: 'alta', copies: 1 }",
          note: "Envía el documento al spooler físico con renderizado WinRT.",
        },
      ],
    }),

    tools: async () => ({
      ok: true,
      title: "Fluxer Core MCP -- All Tool Domains",
      domains: [
        { name: "files", description: "File system operations: read, write, edit, find, manage, image, json, sandbox", key_actions: ["read", "write", "edit", "find", "manage", "search_files", "directory_tree"] },
        { name: "system", description: "OS, hardware, memory, processes, power, registry, clipboard, scheduled tasks", key_actions: ["get_system_info", "get_processes", "manage_services", "get_performance_stats", "ping", "screenshot"] },
        { name: "packages", description: "Universal package manager: winget, choco, scoop, npm, pip, cargo, etc.", key_actions: ["install", "list", "remove", "update", "search", "audit", "info", "repo"] },
        { name: "terminal", description: "Command execution, sessions, background tasks, scripts", key_actions: ["exec", "run_script", "create_session", "run_background", "run_as_admin"] },
        { name: "database", description: "SQLite, PostgreSQL, MySQL -- query, export, backup, notes", key_actions: ["query", "execute_query", "list_tables", "export_table", "remember_note", "search_notes"] },
        { name: "security", description: "Permissions, encryption, hashing, audit log, elevation workflows", key_actions: ["start_workflow", "approve_request", "encrypt_text", "hash_text", "audit_log", "scan_file"] },
        { name: "network", description: "Network diagnostics, port scanning, DNS, interfaces", key_actions: ["diagnose_network", "scan_ports", "dns_query", "test_connection", "get_interfaces"] },
        { name: "shortcuts", description: "Save and run multi-step macros with variable substitution", key_actions: ["create", "execute", "list", "get", "export", "import"] },
        { name: "developer", description: "Git, skills management, feedback, project inspection, upd tool", key_actions: ["inspect_project", "git_status_structured", "list_skills", "upd", "upd_check", "upd_doctor", "submit_feedback"] },
        { name: "diagnostics", description: "System health, compact mode toggle, network/storage tests, full report", key_actions: ["health_check", "set_compact", "get_compact", "network_test", "storage_test", "mcp_test", "report", "telemetry"] },
        { name: "guide", description: "This documentation system -- quick start, examples, troubleshooting", key_actions: ["index", "quick_start", "tool_usage", "examples", "troubleshoot", "faq", "search"] },
        { name: "flstudio", description: "Real-time FL Studio Suite v11.0.5: Native menus (file, edit, view, patterns, options, tools, plugins), live session, tone change, styles, mixer & security elevation gate", key_actions: ["detect", "open", "file", "edit", "view", "patterns", "options", "tools", "plugins", "live_session", "change_tone", "music_theory", "mixer_settings", "sound_design", "style_presets"] },
        { name: "screenshot", description: "Non-intrusive screen, window and app capture with WGC, GDI BitBlt and PrintWindow", key_actions: ["desktop", "app", "window"] },
        { name: "printcenter", description: "Windows-native print center: printers discovery, driver capabilities, manuals (HP, Canon, Epson, Brother), preflight dry-run, page range parsing, spooler and real printing", key_actions: ["list_printers", "get_printer", "search_printers", "manual", "preflight", "configure", "print", "jobs", "cancel_job", "purge_queue"] },
        { name: "web", description: "Búsqueda web (DuckDuckGo, Wikipedia, Reddit), extracción de páginas y descarga segura de medios (imágenes/videos) con validación anti-malware", key_actions: ["search", "search_images", "wikipedia", "reddit", "read_page", "download"] },
      ],
    }),

    tool_usage: async ({ tool_name = "all" } = {}) => {
      const usage = {
        files: {
          description: "Advanced file system operations, media conversion and trash management.",
          tips: [
            "Use image_to_pdf { path: 'img.png', paper_size: 'fit' } or with images:[...] for multi-page PDF albums.",
            "Use recycle_path { path: 'file.txt' } or delete_path { path: 'file.txt', recycle: true } to safely send to Windows Recycle Bin.",
            "Use list_recycle_bin and empty_recycle_bin to inspect and clean the trash.",
            "Use read_file with compact:true to skip metadata and save tokens.",
            "Use surgical_edit or str_replace for precise targeted edits.",
            "Use find_and_replace_in_files for bulk changes across multiple files.",
            "Use directory_tree with compact:true for large directories.",
            "Use json_manager for safe JSON dot-notation editing without overwriting.",
          ],
          example: "files { action: 'image_to_pdf', images: ['p1.png', 'p2.jpg'], outPath: 'album.pdf' }",
        },
        packages: {
          description: "Universal package manager supporting winget, choco, npm, pip, cargo, etc.",
          tips: [
            "Always specify 'manager' to avoid ambiguity (winget, choco, scoop, npm, pip, cargo).",
            "Use 'mode: dry-run' on install to preview without installing.",
            "Use 'audit' to check for vulnerabilities before installing in prod.",
            "winget is the recommended manager on Windows for system software.",
          ],
          example: "packages { action: 'install', manager: 'winget', name: 'Git.Git', mode: 'verbose' }",
        },
        diagnostics: {
          description: "System health, compact mode, network and storage tests.",
          tips: [
            "Use set_compact { enabled: true } before multi-step workflows (5+ tool calls).",
            "Always set_compact { enabled: false } before returning results to the user.",
            "Use report { format: 'json' } for structured machine-readable diagnostics.",
            "Use network_test to verify GitHub connectivity before calling upd.",
            "Use storage_test to verify R/W performance if experiencing slowdowns.",
          ],
          example: "diagnostics { action: 'set_compact', enabled: true, reason: 'Starting bulk file scan' }",
        },
        developer: {
          description: "Git analysis, skill management, feedback, and the upd update system.",
          tips: [
            "Always use upd { action: 'doctor' } first on a new install -- it runs 20 invariant checks.",
            "Use upd { action: 'repair' } if doctor reports failures.",
            "Use compact:true in create_skill, edit_skill, get_skill, list_skills to save tokens.",
            "Use git_status_structured with revealPath:true when you need the real path.",
          ],
          example: "developer { action: 'upd_check', checkRepo: true }",
        },
        upd: {
          description: "Update, autonomous installer & system maintenance.",
          tips: [
            "Use upd { action: 'install', mode: 'wizard' } for first-time AI client onboarding (Claude, Cursor, Windsurf, Cline).",
            "Use upd { action: 'install', mode: 'detect_clients' } to see which AI clients are installed.",
            "Use upd { action: 'doctor' } to run a 20-point self-diagnostic with remediation.",
            "Use upd { action: 'repair' } to auto-fix common issues (stale locks, storage, npm deps).",
            "Use upd { action: 'check' } for a fresh check from GitHub releases/repo.",
            "Use upd { action: 'apply', confirm: true } after asking user confirmation in chat.",
          ],
          example: "upd { action: 'install', mode: 'wizard' }",
        },
        security: {
          description: "Permissions, encryption, hashing and audit.",
          tips: [
            "Use start_workflow { level: 'advanced', durationMinutes: 10 } for extended access.",
            "Only 1 workflow active at a time. Starting a new one replaces the old.",
            "Always explain to the user what you need elevated access for before requesting.",
            "Use audit_log to review recent sensitive operations.",
          ],
          example: "security { action: 'start_workflow', level: 'advanced', durationMinutes: 5, reason: 'Installing system package' }",
        },
        terminal: {
          description: "Command execution and session management.",
          tips: [
            "Use run_as_admin for commands requiring elevation.",
            "Use create_session + run_session_command for multi-step terminal workflows.",
            "Use run_background for long-running tasks; check with get_background_output.",
            "Use run_inline_script { language: 'powershell' } for quick PS scripts.",
          ],
          example: "terminal { action: 'exec', command: 'dir /s', cwd: 'C:\\\\Users\\\\mauri' }",
        },
        system: {
          description: "OS, hardware, processes, power and registry.",
          tips: [
            "Use get_performance_summary for a quick system health snapshot.",
            "Use get_processes with compact:true to avoid overwhelming output.",
            "Use manage_services { service: 'name', action: 'restart' } for service control.",
            "Use screenshot for visual debugging of UI issues.",
          ],
          example: "system { action: 'get_performance_summary' }",
        },
        flstudio: {
          description: "Music production, theory, MIDI generation, tone shifting, free VST plugins and FL Studio scripts.",
          tips: [
            "Use generate_midi { progression: ['Cm7', 'Fm7', 'Bb7', 'Ebmaj7'], bpm: 80, style: 'lofi' } to generate drag-and-drop .mid files.",
            "Use music_theory { mode: 'scale', scale: 'harmonic_minor', root: 'C' } for instant note mapping and scale highlighting.",
            "Use change_tone { notes: ['C4', 'E4', 'G4'], semitones: 2 } to transpose progressions to any key or adjust 432Hz tuning.",
            "Use free_plugins { category: 'all' } to get curated download links and install guides for Vital, LABS, Surge XT, OTT.",
            "Use fl_scripting { type: 'piano_roll' } to generate algorithmic humanizer/arpeggiator scripts for FL Studio 21+.",
            "Use mixer_settings { track_type: 'master' } for commercial loudness limiter specs, stereo separation, and EQ curves.",
          ],
          example: "flstudio { action: 'generate_midi', progression: ['Am', 'F', 'C', 'G'], bpm: 120, style: 'synthwave' }",
        },
        web: {
          description: "Búsqueda web sin API keys, extracción de contenido y descarga segura de medios.",
          tips: [
            "Use search { query: '...' } para buscar en DuckDuckGo y Wikipedia.",
            "Use wikipedia { query: '...' } para resúmenes directos de artículos.",
            "Use reddit { query: '...' } para buscar discusiones en Reddit.",
            "Use download { url: '...' } para descargar imágenes o videos con verificación estricta de seguridad.",
          ],
          example: "web { action: 'search', query: 'node.js tutorial' }",
        },
        printcenter: {
          description: "Windows-native print center: printer discovery, preflight dry-run, WinRT PDF rendering and queue management.",
          tips: [
            "Always run preflight { file: 'doc.pdf', printer: '...' } first to validate dimensions and compatibility without wasting paper.",
            "Use list_printers to find installed physical (HP, Canon, Epson, Brother) and virtual printers.",
            "Use print { file: 'doc.pdf', printer: '...', quality: 'alta', copies: 1 } for production printing.",
            "Use jobs and purge_queue to inspect or unjam the print queue.",
          ],
          example: "printcenter { action: 'print', file: 'invoice.pdf', printer: 'HP Lara Smart Tank', quality: 'alta' }",
        },
        shortcuts: {
          description: "Automated multi-step pipelines and macros with dynamic variable piping and conditionals.",
          tips: [
            "Use captureAs / capture in steps to pass output properties to subsequent steps via ${var}.",
            "Use condition / when: '${step1.status} == ok' for smart branch execution.",
            "Use dryRun: true to simulate execution before making real changes.",
            "Use list_templates to explore pre-built developer workflows.",
          ],
          example: "shortcuts { action: 'execute', name: 'system_health_audit' }",
        },
      };
      if (tool_name !== "all" && usage[tool_name]) return { ok: true, tool: tool_name, ...usage[tool_name] };
      return { ok: true, usage };
    },

    compact_mode: async () => ({
      ok: true,
      title: "Compact Mode -- AI Token Optimization",
      description: "Compact mode is a session-level toggle that reduces response verbosity to save tokens during heavy workflows.",
      how_to_use: {
        enable: "diagnostics { action: 'set_compact', enabled: true, reason: 'Starting bulk workflow' }",
        disable: "diagnostics { action: 'set_compact', enabled: false }",
        check: "diagnostics { action: 'get_compact' }",
      },
      when_to_enable: [
        "Before processing large directory listings (files.find, files.directory_tree)",
        "Before multi-step automation workflows (5+ sequential tool calls)",
        "When scanning many files for patterns",
        "When running health_check just to verify pass/fail",
        "During package listing (packages.list with many results)",
      ],
      when_to_disable: [
        "Before returning detailed results to the user",
        "When debugging errors (need full error details)",
        "During first-time setup/install (user needs to see output)",
        "When the user asks for detailed information",
      ],
      golden_rule: "Always disable compact mode before your final response to the user. Never leave it ON at the end of a turn.",
      effect_on_responses: {
        health_check: "Shows only status counts and warnings list instead of full check objects",
        packages_list: "Shows package names only instead of full metadata objects",
        system_info: "Shows key metrics only instead of full nested hardware objects",
        terminal_exec: "Shows stdout only (stderr on error) instead of full result object",
      },
    }),

    best_practices: async () => ({
      ok: true,
      guidelines: [
        { rule: "read_before_write", priority: "HIGH", detail: "Always read a file before overwriting it. Use read_file or read_file_range first." },
        { rule: "compact_mode_lifecycle", priority: "HIGH", detail: "Enable compact mode at the start of bulk workflows, disable before showing results to user." },
        { rule: "verify_results", priority: "HIGH", detail: "Don't assume ok:true means success. Verify changes on disk when they matter." },
        { rule: "path_privacy", priority: "MEDIUM", detail: "User paths are obfuscated by default. Use revealPath:true only when the user authorizes it." },
        { rule: "handle_errors", priority: "HIGH", detail: "Read the structured error and adapt your strategy. Never retry the same failed command blindly." },
        { rule: "upd_doctor_first", priority: "MEDIUM", detail: "On a new install or after issues, run upd { action: 'doctor' } before anything else." },
        { rule: "ask_before_destructive", priority: "HIGH", detail: "Always ask the user in the chat before applying updates, deleting files, or elevated operations." },
        { rule: "step_by_step", priority: "MEDIUM", detail: "Work in phases. Don't attempt massive refactors in a single tool call." },
        { rule: "use_install_wizard", priority: "MEDIUM", detail: "For new users, always start with install { action: 'wizard' } for guided setup." },
        { rule: "use_guide_search", priority: "LOW", detail: "When unsure about a tool, use guide { action: 'search', query: '...' } to find relevant docs." },
      ],
    }),

    examples: async ({ domain = "all" } = {}) => {
      const examples = {
        diagnostics: [
          { title: "Enable compact mode", call: "diagnostics { action: 'set_compact', enabled: true }", when: "Before starting a multi-step bulk workflow" },
          { title: "Full system report", call: "diagnostics { action: 'report', format: 'text' }", when: "When user asks for system status" },
          { title: "Test network connectivity", call: "diagnostics { action: 'network_test' }", when: "Before calling upd to verify GitHub is reachable" },
          { title: "MCP health check", call: "diagnostics { action: 'health_check' }", when: "After installing or updating Fluxer" },
        ],
        packages: [
          { title: "Install a package (dry run)", call: "packages { action: 'install', manager: 'winget', name: 'Git.Git', mode: 'dry-run' }", when: "Preview before actually installing" },
          { title: "List installed npm packages", call: "packages { action: 'list', manager: 'npm', mode: 'installed' }", when: "Auditing Node.js dependencies" },
          { title: "Update all winget packages", call: "packages { action: 'update', manager: 'winget', mode: 'all' }", when: "System maintenance" },
          { title: "Security audit", call: "packages { action: 'audit', path: '.', manager: 'npm', mode: 'deep' }", when: "Before shipping a project" },
        ],
        upd: [
          { title: "Check for updates", call: "upd { action: 'check' }", when: "Always first before considering an update" },
          { title: "Run doctor", call: "upd { action: 'doctor' }", when: "After install or when things seem broken" },
          { title: "Full install wizard", call: "upd { action: 'install', mode: 'wizard' }", when: "First time on a new machine" },
          { title: "Detect AI clients", call: "upd { action: 'install', mode: 'detect_clients' }", when: "Check which AI clients are installed" },
          { title: "Configure for Claude Desktop", call: "upd { action: 'install', mode: 'configure', client: 'claude_desktop', confirm: true }", when: "Inject MCP config into Claude Desktop" },
          { title: "Apply update", call: "upd { action: 'apply', confirm: true }", when: "After user confirms in chat" },
          { title: "Rollback", call: "upd { action: 'rollback', confirm: true }", when: "If update caused issues" },
        ],
        flstudio: [
          { title: "Generate MIDI Chords", call: "flstudio { action: 'generate_midi', progression: ['Cm7', 'Fm7', 'Bb7', 'Ebmaj7'], bpm: 80, style: 'lofi' }", when: "Create drag-and-drop .mid file for FL Studio" },
          { title: "Music Theory Scale", call: "flstudio { action: 'music_theory', mode: 'scale', scale: 'harmonic_minor', root: 'C' }", when: "Look up notes and scale highlighting" },
          { title: "Transpose Notes", call: "flstudio { action: 'change_tone', notes: ['C4', 'E4', 'G4'], semitones: 2 }", when: "Shift key up/down or adjust tuning" },
          { title: "Free Plugins Catalog", call: "flstudio { action: 'free_plugins', category: 'all' }", when: "Find safe direct download links for Vital, LABS, OTT" },
          { title: "Sound Design Recipe", call: "flstudio { action: 'sound_design', type: 'bass_808' }", when: "Synth formula for heavy saturated 808" },
        ],
        files: [
          { title: "Read a file", call: "files { action: 'read_file', path: 'config.json' }", when: "Before any edit" },
          { title: "Convert Images to PDF", call: "files { action: 'image_to_pdf', images: ['cover.png', 'photo.jpg'], paper_size: 'letter', orientation: 'auto' }", when: "Multi-page booklet or single image PDF conversion" },
          { title: "Surgical edit", call: "files { action: 'surgical_edit', path: 'app.js', target: 'old_code', replacement: 'new_code' }", when: "Precise targeted code changes" },
          { title: "Find files by pattern", call: "files { action: 'search_files', path: '.', query: '*.mjs' }", when: "Finding all JS module files" },
          { title: "Directory tree", call: "files { action: 'directory_tree', path: '.', compact: true }", when: "Overview of project structure" },
        ],
        web: [
          { title: "Search Web", call: "web { action: 'search', query: 'Quantum computing news', limit: 5 }", when: "Find current web pages with duckduckgo/wikipedia" },
          { title: "Search Multiple Images", call: "web { action: 'search_images', query: 'Retro car neon', limit: 6 }", when: "Get multiple selectable image options with direct links" },
          { title: "Safe Download Media", call: "web { action: 'download', url: 'https://example.com/image.png' }", when: "Download verified safe image/video to Downloads folder" },
          { title: "Read Full Web Page", call: "web { action: 'read_page', url: 'https://en.wikipedia.org/wiki/Artificial_intelligence' }", when: "Extract clean readable text from articles" },
        ],
        shortcuts: [
          { title: "Run Shortcut with Variables", call: "shortcuts { action: 'execute', name: 'my_pipeline', variables: { topic: 'AI' } }", when: "Execute multi-step pipeline with dynamic vars" },
          { title: "List Templates", call: "shortcuts { action: 'list_templates' }", when: "Explore ready-to-use developer macro templates" },
          { title: "Dry Run Simulation", call: "shortcuts { action: 'execute', name: 'my_pipeline', dryRun: true }", when: "Simulate steps without making changes" },
        ],
        printcenter: [
          { title: "Discover Printers", call: "printcenter { action: 'list_printers' }", when: "View physical & virtual printers and capabilities" },
          { title: "Print PDF Document", call: "printcenter { action: 'print', file: 'document.pdf', quality: 'alta', pages: '1-3' }", when: "Safe printing with resolution negotiation" },
        ],
      };
      if (domain !== "all" && examples[domain]) return { ok: true, domain, examples: examples[domain] };
      return { ok: true, examples };
    },

    troubleshoot: async ({ issue = "" } = {}) => {
      const issues = {
        update_fails: {
          title: "Update not applying",
          steps: ["Run: upd { action: 'check', force: true }", "Run: diagnostics { action: 'network_test' } to verify GitHub is reachable", "Run: upd { action: 'doctor' } to check 20 invariants", "Run: upd { action: 'repair' } to auto-fix common issues", "If still failing: check updater.log in storage/logs/"],
        },
        mcp_not_appearing: {
          title: "MCP not showing in Claude Desktop / Cursor",
          steps: ["Run: upd { action: 'install', mode: 'status' } to verify config", "Run: upd { action: 'install', mode: 'detect_clients' } to see what's detected", "Run: upd { action: 'install', mode: 'repair' } to re-inject config", "Manually check the config file (e.g. claude_desktop_config.json)", "Restart Claude Desktop after config changes"],
        },
        permission_denied: {
          title: "PERMISSION_DENIED error",
          steps: ["Check if in-app notifications are enabled or disabled: security { action: 'list_notifications' }", "If enabled: the user can click 'Autorizar' in Fluxer Dashboard or 'X' to deny", "If disabled: ask the user in chat for confirmation and call security { action: 'approve_request', confirmationCode: '...' }", "To switch modes: security { action: 'configure_notifications', enabled: false } (chat mode)"],
        },
        high_memory: {
          title: "High memory / slow responses",
          steps: ["Enable compact mode: diagnostics { action: 'set_compact', enabled: true }", "Run: system { action: 'clean_memory' }", "Run: diagnostics { action: 'system_diagnose' } to check memory pressure", "Check which processes are using RAM: system { action: 'get_processes', compact: true }"],
        },
        node_not_found: {
          title: "Node.js not found / install fails",
          steps: ["Run: upd { action: 'install', mode: 'node_check' }", "Minimum version required: Node.js v18+", "Download from: https://nodejs.org/en/download/ or run: winget install OpenJS.NodeJS.LTS"],
        },
      };
      if (issue && issues[issue]) return { ok: true, issue, ...issues[issue] };
      return { ok: true, available_issues: Object.keys(issues), all_issues: issues, tip: "Call troubleshoot { issue: '<key>' } for specific guidance." };
    },

    permissions: async () => ({
      ok: true,
      levels: [
        { name: "visitor", aliases: ["guest"], description: "Minimal read-only exploratory access." },
        { name: "standard", aliases: ["user"], description: "Default level. Safe read/write operations, package inspection, status." },
        { name: "advanced", aliases: ["poweruser"], description: "Advanced operations, package installation, controlled terminal execution, print." },
        { name: "maintainer", aliases: ["admin"], description: "Network management, processes, maintenance scripts, security policies." },
        { name: "developer", aliases: [], description: "MCP core modifications, deep diagnostics, engine debugging." },
        { name: "system_root", aliases: ["admintotaluser"], description: "Maximum authority with explicit user authorization." },
      ],
      modes: {
        in_app_fluxer: "Alertas integradas en el Dashboard de Fluxer con botones para autorizar con 1 clic o denegar con 'X'.",
        chat_classic: "Modo tradicional por chat: la IA solicita al usuario el código de confirmación en la conversación.",
        switch_command: "security { action: 'configure_notifications', enabled: true|false }",
      },
      golden_rule: "CONSENT RULE: Always ask the user in chat or wait for authorization before executing any system-impacting action.",
      path_privacy: "User paths are obfuscated by default (~ or <user>). Use revealPath: true when authorized.",
      update_consent: "Always ask the user before applying updates. Include: confirm: true in the call only after they say yes.",
    }),

    changelog: async () => ({
      ok: true,
      current: CURRENT_VERSION,
      latest_changes: {
        version: "20.2.0",
        codename: "Aero Fluxer v20.2 Phoenix",
        date: "2026-09-15",
        highlights: [
          "HOTFIX v20.2: Guías interactivas dedicadas en guide para Image-to-PDF, Print Center y Papelera de reciclaje",
          "NEW: guide.image_to_pdf_guide: Documentación profunda sobre conversión de imagen única o álbumes, orientación 'auto', tamaños 'fit'/'letter'/'a4' y calidad",
          "NEW: guide.print_guide: Guía paso a paso de impresión física y virtual, preflight preventivo, capacidades de driver y resolución COM WinRT",
          "NEW: guide.recycle_bin_guide: Guía de eliminación segura hacia la Papelera de Windows, listado e inspección de peso y vaciado permanente",
          "NEW: guide.workflow_media_to_print: Flujo integral de extremo a extremo (web search/download -> image_to_pdf -> preflight -> physical print)",
          "STABLE: Papelera de reciclaje completa en files (recycle_path, list_recycle_bin, empty_recycle_bin, delete_path con recycle: true)",
          "FIX: Corrección crítica WinRT COM GetAwaiter en impresión física de red (AFX-FB-LCT3M5)",
          "POLISH: Conexiones MCP y cambio de IA silenciosos (sin popups de Windows) y elevación unificada",
          "NEW: Centro de Notificaciones y Autorizaciones integrado en Fluxer (conmutador entre Dashboard UI interactivo y Chat clásico)",
          "NEW: Botón 'Autorizar' de 1 clic y botón 'X' para denegar acceso a la IA en Dashboard",
          "NEW: web domain (DuckDuckGo, Wikipedia, Reddit, Safe Media Downloader con verificación anti-malware)",
          "NEW: web.search_images multi-fuente con opciones seleccionables, resolución y enlaces directos",
          "NEW: printcenter completo con negociación de calidad (alta, estandar, basica), control de colas y preflight sin gasto de tinta",
          "OPTIMIZED: shortcuts con piping dinámico de variables, condiciones when, simulación dryRun y plantillas predefinidas",
          "CLEANUP: Eliminación de más de 65 archivos duplicados y reducción masiva de almacenamiento en disco",
        ],
      },
      github: "https://github.com/Lara2026ss/aero-fluxer-x",
    }),

    faq: async () => ({
      ok: true,
      questions: [
        { q: "How do I convert images into a PDF document or album?", a: "Use files { action: 'image_to_pdf', images: ['foto1.png', 'foto2.jpg'], outPath: 'album.pdf', paper_size: 'a4', orientation: 'auto', quality: 'alta' }. See guide { action: 'image_to_pdf_guide' } for detailed options." },
        { q: "How do I print a PDF to a physical printer without wasting ink or errors?", a: "Run printcenter { action: 'preflight', file: 'doc.pdf', printer: '...' } first to validate, then printcenter { action: 'print', file: 'doc.pdf', printer: '...' }. In v20.0+, WinRT COM reflection solves all driver exceptions. See guide { action: 'print_guide' }." },
        { q: "Can I delete files to the Recycle Bin instead of permanent removal?", a: "Yes! Use files { action: 'recycle_path', path: 'file.txt' } or pass recycle: true to delete_path. You can also inspect with list_recycle_bin and empty with empty_recycle_bin. See guide { action: 'recycle_bin_guide' }." },
        { q: "What is the end-to-end workflow to download an image from web and print it?", a: "Run: 1) web.search_images, 2) web.download, 3) files.image_to_pdf, 4) printcenter.preflight, 5) printcenter.print. Full guide available at guide { action: 'workflow_media_to_print' }." },
        { q: "Does Fluxer require Git to be installed?", a: "No. The updater (upd) works without git.exe in the system PATH. It reads the .git folder directly using Node.js native file APIs." },
        { q: "How do I update Fluxer?", a: "Run: developer { action: 'upd_check' } first, then ask the user if they want to update, then: developer { action: 'upd', confirm: true } only after they confirm." },
        { q: "What is compact mode and should I always enable it?", a: "Compact mode reduces response size to save AI tokens. Enable it during bulk workflows (5+ sequential calls). Disable it before showing results to the user." },
        { q: "How do I install on a new PC for a new user?", a: "Run: install { action: 'wizard' } -- it auto-detects Node.js, AI clients, and configures everything. Requires Node.js v18+ to be installed first." },
        { q: "Can I roll back an update?", a: "Yes. Run: developer { action: 'upd_rollback', confirm: true } to revert to the previous version backup." },
        { q: "What AI clients does the install wizard support?", a: "Claude Desktop, Cursor, Windsurf, VS Code + Cline extension, and any client using the standard MCP config format." },
        { q: "How many tools does Fluxer have?", a: `v${CURRENT_VERSION} has 12 tool domains with 355+ actions.` },
      ],
    }),

    search: async ({ query = "" } = {}) => {
      if (!query) return { ok: false, error: "Provide a search query: guide { action: 'search', query: 'your question' }" };
      const q = String(query).toLowerCase().trim();
      const tokens = q.split(/\s+/);
      const results = [];

      // Catálogo exhaustivo de temas indexados por relevancia semántica
      const INDEXED_TOPICS = [
        {
          id: "terminal",
          keywords: ["terminal", "command", "cmd", "powershell", "shell", "exec", "script", "bash", "run_as_admin", "admin", "prompt", "session", "background", "process", "sudo"],
          action: "tool_usage",
          tool_name: "terminal",
          summary: "Terminal domain: execute PowerShell/cmd commands, run scripts, manage sessions, and run admin tasks with security confirmation code gate.",
          example: "terminal { action: 'command', command: 'Get-Process' }"
        },
        {
          id: "files",
          keywords: ["file", "files", "read", "write", "edit", "append", "patch", "lines", "json", "csv", "pdf", "docx", "xlsx", "compress", "zip", "backup", "desktop", "documents", "onedrive", "token_advisory", "gzip", "binary", "numbers"],
          action: "tool_usage",
          tool_name: "files",
          summary: "Files domain: read, write, edit, replace, json dot-notation, CSV, Office/PDF docs, and token optimization (gzip, bin, numbers).",
          example: "files { action: 'list_directory', path: '~/Desktop' }"
        },
        {
          id: "system",
          keywords: ["system", "hardware", "memory", "ram", "cpu", "processes", "power", "registry", "clipboard", "stats", "screenshot", "uptime", "perf", "performance"],
          action: "tool_usage",
          tool_name: "system",
          summary: "System domain: inspect hardware, CPU, RAM, active processes, kill tasks, power controls, and clipboard.",
          example: "system { action: 'get_system_info' }"
        },
        {
          id: "packages",
          keywords: ["package", "packages", "npm", "winget", "choco", "chocolatey", "scoop", "pip", "cargo", "install", "remove", "update", "audit"],
          action: "tool_usage",
          tool_name: "packages",
          summary: "Packages domain: universal package management across winget, npm, choco, scoop, and pip.",
          example: "packages { action: 'search', query: 'git', manager: 'winget' }"
        },
        {
          id: "database",
          keywords: ["database", "db", "sqlite", "sql", "query", "table", "tables", "notes", "remember", "export_table"],
          action: "tool_usage",
          tool_name: "database",
          summary: "Database domain: execute native SQLite queries, manage tables, and persistent AI notes memory.",
          example: "database { action: 'query', query: 'SELECT sqlite_version();' }"
        },
        {
          id: "security",
          keywords: ["security", "permission", "permissions", "elevation", "workflow", "approve", "confirm", "confirmation", "gate", "code", "audit", "encrypt", "hash", "scan"],
          action: "permissions",
          summary: "Security & permissions: elevation workflows, 4-character confirmation codes for terminal, audit logs, and encryption.",
          example: "security { action: 'check_permissions' }"
        },
        {
          id: "diagnostics",
          keywords: ["diagnostics", "health", "health_check", "self_test", "mcp_test", "test", "report", "benchmark", "telemetry", "storage_test", "network_test", "ping"],
          action: "tool_usage",
          tool_name: "diagnostics",
          summary: "Diagnostics domain: 14-point system health check, MCP tests, real network latency, disk benchmark, and telemetry.",
          example: "diagnostics { action: 'health_check' }"
        },
        {
          id: "compact_mode",
          keywords: ["compact", "token", "tokens", "optimize", "optimization", "reduce", "savings", "short"],
          action: "compact_mode",
          summary: "Compact mode & Token Optimizer: AI-driven token reduction across tools, gzip/binary expanders, and session compact toggles.",
          example: "diagnostics { action: 'set_compact', enabled: true }"
        },
        {
          id: "flstudio",
          keywords: ["fl", "flstudio", "music", "midi", "synth", "piano_roll", "daw", "plugins", "mixer", "tone", "scales", "chords", "patterns"],
          action: "tool_usage",
          tool_name: "flstudio",
          summary: "FL Studio Suite: real-time DAW menus (file, edit, view, patterns, options), live session, chord generator, plugins & token optimizer.",
          example: "flstudio { action: 'detect' }"
        },
        {
          id: "upd",
          keywords: ["update", "upd", "upgrade", "doctor", "rollback", "check", "version", "changelog", "patch"],
          action: "examples",
          domain: "upd",
          summary: "Update Manager (upd): check GitHub releases, apply verified updates with auto-backup and 20-point doctor diagnostics.",
          example: "upd { action: 'check' }"
        },
        {
          id: "troubleshoot",
          keywords: ["error", "fail", "failed", "broken", "fix", "repair", "issue", "bug", "timeout", "enoent", "denied"],
          action: "troubleshoot",
          summary: "Troubleshooting guide: solutions for common issues (timeouts, ENOENT paths, permission elevation, MCP client reconnect).",
          example: "guide { action: 'troubleshoot', issue: 'enoent' }"
        },
        {
          id: "developer",
          keywords: ["developer", "git", "skill", "skills", "create_skill", "inspect_project", "tests", "build", "feedback"],
          action: "tool_usage",
          tool_name: "developer",
          summary: "Developer domain: Git inspections, AI skills creation & validation, project testing and telemetry feedback.",
          example: "developer { action: 'list_skills' }"
        },
        {
          id: "image_to_pdf",
          keywords: ["image", "pdf", "image_to_pdf", "img2pdf", "convert_image_to_pdf", "imagen", "fotos", "album", "png", "jpg", "jpeg", "orientation", "portrait", "landscape"],
          action: "image_to_pdf_guide",
          summary: "Guía de Imagen a PDF: compilar fotos individuales o álbumes multi-página, ajustar márgenes, orientación auto y calidad.",
          example: "guide { action: 'image_to_pdf_guide' }"
        },
        {
          id: "printing",
          keywords: ["print", "printer", "printing", "printcenter", "imprimir", "impresora", "preflight", "spooler", "copias", "duplex", "hp", "canon", "epson", "brother", "winrt"],
          action: "print_guide",
          summary: "Guía de PDF a Impresión: descubrimiento de impresoras físicas/red, preflight sin gasto de tinta, envío de spooler y resolución WinRT.",
          example: "guide { action: 'print_guide' }"
        },
        {
          id: "recycle_bin",
          keywords: ["recycle", "trash", "papelera", "reciclaje", "basurero", "recycle_bin", "recycle_path", "delete_to_trash", "empty_recycle_bin", "list_recycle_bin"],
          action: "recycle_bin_guide",
          summary: "Guía de Papelera de Reciclaje: envío seguro a la papelera nativa de Windows, inspección de elementos y vaciado permanente.",
          example: "guide { action: 'recycle_bin_guide' }"
        },
        {
          id: "workflow_media_to_print",
          keywords: ["pipeline", "workflow", "end_to_end", "media_to_print", "image_to_print", "flujo", "pasos"],
          action: "workflow_media_to_print",
          summary: "Flujo Integral Extremo a Extremo: Buscar imagen en web -> Descargar -> Convertir a PDF -> Preflight -> Imprimir.",
          example: "guide { action: 'workflow_media_to_print' }"
        }
      ];

      for (const topic of INDEXED_TOPICS) {
        let score = 0;
        // Coincidencia exacta de ID
        if (q === topic.id) score += 10;
        if (q.includes(topic.id)) score += 5;

        // Coincidencia de palabras clave
        for (const kw of topic.keywords) {
          if (q === kw) score += 6;
          else if (q.includes(kw)) score += 3;
          for (const token of tokens) {
            if (token.length > 2 && kw.includes(token)) score += 2;
          }
        }

        if (score > 0) {
          results.push({
            action: topic.action,
            ...(topic.tool_name ? { tool_name: topic.tool_name } : {}),
            ...(topic.domain ? { domain: topic.domain } : {}),
            relevance: score >= 8 ? "HIGH" : (score >= 4 ? "MEDIUM" : "LOW"),
            score,
            summary: topic.summary,
            example: topic.example
          });
        }
      }

      // Ordenar por relevancia descendente
      results.sort((a, b) => b.score - a.score);

      // Si no hubo coincidencia, devolver índice con sugerencias útiles
      if (results.length === 0) {
        results.push({ action: "index", relevance: "LOW", score: 1, summary: "Browse full guide index. Topics available: image_to_pdf_guide, print_guide, recycle_bin_guide, workflow_media_to_print, terminal, files, system, packages, database, security, diagnostics, flstudio, upd." });
      }

      return {
        ok: true,
        query,
        count: results.length,
        results: results.slice(0, 5),
        tip: "Call any of the suggested actions to get detailed information."
      };
    },
  };

  const permissions = {
    index: "standard", quick_start: "standard", tools: "standard", tool_usage: "standard",
    compact_mode: "standard", best_practices: "standard", examples: "standard",
    troubleshoot: "standard", permissions: "standard", changelog: "standard",
    faq: "standard", search: "standard",
    image_to_pdf_guide: "standard", img2pdf_guide: "standard", image_to_pdf: "standard",
    print_guide: "standard", printcenter_guide: "standard", printing: "standard",
    recycle_bin_guide: "standard", trash_guide: "standard",
    workflow_media_to_print: "standard", workflow_image_to_print: "standard",
    // legacy
    permissions_info: "standard",
  };

  // Aliases
  actions.image_to_pdf = actions.image_to_pdf_guide;
  actions.img2pdf_guide = actions.image_to_pdf_guide;
  actions.printcenter_guide = actions.print_guide;
  actions.printing = actions.print_guide;
  actions.trash_guide = actions.recycle_bin_guide;
  actions.workflow_image_to_print = actions.workflow_media_to_print;
  actions.permissions_info = actions.permissions;

  return domain("guide", `Documentacion oficial v${CURRENT_VERSION} -- image_to_pdf_guide, print_guide, recycle_bin_guide, workflow_media_to_print, index, quick_start, tools, tool_usage, compact_mode, best_practices, examples, troubleshoot, permissions, changelog, faq, search.`, actions, permissions);
}
