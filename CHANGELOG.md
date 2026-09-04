# Changelog de Aero Fluxer X

Todos los cambios notables en este proyecto serán documentados en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).
## [9.2.6-1] - 2026-09-04 (Hotfix: Resolución de Feedback AFX-FB-DQRTDT y Temporizadores en Segundo Plano)

### Corregido
- **Protección contra Timeout de Clientes MCP en `system.wait` y `system.sleep`**:
  - Resuelto reporte **AFX-FB-DQRTDT**: Clientes MCP como Claude Desktop tienen un timeout estricto e inmutable del lado cliente (~4 minutos / 240s) que cortaba llamadas prolongadas de espera (ej. 420s).
  - La función ahora detecta automáticamente esperas superiores a 180s y acota de forma segura la espera síncrona a 180s con metadatos estructurados (`waitedSeconds`, `remainingSeconds`, `capped: true`, advertencia explicativa) impidiendo que el cliente corte la conexión.
- **Soporte de Temporizadores en Segundo Plano (`background: true`)**:
  - Añadido el parámetro `background: true` a `system.wait` y `system.sleep` para duraciones prolongadas sin bloquear el canal JSON-RPC.
  - Nueva subherramienta `system.wait_status` para consultar el progreso y estado de temporizadores en ejecución en segundo plano.

## [9.2.6] - 2026-09-04 (General Upgrade: Modo Compacto y Soporte de Hotfixes)

### Añadido
- **Modo Compacto de Bajo Consumo (`compact: true`)**:
  - Reducción drástica del consumo de tokens en `files.list_directory`, `files.list_directory_with_sizes`, `files.read_text_file` y `system.get_processes`.
- **Motor de Versiones y Detección de Hotfixes**:
  - Soporte para etiquetas con guion (`-1`, `-2`, `-hotfix`) reconociéndolas como versiones más recientes y evitando falsos "downgrades".

## [9.2.5] - 2026-09-04 (Instalador Zero-Friction Standalone, Empaquetado Ligero y Publicación en GitHub Releases)

### Añadido
- **Instalador Zero-Friction Standalone (`Install-FluxerX.bat` y `Install-FluxerX.ps1`)**:
  - Los usuarios finales ya no necesitan clonar el repositorio ni descargar manualmente todo el código fuente. Con solo descargar y ejecutar `Install-FluxerX.bat` (o descomprimir `FluxerX-Installer-v9.2.5.zip`), el instalador realiza toda la configuración.
  - Si el script no detecta el motor localmente, descarga de forma transparente el paquete certificado `fluxer-x-v9.2.5.zip` desde GitHub Releases directo a `%LOCALAPPDATA%\FluxerX\engine`.
  - Principio de menor privilegio estricto: `-ExecutionPolicy RemoteSigned` acotado exclusivamente al proceso, sin alterar la configuración del sistema ni requerir elevación de Administrador (UAC).
  - Auto-configuración atómica para Claude Desktop, Antigravity y Codex con backup previo (`.bak.<timestamp>`), validación sintáctica JSON y rollback garantizado ante cualquier anomalía.
  - Aprovisionamiento del runtime de datos locales en `%LOCALAPPDATA%\FluxerX` (`state.json` generado en < 5ms, consumo en reposo < 60MB RSS).
- **Paquetes de Distribución Optimizados**:
  - `FluxerX-Installer-v9.2.5.zip`: Paquete ultraligero que contiene únicamente los scripts de instalación (`Install-FluxerX.bat`, `Install-FluxerX.ps1`), la plantilla de atajos y la guía rápida.
  - `fluxer-x-v9.2.5.zip`: Paquete completo del motor certificado, auditado al 100% con 0 secretos y 0 rutas locales.
- **Certificación Completa de Herramientas**:
  - Auditoría empírica de las 265 subherramientas: 265 PASS, 0 WARN, 0 FAIL.

## [9.1.5] - 2026-09-04 (Clarificación de Actualización Manual por Herramienta, Resiliencia de Prefijos y Resolución Automática de Acciones)

### Mejorado
- **Clarificación de Actualización Bajo Demanda (Cero Watchers / Cero Polling Automático)**:
  - Se confirmó y clarificó que no existe ningún watcher, daemon, bucle cron o proceso de fondo ejecutando chequeos o actualizaciones automáticas. La actualización es estrictamente manual y bajo demanda, accionable únicamente cuando el usuario o la IA invoca explícitamente la herramienta MCP `upd` (`action: "apply"` / `action: "update"`).
  - El registro de auditoría en `updater.log` y los textos informativos clarifican que el proceso es iniciado por solicitud de la herramienta MCP `upd`.
