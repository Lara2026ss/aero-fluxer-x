# ⚡ Aero Fluxer X MCP Server

> **Motor MCP de Nueva Generación para IA con Control de Sistema, Automatización de Archivos, Terminal Avanzada, Persistencia Aislada y Actualización Automática con Rollback.**

[![Version](https://img.shields.io/badge/version-9.0.0-blue.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20%7C%20Linux%20(Adaptive)-informational.svg)](docs/ARCHITECTURE.md)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](https://nodejs.org)

---

## 📖 ¿Qué es Aero Fluxer X?

**Aero Fluxer X** es un servidor [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) diseñado para potenciar a los modelos de Inteligencia Artificial (Claude Desktop, Antigravity, Cursor, etc.) con herramientas de nivel de sistema operativo: manipulación profunda de archivos y documentos (Word, Excel, PDF), ejecución de terminal y PowerShell con saneamiento UTF-8, gestión de bases de datos SQLite nativas, macros multi-paso locales, inspección de hardware/red, y un motor de actualización automática seguro con verificación criptográfica SHA-256 y rollback instantáneo.

---

## 🎯 Principales Capacidades y Dominios

Aero Fluxer X expone **10 dominios modulares con 197 acciones verificadas**:

| Dominio | Descripción | Acciones Clave |
|---|---|---|
| 📁 **`files`** | Manipulación atómica de archivos, cirugía de líneas, búsqueda y reemplazo en lotes, hashing, compresión/extracción ZIP/tar y generación/lectura de `.docx`, `.xlsx` y `.pdf`. | `read_file`, `write_file`, `create_office_document`, `read_office_document`, `extract_archive` |
| 💻 **`terminal`** | Ejecución de comandos en PowerShell/Bash con codificación UTF-8 garantizada, sesiones persistentes interactivas y control de procesos. | `run_command`, `create_session`, `run_session_command`, `kill_process` |
| ⚙️ **`system`** | Métricas de hardware en tiempo real (CPU, RAM, discos), portabilidad, clipboard, gestión de servidores y auto-actualización. | `get_system_info`, `get_cpu_info`, `check_for_updates`, `apply_update`, `rollback_update` |
| 🗄️ **`database`** | Motor SQLite nativo ultra-rápido para ejecución de DDL, consultas DML parametrizadas e introspección de esquemas. | `query_sqlite`, `execute_sqlite`, `list_tables`, `describe_table` |
| ⚡ **`shortcuts`** | Automatización y macros multi-paso personalizables almacenadas de forma estrictamente local en el equipo del usuario. | `create_shortcut`, `execute_shortcut`, `list_shortcuts`, `update_shortcut` |
| 📦 **`packages`** | Inspección y gestión de dependencias de software (npm, pip, winget, etc.). | `inspect_package_json`, `list_installed_packages`, `detect_package_manager` |
| 🛡️ **`security`** | Límites de permisos dinámicos (SAFE, NORMAL, ELEVATED), enmascaramiento de secretos y auditoría. | `get_security_mode`, `set_security_mode`, `audit_action` |
| 🌐 **`network`** | Diagnóstico de red, resolución DNS, ping, escaneo de puertos locales y peticiones HTTP estructuradas. | `ping_host`, `dns_lookup`, `check_port`, `fetch_url` |
| 🩺 **`diagnostics`** | Auto-evaluación del estado del sistema, preflight de capacidades y análisis de invariantes. | `run_diagnostics`, `get_capabilities`, `verify_invariants` |
| 🛠️ **`developer`** | Introspección del proyecto, escaneo de skills y linters. | `inspect_project`, `detect_project`, `scan_skills` |

---

## 🔒 Aislamiento Total: Código vs. Datos de Usuario

Aero Fluxer X está diseñado bajo una estricta política de **Desacoplamiento y Cero Contaminación**:

- **Repositorio Público de Código**: Contiene exclusivamente código inmutable, scripts, plantillas y recursos reproducibles. **CERO** credenciales, secretos, logs o bases de datos personales se almacenan en el repositorio.
- **Directorio de Datos del Usuario**: En la primera ejecución, Aero Fluxer X genera automáticamente un directorio local seguro en la máquina del usuario según el sistema operativo:
  - **Windows**: `%APPDATA%\AeroFluxerX\` (ej. `C:\Users\<tu-usuario>\AppData\Roaming\AeroFluxerX\`)
  - **Linux / macOS**: `~/.config/aero-fluxer-x/` o `$XDG_DATA_HOME/aero-fluxer-x/`
  - **Personalizable**: Mediante la variable de entorno `AERON_DATA_DIR`.

```
Estructura Local del Usuario:
%APPDATA%\AeroFluxerX\
├── config/       # aeron.config.json (configuración local personalizada)
├── shortcuts/    # shortcuts.json (tus macros locales)
├── memory/       # fluxer-memory.sqlite (memoria de IA persistente)
├── logs/         # fluxer.log, updater.log, audit.jsonl
└── cache/        # temporales, staging de releases y backups
```

> [!IMPORTANT]
> Las actualizaciones del código del repositorio **NUNCA** destruyen ni modifican tus atajos, memoria SQLite ni configuraciones locales.

---

## 🚀 Instalación Rápida

### Requisitos Previos
- **Node.js**: Versión 18.0.0 o superior ([descargar Node.js](https://nodejs.org/)).
- **Git** (opcional pero recomendado para clonar y actualizar).

### Paso 1: Obtener el Código
```bash
git clone https://github.com/Lara2026ss/aero-fluxer-x.git
cd aero-fluxer-x
```

> [!NOTE]
> **Arquitectura Desacoplada de GitHub**: Aero Fluxer X opera de forma 100% independiente y autónoma. No requiere tokens, claves ni conexiones a la API de GitHub para funcionar. Para interactuar con repositorios de GitHub (issues, pull requests, commits, ramas), utilice el servidor oficial `@modelcontextprotocol/server-github`. Aero Fluxer X se concentra exclusivamente en automatización local de sistema, archivos, procesos y bases de datos.

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

## 📄 Licencia

Este proyecto está licenciado bajo la Licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más detalles.
