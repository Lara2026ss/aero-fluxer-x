# Changelog de Aero Fluxer X

Todos los cambios notables en este proyecto serán documentados en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [9.1.0] - 2026-09-02 (Limpieza de RAM, Gestión de Discos/BCD, Terminal Admin y Concesión de Permisos Temporales)

### Añadido
- **Optimización y Diagnóstico Avanzado de Memoria RAM (`system.clean_ram`, `system.analyze_memory_usage`, `system.terminate_process`)**:
  - `clean_ram`: Recorta de forma segura los working sets de procesos inactivos vía la API Win32 `EmptyWorkingSet`, liberando memoria RAM de inmediato sin cerrar programas ni causar inestabilidad.
  - `analyze_memory_usage`: Diagnostica la presión de memoria RAM y clasifica procesos en categorías inteligentes (`games`, `browsers`, `ide_dev`, `background_apps`, `system_critical`), calculando el ahorro potencial de memoria recuperable.
  - `terminate_process`: Cierra procesos no esenciales con protección estricta para procesos críticos del sistema operativo (`csrss`, `lsass`, `services`, `dwm`, `explorer`, `wininit`, etc.).
- **Gestión de Discos y Almacén BCD de Windows (`system.bcd_manager`, `system.manage_disks`)**:
  - `bcd_manager`: Enumera entradas del bootloader (`bcdedit /enum all`), crea copias de seguridad (`bcdedit /export`), monta la partición EFI oculta (ESP) en unidad `S:` (`mountvol S: /s`) para inspección o corrección y la desmonta limpiamente (`mountvol S: /d`).
  - `manage_disks`: Lista detallada de volúmenes, discos físicos, etiquetas, sistemas de archivos, estado de salud y estilo de partición (GPT/MBR).
- **Terminal Admin (`terminal.admin_terminal`, `terminal.run_as_admin`)**:
  - Ejecución de comandos con privilegios elevados de administrador y captura de salida completa.
- **Secuencia de Permisos Temporales ("Elevation Grant Timer") (`security.grant_elevation`, `security.get_elevation_status`, `security.revoke_elevation`)**:
  - Concesión de permiso temporal de administración por defecto de 20 minutos ante la frase "te doy permiso total" o duración personalizada (ej. "1 hora").
  - Contador regresivo en vivo en el MCP. Durante la vigencia del permiso, las herramientas administrativas se ejecutan automáticamente sin interrumpir al usuario.
  - Consulta de tiempo restante formateado (`18m 42s`) y revocación inmediata en cualquier momento.

## [9.0.9] - 2026-09-02 (Detección Dinámica de Clientes en UPD y Optimización de Tokens)

### Añadido
- **Detección Dinámica del Cliente Host en Actualizaciones (`upd`)**:
  - Módulo `core/client-restart.mjs` que inspecciona el cliente MCP conectado, variables de entorno y ancestros de procesos.
  - Genera mensajes personalizados y acciones exactas:
    - **Google Antigravity**: `"Espera unos minutos y recarga la lista de MCP en antigravity."` (indicando el botón de recargar 🔄 en Installed MCP Servers).
    - **Claude Desktop**: `"Reinicia Claude desktop para aplicar los cambios."`
    - **Codex**: `"Reinicia Codex para aplicar los cambios."`
    - **Cursor**: `"Recarga la ventana de Cursor (Ctrl+Shift+P > Developer: Reload Window) o reinicia Cursor para aplicar los cambios."`
    - **Desconocido**: `"reinicia tu aplicación o entorno."`
- **Pipeline de Actualización Completo con Compilación**:
  - Descarga y verificación SHA-256 desde GitHub Releases.
  - Backup preventivo del código anterior.
  - Reemplazo atómico de código y archivos nuevos.
  - Ejecución de `npm install --omit=dev --no-audit --no-fund` para compilar e instalar dependencias.
  - Auto-diagnóstico de integridad post-actualización.
- **Eficiencia de Tokens en `upd`**:
  - Respuesta compacta y estructurada (~100 tokens), evitando el consumo excesivo de contexto en el LLM.

## [9.0.8] - 2026-09-02 (Integridad Estructural HTML, Detección UTF-16 y Alias str_replace)