- **Limpieza de Prefijos de Servidor en Invocación de Herramientas (`server.mjs` y `core/router.mjs`)**:
  - Soporte universal para clientes MCP (como Claude Desktop) que anteponen el nombre del servidor al llamar herramientas (ej: `"Aeron Fluxer X:upd_info"`, `"Aeron Fluxer X:terminal"` o `"aeron_fluxer_x:..."`), normalizando el nombre para enrutamiento transparente sin errores de "herramienta no disponible".
- **Inferencia y Resolución Inteligente de Subherramientas (`core/router.mjs`)**:
  - Si un cliente invoca una subherramienta directamente como nombre de herramienta (ej: `tool: "run_command"`, `tool: "read_file"`, `tool: "clean_ram"`, `tool: "upd_info"`), el router detecta automáticamente el dominio correspondiente y mapea la llamada.
  - Si el cliente envía `action` dentro del objeto `args` (ej: `{ args: { action: "info" } }`), el router lo extrae y despacha automáticamente.
  - Si se invoca un dominio sin especificar `action`, el router aplica defaults inteligentes contextuales según los parámetros suministrados (ej: `files` con `path` infiere `read_text_file`, `terminal` con `command` infiere `run_command`).
- **Enriquecimiento de Alias Globales (`diagnostics`, `network`, `security`, `developer`)**:
  - Mayor cobertura de alias intuitivos para llamadas directas de cualquier modelo de lenguaje.

## [9.1.4] - 2026-09-04 (Optimización de Schemas para Claude Desktop, Detección de Subherramientas y Caché Anti-Rate-Limit)

### Añadido
- **Caché en Memoria Anti-Rate-Limit para GitHub API (`core/updater.mjs`)**:
  - `checkForUpdates` incorpora un sistema de caché en memoria de 60 segundos (TTL). Consultas consecutivas o baterías de pruebas concurrentes ya no disparan ráfagas de peticiones HTTP a la API de GitHub ni saturan el log `updater.log`, previniendo de forma absoluta el rate-limiting (límite de 60 req/h para clientes sin autenticar).
- **Enriquecimiento de Schemas MCP para Detección de Subherramientas en Clientes Desktop (`server.mjs`)**:
  - Los 10 dominios modulares y la herramienta `upd` declaran explícitamente en `inputSchema.properties` los argumentos universales más comunes (`path`, `command`, `query`, `name`, `content`, `database`, `version`, `host`, `port`, `force`, `args`).
  - Habilitado `additionalProperties: true` en todas las herramientas del servidor, permitiendo que Claude Desktop, Codex y otros clientes pasen argumentos planos sin que los validadores de esquema del cliente los rechacen.
  - La descripción de cada herramienta incluye instrucciones detalladas y ejemplos claros para que los modelos de lenguaje invoquen subherramientas con total naturalidad.
  - En la herramienta `upd` se declara formalmente la propiedad `version` para facilitar consultas inmediatas sobre cualquier release histórico o actual.

## [9.1.3] - 2026-09-04 (Corrección de Rutas Intuitivas, Fallback de Changelog y Diagnóstico Exhaustivo)

### Corregido
- **Mapeo de Alias de Rutas Intuitivas para Modelos de IA**:
  - En `core/router.mjs` y en los 10 dominios modulares se implementó soporte exhaustivo y directo para alias frecuentes llamados por LLMs (Claude, GPT, Gemini), evitando errores de tipo `unknown route`:
    - `packages.list_installed_packages` / `list_packages` / `list` → `packages.list_installed`
    - `packages.search` → `packages.search_package`
    - `packages.info` → `packages.package_info`
    - `packages.install` → `packages.install_package`
    - `packages.remove` / `uninstall` → `packages.remove_package`
    - `packages.update` / `upgrade` → `packages.update_package`
    - `database.list_tables` / `show_tables` / `tables` → `database.search_tables`
    - `database.query` → `database.execute_query`
    - `database.schema` / `describe` → `database.describe_table`
    - `database.script` → `database.execute_script`
    - `shortcuts.list_shortcuts` / `list_all` → `shortcuts.list`
    - `shortcuts.create_shortcut` / `add_shortcut` → `shortcuts.create`
    - `shortcuts.run` / `run_shortcut` / `execute_shortcut` → `shortcuts.execute`
    - `shortcuts.delete_shortcut` → `shortcuts.delete`
    - `shortcuts.get_shortcut` → `shortcuts.get`
    - `terminal.execute_command` / `exec` / `command` / `execute` → `terminal.run_command`
    - `files.read_file` → `files.read_text_file`
    - `files.create_file` → `files.write_file`
    - `files.delete_file` / `delete` → `files.delete_path`
    - `files.list_files` → `files.list_directory`
    - `files.get_metadata` / `get_info` → `files.get_file_info`
    - `system.get_info` / `info` / `system_info` / `snapshot` → `system.get_system_snapshot`
