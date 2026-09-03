# Changelog de Aero Fluxer X

Todos los cambios notables en este proyecto serán documentados en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

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