### Añadido
- **Acción `diagnostics.verify_html_integrity` (y en `developer`)**:
  - Verificación de balance de tags HTML con parser de pila de etiquetas para detectar tags sin cerrar o cierres desalineados con número de línea.
  - Validación sintáctica mediante `node:vm` de bloques de JavaScript embebidos en etiquetas `<script>`.
  - Conteo inteligente de selectores y clases CSS (`.rule-box`, `#id`, etc.).
  - Detección de regresiones estructurales frente a baselines esperados o archivos previos (ej. alertas inmediatas si `.rule-box` desciende inesperadamente).
- **Auto-detección y Normalización de Encodings en `files`**:
  - `files.read_text_file` y `files.read_file_range` ahora detectan y decodifican automáticamente archivos en UTF-16LE / UTF-16BE (con y sin BOM de Windows PowerShell) y UTF-8 con BOM, eliminando falsos positivos de "archivo binario".
- **Alias `files.str_replace`**:
  - Añadido alias directo `str_replace`, `replace_in_file` y `replace_file_content` en el dominio `files` y en el Router principal para compatibilidad con las convenciones de Anthropic / Claude.

## [9.0.7] - 2026-09-02 (Gestión Completa de Skills: delete_skill y edit_skill)

### Añadido
- **Acción `developer.delete_skill`**: Permite eliminar skills creadas o de terceros tanto por nombre (resolución global) como por ruta directa. Incluye guardias de seguridad para prevenir la eliminación accidental de directorios raíz.
- **Acción `developer.edit_skill`**: Permite editar o mejorar skills existentes preservando sus metadatos y actualizando sus instrucciones o recursos.
- **Ruteo Directo**: El router ahora permite invocar `delete_skill`, `edit_skill`, `create_skill`, `get_skill`, `list_skills` y `validate_skill` directamente como herramientas.

## [9.0.6] - 2026-09-02 (Simplificación de Herramientas de Actualización: upd_check, upd_info, upd)

### Cambiado
- **Eliminación de todas las tool calls previas de actualización**: Se eliminaron `get_update`, `update`, `check_update`, `update_info`, `check_for_updates`, `apply_update`, `rollback_update` y `list_backups`.
- **Implementación exclusiva de las 3 tool calls solicitadas**:
  - `upd_check`: Comprueba en el repositorio de GitHub si existe una nueva versión disponible.
  - `upd_info`: Consulta el repositorio de GitHub y entrega información detallada de lo que se actualizó (Release Notes y Changelog).
  - `upd`: Actualiza el servidor MCP remotamente descargando y reemplazando los archivos de código desde GitHub. Desconecta el servidor al actualizar y le solicita al usuario reiniciar la aplicación (Claude Desktop).

## [9.0.5] - 2026-09-02 (Eliminación de Auto-Update y Transición a Actualización Manual)

### Cambiado
- **Eliminación definitiva de actualización automática en caliente**: Se eliminó cualquier reinicio de procesos (`process.exit(0)`, llamadas a child_process y hooks en server.mjs) desde el interior del servidor MCP. Claude Desktop nunca más se desconectará de forma inesperada mientras trabaja.
- **Actualización 100% Manual por el Usuario**:
  - `developer.get_update` y `system.check_for_updates` ahora son herramientas estrictamente informativas que reportan si existe una nueva versión y detallan las notas de la versión.
  - Las actualizaciones se aplican manualmente desde la terminal mediante: `npm run update:apply`.

## [9.0.4] - 2026-09-02 (Protección de Bases de Datos Huérfanas & Detección Explícita)

### Corregido
- **Bug `AFX-FB-F9SWJ8` — `database.execute_query` creaba silenciosamente archivos `.db` inexistentes.**
  `execute_query` ahora reporta explícitamente `db_created: true` y una advertencia cuando crea una nueva base de datos SQLite en disco. Si la consulta sobre una base de datos inexistente falla, el archivo huérfano de 0 bytes se elimina automáticamente. Además, las herramientas de inspección (`describe_table`, `search_tables`, `explain_query`, `export_table`, `analyze_database`) rechazan bases de datos inexistentes sin crear archivos vacíos por error.

## [9.0.3] - 2026-09-02 (Avisos No-Intrusivos a la IA & Correcciones de Diagnóstico)

### Añadido
- **Aviso no-intrusivo de actualización a la IA (`_update_notice`)**: El MCP ya no realiza actualizaciones automáticas ni reinicios que puedan cortar trabajos en curso. En su lugar, cuando hay una actualización disponible en GitHub, adjunta un aviso una sola vez por sesión para que la IA informe al usuario al concluir su tarea, permitiendo al usuario decidir cuándo actualizar con `developer.get_update({ apply: true })`.

