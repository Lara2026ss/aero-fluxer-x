# ⚡ Aero Fluxer X MCP Server

> **Motor MCP de Nueva Generación para IA con Control de Sistema, Automatización de Archivos, Terminal Avanzada, Persistencia Aislada y Actualización Automática con Rollback.**

[![Version](https://img.shields.io/badge/version-10.0.0-blue.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20%7C%20Linux%20(Adaptive)-informational.svg)](docs/ARCHITECTURE.md)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](https://nodejs.org)

---

## 📖 ¿Qué es Aero Fluxer X?

**Aero Fluxer X** es un servidor [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) de alto rendimiento diseñado para potenciar a los modelos de Inteligencia Artificial (Claude Desktop, Antigravity, Cursor, etc.) con herramientas de nivel de sistema operativo: manipulación profunda de archivos y documentos (Word, Excel, PDF), ejecución de terminal y PowerShell con saneamiento UTF-8, gestión de bases de datos SQLite nativas, macros multi-paso locales, inspección de hardware/red, y un motor de actualización automática seguro con verificación criptográfica SHA-256 y rollback instantáneo.

---

## 🚀 Fluxer Z (v10.0.0) — Novedades Arquitectónicas

Con la llegada de **Project Z (v10.0.0)**, Fluxer X incorpora una profunda evolución en su motor de seguridad, ergonomía para IAs y preservación de contexto:

1. **Permission Engine con Máquina de Estados de Workflows**:
   - Escala jerárquica unificada: `guest → user → poweruser → admin → developer → admintotaluser`.
   - Nivel por defecto: `user` (mínimo privilegio).
   - Solicitudes temporales de elevación (`security.start_workflow`): 5 minutos por defecto. Al invocarse, el sistema emite `CONFIRMATION_REQUIRED` obligando a la IA a solicitar permiso explícito al usuario en el chat.
   - **Tolerancia a Reinicios (Reboot Resilient)**: El estado de elevación se persiste en SQLite y se re-evalúa dinámicamente frente al reloj del sistema (`Date.now()`). Al expirar o reiniciarse el equipo fuera de plazo, los privilegios retornan automáticamente a `user`.
2. **Nuevo Rol `admintotaluser`**:
   - Máxima autoridad funcional dentro de las herramientas de Fluxer, sin omitir las validaciones críticas de integridad y seguridad.
3. **Dominio Guide (Domain #12)**:
   - Permite a los modelos de IA consultar manuales internos en tiempo de ejecución (`guide.permissions_info`, `guide.best_practices`, `guide.tool_usage`), evitando alucinaciones o usos incorrectos de herramientas de alto impacto.
4. **Optimización de Tokens (`compact: true`)**:
   - Compresión inteligente en `files.list_directory` y `files.read_text_file` que ahorra hasta un 40% de tokens preservando estrictamente el sangrado y números de línea originales para código Python y YAML.

---

## 🎯 Principales Capacidades y Dominios

Aero Fluxer X expone **12 dominios modulares con 276 acciones verificadas empíricamente (100% PASS)**:

| Dominio | Descripción | Acciones Clave |
|---|---|---|
| 📁 **`files`** | Manipulación atómica de archivos, cirugía de líneas, búsqueda y reemplazo en lotes, hashing, compresión/extracción ZIP/tar y generación/lectura de `.docx`, `.xlsx` y `.pdf`. | `read_file`, `write_file`, `create_office_document`, `read_office_document`, `extract_archive` |
| 💻 **`terminal`** | Ejecución de comandos en PowerShell/Bash con codificación UTF-8 garantizada, sesiones persistentes interactivas y control de procesos. | `run_command`, `create_session`, `run_session_command`, `kill_process` |
| ⚙️ **`system`** | Métricas de hardware en tiempo real (CPU, RAM, discos), portabilidad, clipboard, gestión de servidores y auto-actualización. | `get_system_info`, `get_cpu_info`, `wait`, `reboot`, `shutdown` |
| 🗄️ **`database`** | Motor SQLite nativo ultra-rápido para ejecución de DDL, consultas DML parametrizadas e introspección de esquemas. | `query_sqlite`, `execute_sqlite`, `list_tables`, `describe_table` |
| ⚡ **`shortcuts`** | Automatización y macros multi-paso personalizables almacenadas de forma estrictamente local en el equipo del usuario. | `create_shortcut`, `execute_shortcut`, `list_shortcuts`, `update_shortcut` |
| 📦 **`packages`** | Inspección y gestión de dependencias de software (npm, pip, winget, etc.). | `inspect_package_json`, `list_installed_packages`, `detect_package_manager` |
| 🛡️ **`security`** | Permission Engine con Workflows, auditoría criptográfica, hashing y elevación temporal. | `start_workflow`, `get_workflow`, `revoke_workflow`, `approve_request` |
| 🌐 **`network`** | Diagnóstico de red, resolución DNS, ping, escaneo de puertos locales y peticiones HTTP estructuradas. | `ping_host`, `dns_lookup`, `check_port`, `fetch_url` |
| 🩺 **`diagnostics`** | Auto-evaluación del estado del sistema, preflight de capacidades y análisis de invariantes. | `run_diagnostics`, `get_capabilities`, `verify_invariants` |
| 🛠️ **`developer`** | Introspección del proyecto, escaneo de skills, feedback gateway y linters. | `inspect_project`, `detect_project`, `scan_skills`, `upd_check` |
| 📖 **`guide`** | Manuales internos, directrices de seguridad y mejores prácticas para IAs en tiempo real. | `permissions_info`, `best_practices`, `tool_usage` |
| 🔄 **`upd`** | Gestor autónomo de actualizaciones directas desde GitHub con integridad SHA-256 y rollback. | `check`, `info`, `apply`, `status` |

---

## 🔒 Aislamiento Total: Código vs. Datos de Usuario

Aero Fluxer X está diseñado bajo una estricta política de **Desacoplamiento y Cero Contaminación**:

- **Repositorio Público de Código**: Contiene exclusivamente código inmutable, scripts, plantillas y recursos reproducibles. **CERO** credenciales, secretos, logs o bases de datos personales se almacenan en el repositorio.
- **Directorio de Datos del Usuario**: En la primera ejecución, Aero Fluxer X genera automáticamente un directorio local seguro en la máquina del usuario según el sistema operativo:
  - **Windows**: `%LOCALAPPDATA%\FluxerX\` (ej. `C:\Users\<tu-usuario>\AppData\Local\FluxerX\`)
  - **Linux / macOS**: `~/.config/aero-fluxer-x/` o `$XDG_DATA_HOME/aero-fluxer-x/`
  - **Personalizable**: Mediante la variable de entorno `AERON_DATA_DIR` o `FLUXER_DATA_DIR`.

```
Estructura Local del Usuario:
%LOCALAPPDATA%\FluxerX\
├── engine/       # Copia limpia y certificada del motor MCP
├── config/       # aeron.config.json (configuración local personalizada)
├── shortcuts/    # shortcuts.json (tus macros locales)
├── memory/       # fluxer-memory.sqlite (memoria de IA persistente)
├── state/        # state.json (inicialización ultrarrápida < 5ms)
├── logs/         # fluxer.log, updater.log, audit.jsonl
└── cache/        # temporales, staging de releases y backups
```

> [!IMPORTANT]
> Las actualizaciones del código del repositorio **NUNCA** destruyen ni modifican tus atajos, memoria SQLite ni configuraciones locales.

---

## 🚀 Instalación Rápida

### Opción 1: Instalación Zero-Friction (Recomendada para Windows 11 / 10)
No requiere clonar el repositorio ni descargar manualmente todo el código:
1. Descargue [`Install-FluxerX.bat`](https://github.com/Lara2026ss/aero-fluxer-x/releases/latest/download/Install-FluxerX.bat) o el paquete ligero [`FluxerX-Installer-v9.2.5.zip`](https://github.com/Lara2026ss/aero-fluxer-x/releases/latest/download/FluxerX-Installer-v9.2.5.zip) desde la sección de **Releases**.
2. Haga doble clic sobre **`Install-FluxerX.bat`**.
3. El instalador descargará automáticamente el motor certificado en `%LOCALAPPDATA%\FluxerX\engine` y configurará de manera atómica Claude Desktop, Antigravity y Codex con respaldo seguro.
4. Reinicie su aplicación de IA y comience a interactuar.

### Opción 2: Instalación desde Código Fuente
Requisitos: Node.js >= 18.0.0 y Git.
```bash
git clone https://github.com/Lara2026ss/aero-fluxer-x.git
cd aero-fluxer-x
.\Install-FluxerX.bat
```

> [!NOTE]
> **Arquitectura Autónoma e Independiente**: Aero Fluxer X opera de forma 100% autónoma y desacoplada de cuentas externas. No requiere tokens, claves ni conexiones a servicios remotos para funcionar. Se concentra exclusivamente en automatización local de sistema, archivos, procesos y bases de datos.

### Paso 2: Ejecutar el Asistente de Instalación
Ejecute el script de configuración automática:
```bash
npm run setup
```
Este comando:
1. Comprueba la versión de Node.js y las capacidades del sistema operativo.
2. Instala las dependencias necesarias de Node.js.
3. Inicializa el directorio de datos del usuario y genera los atajos locales desde la plantilla `shortcuts.example.json`.
4. Ejecuta un auto-diagnóstico (`doctor`) garantizando que todas las invariantes operativas se cumplan.
5. Imprime el bloque de configuración listo para copiar y pegar en tu cliente MCP.

---

## 🔌 Configuración en Clientes MCP

### Claude Desktop
Edita tu archivo `claude_desktop_config.json`:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS/Linux**: `~/.config/Claude/claude_desktop_config.json`

Añade en la sección `mcpServers`:
```json
{
  "mcpServers": {
    "Aeron Fluxer X": {
      "command": "node",
      "args": [
        "C:\\ruta\\hacia\\aero-fluxer-x\\server.js"
      ]
    }
  }
}
```
*(Reemplaza `C:\\ruta\\hacia\\aero-fluxer-x` por la ruta absoluta donde clonaste el repositorio).*

Reinicia Claude Desktop y Aero Fluxer X estará inmediatamente conectado.

---

## 🔄 Sistema de Actualización Automática y Rollback

Aero Fluxer X incluye un actualizador seguro diseñado contra fallos, caídas de red o descargas corruptas.

### 1. Comprobar si hay actualizaciones disponibles
```bash
node update.mjs
# o
npm run update:check
```

### 2. Aplicar la actualización
```bash
node update.mjs --apply
# o
npm run update:apply
```

### ¿Cómo protege el Updater tu sistema?
1. **Verificación SemVer**: Evita downgrades accidentales y detecta cambios mayores incompatibles.
2. **Descarga Segura en Staging**: Descarga el release en un directorio temporal aislado.
3. **Validación Criptográfica SHA-256**: Si el archivo descargado está dañado o el hash no coincide, se elimina inmediatamente y se aborta el proceso sin tocar tu instalación.
4. **Backup Preventivo Automático**: Antes de reemplazar cualquier archivo, crea un respaldo completo en `%APPDATA%\AeroFluxerX\cache\backups\`.
5. **Comprobación de Sintaxis y Auto-Diagnóstico**: Verifica el código nuevo con `node --check` y el motor `doctor.mjs`.
6. **Rollback Automático**: Si el código nuevo falla cualquier comprobación, restaura automáticamente la versión anterior desde el backup.

### 3. Rollback Manual
Si deseas regresar manualmente a una versión anterior:
```bash
# Ver backups disponibles
node update.mjs --backups

# Restaurar el backup más reciente
node update.mjs --rollback

# O restaurar un backup específico
node update.mjs --rollback backup-v9.0.0-2026-09-02T12-00-00-000Z
```

---

## 🩺 Auto-Diagnóstico y Salud del Sistema

Aero Fluxer X incluye herramientas integradas de auto-verificación:

```bash
# Diagnóstico rápido de invariantes
npm run doctor

# Diagnóstico adversarial profundo
node doctor.mjs --deep

# Reporte formateado de salud
npm run health
```

El sistema clasifica el estado de cada subsistema en:
- `PASS`: Operativo y validado.
- `WARN`: Funcional con capacidades opcionales no instaladas.
- `FAIL`: Problema crítico que requiere remediación.
- `NOT_APPLICABLE`: No aplica en el entorno actual.

---

## 🛡️ Modelo de Seguridad y Permisos (Menor Privilegio por Defecto)

Fluxer X opera bajo el principio de **Seguridad por Defecto**:

1. **Nivel Base (`user`)**: Por defecto, cualquier cliente conectado (Claude Desktop, Antigravity, etc.) opera con permisos normales `user`. Operaciones seguras (lectura de archivos, diagnóstico de sistema, consultas de base de datos) funcionan sin interrupción.
2. **Acciones de Alto Privilegio (`poweruser`)**: Tareas potencialmente destructivas (ejecución de comandos en consola `terminal.run_command`, eliminación masiva de archivos o instalación de paquetes) requieren confirmación.
3. **Elevación Temporal (5 Minutos)**: Cuando la IA necesita ejecutar una tarea de rango alto, solicitará autorización al usuario. Al ser aceptada, la IA invoca `security.grant_permission({ role: "poweruser", minutes: 5 })`. Los permisos elevados expiran automáticamente tras 5 minutos sin dejar privilegios abiertos.
4. **Cero Polémica / Configuración Personalizable**: El nivel por defecto y las duraciones pueden configurarse en `aeron.config.json` (`security.defaultLevel` y `security.elevationDurationMinutes`) o mediante la variable de entorno `FLUXER_DEFAULT_LEVEL`.

---

## 📁 Estructura del Proyecto

```
aero-fluxer-x/
├── core/                  # Núcleo del servidor MCP y lógica de control
│   ├── runtime.mjs        # Ciclo de vida y orquestación del servidor
│   ├── registry.mjs       # Registro dinámico de herramientas y dominios
│   ├── router.mjs         # Enrutamiento y validación de llamadas MCP
│   ├── storage-paths.mjs  # Aislamiento de almacenamiento y paths de usuario
│   ├── version.mjs        # Fuente única de verdad SemVer
│   ├── updater.mjs        # Motor de auto-actualización con rollback
│   ├── health.mjs         # Chequeador de salud del sistema
│   └── permissions.mjs    # Motor de seguridad y permisos
├── tools/                 # Dominios modulares de herramientas MCP
│   ├── files.mjs          # Archivos, Office (.docx, .xlsx, .pdf) y compresión
│   ├── terminal.mjs       # PowerShell y ejecución de consola
│   ├── system.mjs         # Hardware, procesos, actualización y servidor
│   ├── database.mjs       # SQLite nativo
│   ├── shortcuts.mjs      # Macros y atajos locales
│   └── ...
├── doctor/                # Framework de diagnóstico y verificación adversarial
├── scripts/               # Scripts de instalación, sincronización y auditoría
├── tests/                 # Suites de pruebas automatizadas
├── server.js              # Punto de entrada estándar para clientes MCP
├── server.mjs             # Núcleo del servidor MCP sobre stdio
├── update.mjs             # CLI oficial de actualización
├── shortcuts.example.json # Plantilla pública de atajos
├── aeron.config.json      # Configuración base del motor
└── .env.example           # Plantilla de variables de entorno
```

---

## 🤝 Cómo Contribuir

1. Haz un fork del repositorio.
2. Crea una rama para tu feature (`git checkout -b feature/nueva-capacidad`).
3. Realiza tus cambios asegurándote de no incluir secretos ni rutas absolutas.
4. Ejecuta las pruebas automatizadas:
   ```bash
   node tests/test_fluxer_suite.mjs
   node tests/test_distribution_and_updater.mjs
   npm run doctor
   ```
5. Envía un Pull Request detallando los cambios y la evidencia de pruebas.

---

## 👥 Equipo y Contribuidores

- **Lara ([@Lara2026ss](https://github.com/Lara2026ss))** — Creadora, Arquitecta Principal y Líder de Desarrollo de Fluxer X.
- **Agy-Leo ([@Agy-Leo](https://github.com/Agy-Leo))** — Co-desarrollador de IA (Antigravity), Arquitectura de Permisos (Project Z), Diagnósticos, Optimización de Contexto y Auditorías Forenses.

---

## 📄 Licencia

Este proyecto está licenciado bajo la Licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más detalles.
