# Changelog de Aero Fluxer X

Todos los cambios notables en este proyecto serán documentados en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

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