### Corregido
- **Bug `AFX-FB-8TCCFE` — `network.diagnose_network` no expandía propiedades complejas.**
  `IPv4DefaultGateway` y `DNSServer` ahora expanden `.NextHop` y `.ServerAddresses` en cadenas legibles en lugar de representaciones WMI crudas.
- **Bug `AFX-FB-WDVJ7A` — `system.get_defender_status` devolvía fechas en formato `.NET` sin parsear.**
  Los campos de fecha ahora se normalizan a formato estándar ISO 8601 en lugar de `/Date(timestamp)/`.

## [9.0.2] - 2026-09-02 (Bugfixes de Seguridad y Motor de Shortcuts)

### Corregido
- **Bug `AFX-FB-S36535` — `shortcuts.execute`: parámetros planos del step `wait` ignorados.**
  El motor ahora fusiona las propiedades planas del step (ej: `{ tool: "wait", seconds: 5 }`) con `step.args`, excluyendo correctamente las claves de control (`tool`, `action`, `args`, `delayMs`, `stopOnError`). Antes, si `seconds` no estaba en `step.args`, el sleep se aplicaba con el valor por defecto de 1s.
- **Bug `AFX-FB-6BEYX8` — `diagnostics.health_check` exponía hostname real y `workspaceRoot`.**
  El hostname ahora se anonimiza por defecto con un hash SHA-256 truncado (8 chars). `workspaceRoot` solo se incluye si se pasa `expose_host_info: true`. Útil para distribución pública donde el host del MCP no debe ser conocido por el cliente.
- **Bug `AFX-FB-6BEYX8` — `files.list_allowed_directories` incluía el directorio home completo (`~`).**
  Se eliminó `runtime.dirs.home` de la lista de directorios expuestos. Ahora solo se listan las ubicaciones semánticas seguras (`mcp_root`, `documents`, `downloads`, `storage`) con su etiqueta y descripción.

## [9.0.1] - 2026-09-02 (Verified Auto-Update Release)

### Añadido
- **Parser Resiliente de JSON (`core/json-utils.mjs`)**: Soporte automático para clientes LLM (como Claude Desktop) con llaves duplicadas (`}}`/`}}}`) y argumentos envueltos en `data`/`args`.
- **Verificación de Auto-Update desde GitHub**: Validación completa de extremo a extremo del flujo de actualización automatizada desde GitHub Releases con chequeo SHA-256.

## [9.0.0] - 2026-09-02 (Release Candidate — Public Distribution Ready)

### Añadido
- **Aislamiento Total de Almacenamiento**: Módulo `core/storage-paths.mjs` que confina toda la memoria, logs, atajos y cachés en `%APPDATA%\AeroFluxerX` (Windows) o `~/.config/aero-fluxer-x` (Linux/macOS).
- **Auto-Actualizador Seguro**: Motor `core/updater.mjs` y CLI `update.mjs` con soporte para releases, verificación criptográfica de hash SHA-256, backup preventivo del código y rollback automático si el nuevo código falla la verificación.
- **Acciones MCP de Mantenimiento**: `check_for_updates`, `apply_update`, `rollback_update` y `list_backups` en el dominio `system`.
- **Instalador Asistido Multiplataforma**: `scripts/install.mjs` (`npm run setup`) que valida requisitos, instala dependencias, inicializa datos de usuario y genera snippets MCP para Claude Desktop.
- **Auto-Diagnóstico Granular**: Actualización de `core/health.mjs` (`npm run health`) con estados formales `PASS`, `WARN`, `FAIL` y `NOT_APPLICABLE` con recomendaciones de remediación.
- **Plantillas Públicas**: `shortcuts.example.json`, `aeron.config.example.json` y `.env.example`.
- **Documentación Completa**: `README.md`, `LICENSE` (MIT), `SECURITY.md`, `CONTRIBUTING.md` y `CHANGELOG.md`.

### Seguridad
- Erradicación total de credenciales y rutas absolutas privadas del repositorio.
- Fortalecimiento de `.gitignore` para bloquear permanentemente cualquier residuo de pruebas, bases de datos o secretos.

### Modificado
- `core/version.mjs` como única fuente de verdad SemVer para todo el servidor.
- `tools/shortcuts.mjs` adaptado para leer y escribir exclusivamente en el almacenamiento local del usuario.
- `core/runtime.mjs` y `core/config.mjs` desacoplados de rutas fijas locales.
