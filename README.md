# ⚡ FLUXER XZ (FLUXER X/Z) — Generation V4.0 Architecture

> **Plataforma MCP Nativa de Alta Densidad para IA: Orquestación DAG Multi-Paso, Integración Nativa con FL Studio 2026, Búsqueda Web Avanzada, Automatización de Sistema y Actualizador Autónomo.**

[![Version](https://img.shields.io/badge/version-30.0.1-blue.svg)](package.json)
[![Generation](https://img.shields.io/badge/generation-V4.0-purple.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20%7C%20Adaptive-informational.svg)](docs/ARCHITECTURE.md)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](https://nodejs.org)

---

## 📖 ¿Qué es FLUXER XZ (v30.0.0)?

**FLUXER XZ** (también denominado **FLUXER X/Z**) representa la **Generación Arquitectónica V4.0** del motor MCP de automatización. Trasciende los servidores MCP tradicionales saturados de cientos de herramientas dispersas que consumen excesiva ventana de contexto y tokens en los modelos de IA.

FLUXER XZ consolida más de 500 acciones internas en **exactamente 15 capacidades semánticas de alta densidad**, reduciendo la sobrecarga de tokens a la vez que introduce:
1. **Motor de Flujos DAG Paralelos (`workflow`)**: Ejecución de grafos acíclicos dirigidos con resolución de dependencias, detección estricta de ciclos (Kahn) e interpolación contextual (`{{tasks.id.data}}`).
2. **Bridge Nativo con FL Studio 2026 (`flstudio`)**: Compilador musical de alta densidad de 1 solo disparo (Trap, Lo-Fi, Synthwave, House, Drill, Reggaeton) y comunicación IPC dual (TCP socket `127.0.0.1:49152` + buzón atómico de archivos).
3. **Guía Reconstruida (`guide`)**: Búsqueda en tiempo real, introspección de capacidades y generación de flujos de trabajo sin inventar herramientas.
4. **Búsqueda Web Multidimensional (`web`)**: Búsqueda paralela deduplicada con DuckDuckGo, Bing, Wikipedia, Wikimedia y Unsplash en modo compacto por defecto.
5. **Centro de Impresión y PDFs (`print`)**: Soporte nativo para impresión continua o por páginas selectivas (`1, 5, 7`) sin bloqueos por conteo de hojas.
6. **Actualizador Remoto Autónomo (`upd`)**: Proceso desacoplado que sortea el bloqueo de archivos en caliente de Windows con auditoría y rollback atómico.

---

## 🎯 Las 15 Capacidades Semánticas Principales

| Capacidad | Descripción | Operaciones Principales |
|---|---|---|
| ⚡ **`workflow`** | Orquestador de grafos acíclicos dirigidos (DAG), ejecución concurrente con rollback. | `run`, `validate`, `template`, `status` |
| 🛠️ **`developer`** | Inspección y diagnóstico profundo del proyecto, tests, builds y sintaxis. | `inspect_project`, `run_tests`, `run_build`, `code_intel` |
| ⚙️ **`system`** | Métricas de hardware, procesos de Windows, energía, clipboard y snapshots. | `snapshot`, `processes`, `info`, `clipboard`, `kill_process` |
| 📁 **`files`** | Manipulación atómica de archivos, cirugía de líneas, documentos (.docx, .xlsx, .pdf). | `read`, `write`, `search`, `line_surgery`, `office_doc` |
| 💻 **`terminal`** | Consola UTF-8 PowerShell/CMD con sesiones persistentes y background. | `exec`, `create_session`, `session_exec`, `kill` |
| 🌐 **`network`** | Diagnóstico de red, conectividad, resolución DNS y escaneo de puertos. | `test_connection`, `dns`, `ports`, `fetch` |
| 🛡️ **`security`** | Niveles de permisos (SAFE, NORMAL, ELEVATED), auditoría y enmascaramiento. | `status`, `grant_elevation`, `audit_log`, `verify` |
| 🗄️ **`database`** | Motor SQLite local parametrizado para persistencia de datos y consultas. | `query`, `execute`, `tables`, `schema` |
| 📦 **`packages`** | Gestión e inspección de dependencias (npm, pip, winget). | `inspect`, `list`, `install`, `check_outdated` |
| 🔍 **`web`** | Búsqueda multi-proveedor, extracción HTML y buscador de imágenes con deduplicación. | `multi_search`, `images`, `extract`, `search` |
| 📸 **`media`** | Capturas de pantalla atómicas, información de pantallas y previsualizaciones. | `capture_screen`, `screens_info`, `preview` |
| 🖨️ **`print`** | Gestión de impresión de Windows, soporte PDF continuo (`continuous`, `all`, `1-4`). | `printers`, `print_file`, `print_pdf`, `status` |
| 🎹 **`flstudio`** | Bridge IPC y compilador musical para FL Studio 2026 sin consumo excesivo de tokens. | `detect`, `music_create`, `transport`, `channels`, `mixer` |
| 🔄 **`upd`** | Actualizador autónomo remoto contra GitHub con rollback atómico y doctor. | `check`, `info`, `apply`, `rollback`, `doctor` |
| 📚 **`guide`** | Explorador interactivo de capacidades, ayuda semántica y plantillas de workflows. | `overview`, `search`, `category`, `capability_info`, `workflows` |

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

## 📄 Licencia

Este proyecto está licenciado bajo la Licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más detalles.