- **Fallback Automático de Changelog en `upd_info`**:
  - `upd_info` (y `upd` con `action: "info"`) ahora lee directamente de `CHANGELOG.md` en disco para extraer y devolver las notas de la versión instalada o solicitada (`version`), garantizando que llamadas como "que hay de 9.1.2" en Claude Desktop reciban el changelog completo sin depender de latencia de red en GitHub API.
- **Normalización de Diagnóstico de Red (`network.test_connection`)**:
  - `test_connection` ahora retorna `{ ok: true, reachable: false, error: ... }` cuando un puerto está cerrado o inalcanzable, indicando que la prueba de diagnóstico se ejecutó con éxito y reportando limpiamente el estado sin lanzar excepciones no manejadas.
- **Corrección de Contexto en `tools/system.mjs`**:
  - Los alias internos `optimize_ram`, `clean_memory`, `kill_process_by_name` y `analyze_memory` ahora invocan directamente las funciones correspondientes del objeto `actions` sin recurrir a `this`, evitando fallos `TypeError: this.<action> is not a function`.

## [9.1.2] - 2026-09-03 (Consolidación de 11 Herramientas Visibles y Corrección de UPD)

### Modificado
- **Consolidación de 11 Herramientas Visibles en el Servidor MCP**:
  - Se eliminaron las 8 herramientas individuales adicionales expuestas a nivel raíz, reduciendo el catálogo de 19 a **exactamente 11 herramientas visibles** en clientes como Claude Desktop:
    1. `files`
    2. `system` (incluye subacciones: `clean_ram`, `analyze_memory`, `bcd_manager`, `manage_disks`, `terminate_process`)
    3. `terminal` (incluye subacciones: `run_as_admin`, `admin_terminal`, `run_command`, etc.)
    4. `packages`
    5. `database`
    6. `security` (incluye subacciones: `grant_elevation`, `get_elevation_status`, `revoke_elevation`)
    7. `shortcuts`
    8. `network`
    9. `diagnostics`
    10. `developer`
    11. `upd` (centro unificado de actualizaciones)
- **Corrección y Optimización en la Herramienta Unificada `upd`**:
  - Soporte completo de subherramientas mediante el parámetro `action`:
    - `check`: Chequeo de nuevas versiones en GitHub.
    - `info`: Consulta de changelog y release notes.
    - `apply` / `update`: Descarga, compilación y aplicación de la actualización.
    - `data` / `status`: Auditoría forense interna en disco sin simulación.
  - Corregido error en `router.mjs` que sobrescribía la acción requerida forzando una actualización y desconexión prematura.
  - Ajustado tiempo de desconexión post-actualización a 2.5s para garantizar el transporte y entrega exitosa de la respuesta JSON-RPC a Claude Desktop antes del cierre.

## [9.1.1] - 2026-09-02 (Herramienta upd_data para Verificación Real y Anti-Simulación)

### Añadido
- **Herramienta `upd_data` (y `developer.upd_data`)**:
  - Chequeo interno dedicado para verificar si el servidor MCP instalado realmente se actualizó a la nueva versión o si aún está pendiente de reinicio.
  - Compara en tiempo real la versión en memoria (`running_version`), la versión física en archivo `core/version.mjs` (`disk_version`), la versión en `package.json` (`package_version`) y el release más reciente disponible en GitHub (`latest_remote_version`).
  - Inspecciona marcas de tiempo de modificación (`mtime`) y tamaños en bytes de archivos críticos del motor (`server.mjs`, `core/version.mjs`, `core/updater.mjs`, etc.).
  - Audita la existencia de copias de seguridad reales en `storage/backups` y los últimos eventos registrados en `updater.log`.
  - Dictamina con veredictos estrictos: `GENUINE_UPDATE_VERIFIED`, `UPDATE_APPLIED_PENDING_RESTART` o `NOT_LATEST_VERSION`. Cero simulación.

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
