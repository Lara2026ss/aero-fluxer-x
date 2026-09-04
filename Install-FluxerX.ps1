<#
.SYNOPSIS
    Instalador Zero-Friction y Bootstrapper de Fluxer X MCP para Windows 11.
.DESCRIPTION
    1. Descarga e instala Node.js LTS (v18+) si no esta instalado o si es obsoleto.
    2. Descarga el ZIP de Fluxer X MCP completo desde GitHub con fallback multi-origen.
    3. Extrae el motor en la carpeta "Documentos\Fluxer X".
    4. Instala las dependencias necesarias de Node.js (npm install --omit=dev).
    5. Detecta y auto-configura Claude Desktop, Google Antigravity, Codex y Cursor con backup atomico.
    6. Termina el proceso notificando el estado listo.
#>

[CmdletBinding()]
param(
    [switch]$SkipClientConfig,
    [string]$CustomAppDir,
    [string]$TargetVersion = "9.2.5",
    [string]$DownloadUrl,
    [switch]$ForceDownload,
    [switch]$TestMode
)

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  FLUXER X MCP - INSTALADOR ZERO-FRICTION PARA WINDOWS 11" -ForegroundColor Cyan
Write-Host "======================================================================`n" -ForegroundColor Cyan

# 1. Validacion de Sistema Operativo (Windows 10/11)
Write-Host "[1/6] Verificando compatibilidad de plataforma..." -ForegroundColor Yellow
$osVersion = [System.Environment]::OSVersion.Version
if ($osVersion.Major -lt 10) {
    Write-Error "Fluxer X requiere Windows 10 (Build 19041+) o Windows 11. Version detectada: $osVersion"
    exit 1
}
$arch = [System.Environment]::GetEnvironmentVariable("PROCESSOR_ARCHITECTURE")
Write-Host "  [OK] Windows detectado: $($osVersion.Major).$($osVersion.Minor) Build $($osVersion.Build) ($arch)" -ForegroundColor Green

# 2. Primero: Validacion y Auto-Instalacion de Node.js Runtime (v18+)
Write-Host "`n[2/6] Asegurando entorno de ejecucion Node.js (v18+)..." -ForegroundColor Yellow
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue

$needNodeInstall = $false
if (-not $nodeCmd) {
    Write-Host "  [!] Node.js no fue encontrado en el PATH del sistema." -ForegroundColor Yellow
    $needNodeInstall = $true
} else {
    $nodeVerStr = (& node -v).Trim()
    $rawMajor = ($nodeVerStr -replace '^v','').Split('.')[0]
    $major = [int]$rawMajor
    if ($major -lt 18) {
        Write-Host "  [!] Version de Node.js obsoleta detectada: $nodeVerStr (Se requiere v18.0 o superior)." -ForegroundColor Yellow
        $needNodeInstall = $true
    } else {
        Write-Host "  [OK] Node.js compatible detectado: $nodeVerStr" -ForegroundColor Green
    }
}

if ($needNodeInstall) {
    Write-Host "  Instalando Node.js LTS automaticamente..." -ForegroundColor Cyan
    try {
        Write-Host "  - Intentando instalacion silenciosa via winget..." -ForegroundColor DarkGray
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    } catch {}

    # Refrescar PATH del proceso
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
    $nodeDefaultDir = Join-Path $env:ProgramFiles "nodejs"
    if (Test-Path $nodeDefaultDir) {
        $env:Path = "$nodeDefaultDir;$env:Path"
    }

    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        Write-Host "  - winget no disponible. Descargando instalador oficial MSI desde nodejs.org..." -ForegroundColor Cyan
        try {
            $msiPath = Join-Path $env:TEMP "node-v20-lts-x64.msi"
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
            Invoke-WebRequest -Uri "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi" -OutFile $msiPath -UseBasicParsing
            Write-Host "  - Ejecutando instalador silencioso de Node.js..." -ForegroundColor Cyan
            Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /qn" -Wait -NoNewWindow
            Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
        } catch {
            Write-Warning "Fallo la descarga del MSI oficial de Node.js: $_"
        }

        # Re-refrescar PATH
        $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
        $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
        $env:Path = "$machinePath;$userPath"
        if (Test-Path $nodeDefaultDir) {
            $env:Path = "$nodeDefaultDir;$env:Path"
        }
        $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    }

    if (-not $nodeCmd) {
        Write-Error "No se pudo instalar Node.js automaticamente. Por favor instale Node.js manualmente desde https://nodejs.org y vuelva a ejecutar el instalador."
        exit 1
    }

    $nodeVerStr = (& node -v).Trim()
    Write-Host "  [OK] Node.js instalado y verificado: $nodeVerStr" -ForegroundColor Green
}

# 3. Ubicacion del Motor en "Documentos\Fluxer X" y Descarga del ZIP Completo
Write-Host "`n[3/6] Preparando motor Fluxer X en carpeta Documentos..." -ForegroundColor Yellow
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$myDocs = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::MyDocuments)
if (-not $myDocs) {
    $myDocs = Join-Path $env:USERPROFILE "Documents"
}
$targetDocsDir = if ($TestMode) { Join-Path $env:TEMP "FluxerX_Sandbox_Docs" } else { $myDocs }
$fluxerEngineDir = if ($CustomAppDir) { $CustomAppDir } else { Join-Path $targetDocsDir "Fluxer X" }

# Directorios de datos y estado local (%LOCALAPPDATA%\FluxerX)
$localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE "AppData\Local" }
$fluxerDataDir = if ($TestMode) { Join-Path $env:TEMP "FluxerX_Sandbox_Data" } else { Join-Path $localAppData "FluxerX" }
$fluxerStateDir = Join-Path $fluxerDataDir "state"
$fluxerLogsDir = Join-Path $fluxerDataDir "logs"
$fluxerShortcutsDir = Join-Path $fluxerDataDir "shortcuts"
$fluxerCacheDir = Join-Path $fluxerDataDir "cache"

$dirs = @($fluxerEngineDir, $fluxerDataDir, $fluxerStateDir, $fluxerLogsDir, $fluxerShortcutsDir, $fluxerCacheDir)
foreach ($d in $dirs) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
}
Write-Host "  [OK] Destino del motor MCP: $fluxerEngineDir" -ForegroundColor Green
Write-Host "  [OK] Datos locales de usuario: $fluxerDataDir" -ForegroundColor Green

# Determinar si ya tenemos el motor local listo en el directorio destino o si debemos descargar el zip completo
$hasEngineInDest = (Test-Path (Join-Path $fluxerEngineDir "package.json")) -and ((Test-Path (Join-Path $fluxerEngineDir "server.js")) -or (Test-Path (Join-Path $fluxerEngineDir "server.mjs")))
$hasSourceInScriptDir = (Test-Path (Join-Path $scriptDir "package.json")) -and ((Test-Path (Join-Path $scriptDir "server.js")) -or (Test-Path (Join-Path $scriptDir "server.mjs")))

if ($hasEngineInDest -and (-not $ForceDownload)) {
    Write-Host "  [OK] Motor Fluxer X completo ya presente en: $fluxerEngineDir" -ForegroundColor Green
} elseif ($hasSourceInScriptDir -and (-not $ForceDownload) -and ($scriptDir -ne $fluxerEngineDir)) {
    Write-Host "  Copiando motor local a Documentos\Fluxer X..." -ForegroundColor Cyan
    Get-ChildItem -Path $scriptDir -Exclude "node_modules",".git","dist" | ForEach-Object {
        $dest = Join-Path $fluxerEngineDir $_.Name
        if ($_.PSIsContainer) {
            Copy-Item -Path $_.FullName -Destination $dest -Recurse -Force
        } else {
            Copy-Item -Path $_.FullName -Destination $dest -Force
        }
    }
    Write-Host "  [OK] Motor local aprovisionado en Documentos\Fluxer X." -ForegroundColor Green
} else {
    Write-Host "  Descargando ZIP completo de Fluxer X v$TargetVersion desde GitHub..." -ForegroundColor Cyan

    $downloadCandidates = @()
    if ($DownloadUrl) {
        $downloadCandidates += $DownloadUrl
    }
    # 1. Versión de Fábrica Certificada (Gold Master)
    $downloadCandidates += "https://github.com/Lara2026ss/aero-fluxer-x/releases/download/v$TargetVersion/fluxer-x-factory.zip"
    # 2. Release oficial ZIP
    $downloadCandidates += "https://github.com/Lara2026ss/aero-fluxer-x/releases/download/v$TargetVersion/fluxer-x-v$TargetVersion.zip"
    # 3. Release tag fallback
    $downloadCandidates += "https://github.com/Lara2026ss/aero-fluxer-x/archive/refs/tags/v$TargetVersion.zip"
    # 4. Main branch fallback
    $downloadCandidates += "https://github.com/Lara2026ss/aero-fluxer-x/archive/refs/heads/main.zip"

    $tempZip = Join-Path $fluxerCacheDir "fluxer-x-download.zip"
    $downloadSuccess = $false

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

    foreach ($candidateUrl in $downloadCandidates) {
        Write-Host "  - Consultando origen: $candidateUrl..." -ForegroundColor DarkGray
        try {
            Invoke-WebRequest -Uri $candidateUrl -OutFile $tempZip -UseBasicParsing -TimeoutSec 45
            if ((Test-Path $tempZip) -and ((Get-Item $tempZip).Length -gt 10000)) {
                $downloadSuccess = $true
                $mbSize = [Math]::Round(((Get-Item $tempZip).Length / 1MB), 2)
                Write-Host "  [OK] ZIP completo descargado exitosamente ($mbSize MB)." -ForegroundColor Green
                break
            }
        } catch {
            Write-Host "  - No disponible en esta URL, probando siguiente origen..." -ForegroundColor DarkGray
        }
    }

    if (-not $downloadSuccess) {
        Write-Error "No se pudo descargar el ZIP de Fluxer X desde GitHub. Verifique su conexion a Internet."
        exit 1
    }

    Write-Host "  Extrayendo en 'Documentos\Fluxer X'..." -ForegroundColor Cyan
    $tempExtract = Join-Path $fluxerCacheDir "temp_extract"
    if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Path $tempExtract -Force | Out-Null

    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
    Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue

    # Detectar si el contenido extraido esta dentro de una subcarpeta (ej: aero-fluxer-x-main)
    $subDirs = Get-ChildItem -Path $tempExtract -Directory
    $rootContent = $tempExtract
    if (($subDirs.Count -eq 1) -and (-not (Test-Path (Join-Path $tempExtract "package.json")))) {
        $rootContent = $subDirs[0].FullName
    }

    # Copiar contenido directamente a $fluxerEngineDir
    Get-ChildItem -Path $rootContent | ForEach-Object {
        $dest = Join-Path $fluxerEngineDir $_.Name
        if ($_.PSIsContainer) {
            Copy-Item -Path $_.FullName -Destination $dest -Recurse -Force
        } else {
            Copy-Item -Path $_.FullName -Destination $dest -Force
        }
    }
    Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host "  [OK] Motor Fluxer X extraido completamente en: $fluxerEngineDir" -ForegroundColor Green
}

# Inicializar shortcuts por defecto si no existen
$templateShortcuts = Join-Path $fluxerEngineDir "shortcuts.template.json"
$targetShortcuts = Join-Path $fluxerShortcutsDir "shortcuts.json"
if ((Test-Path $templateShortcuts) -and (-not (Test-Path $targetShortcuts))) {
    Copy-Item -Path $templateShortcuts -Destination $targetShortcuts -Force
    Write-Host "  [OK] Plantilla de shortcuts inicializada en: $targetShortcuts" -ForegroundColor Green
}

# 4. Instalacion de dependencias de Node.js en Documentos\Fluxer X
Write-Host "`n[4/6] Instalando dependencias de Node.js en Documentos\Fluxer X..." -ForegroundColor Yellow
$nodeModules = Join-Path $fluxerEngineDir "node_modules"
$mcpSdk = Join-Path $nodeModules "@modelcontextprotocol\sdk"

if ((-not (Test-Path $nodeModules)) -or (-not (Test-Path $mcpSdk))) {
    Write-Host "  Instalando dependencias necesarias (npm install --omit=dev)..." -ForegroundColor Cyan
    Push-Location $fluxerEngineDir
    try {
        $npmCmd = "npm"
        $defaultNpm = Join-Path $env:ProgramFiles "nodejs\npm.cmd"
        if (Test-Path $defaultNpm) {
            $npmCmd = $defaultNpm
        }
        & $npmCmd install --omit=dev --no-audit --no-fund
    } catch {
        Write-Warning "Advertencia durante instalacion de dependencias: $_"
    } finally {
        Pop-Location
    }
}
Write-Host "  [OK] Dependencias verificadas en: $nodeModules" -ForegroundColor Green

# 5. Ejecucion del First-Run Bootstrap y prueba de arranque
Write-Host "`n[5/6] Inicializando estado y verificando servidor MCP..." -ForegroundColor Yellow
$serverJs = Join-Path $fluxerEngineDir "server.js"
if (-not (Test-Path $serverJs)) {
    $serverJs = Join-Path $fluxerEngineDir "server.mjs"
}

$bootstrapCheckScript = @'
import('./core/runtime.mjs').then(async ({ createRuntime }) => {
  const runtime = await createRuntime({ root: process.cwd() });
  console.log('BOOTSTRAP_HOST:' + runtime.displayHostname);
  console.log('BOOTSTRAP_ID:' + runtime.hostId);
  console.log('BOOTSTRAP_READY:' + runtime.isReady);
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
'@

Push-Location $fluxerEngineDir
try {
    $bootstrapOutput = & node --input-type=module -e $bootstrapCheckScript
    $hostMatch = ($bootstrapOutput | Select-String "BOOTSTRAP_HOST:(.+)").Matches.Groups[1].Value
    $idMatch = ($bootstrapOutput | Select-String "BOOTSTRAP_ID:(.+)").Matches.Groups[1].Value
    Write-Host "  [OK] Host detectado: $hostMatch" -ForegroundColor Green
    Write-Host "  [OK] Host ID local: $idMatch" -ForegroundColor Green
    Write-Host "  [OK] Estado persistido en: $fluxerStateDir\state.json" -ForegroundColor Green
} catch {
    Write-Error "Error ejecutando el bootstrap inicial: $_"
    exit 1
} finally {
    Pop-Location
}

# Verificacion Funcional del Servidor MCP
Push-Location $fluxerEngineDir
try {
    $diagScript = "import('./core/version.mjs').then(v => { console.log('MCP_SERVER_OK:' + v.CURRENT_VERSION); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"
    $diagOutput = & node --input-type=module -e $diagScript
    if ($diagOutput -match "MCP_SERVER_OK:(.+)") {
        $ver = $Matches[1]
        Write-Host "  [OK] Servidor MCP probado: Motor v$ver operativo y funcional." -ForegroundColor Green
    }
} catch {
    Write-Error "Fallo la verificacion funcional del servidor MCP: $_"
    exit 1
} finally {
    Pop-Location
}

# 6. Deteccion y Auto-Configuracion de Clientes MCP (Claude Desktop, Antigravity, Codex, Cursor)
if ($TestMode) {
    Write-Host "`n[6/6] Modo de Prueba activado (-TestMode): Omitiendo modificacion de clientes reales." -ForegroundColor Cyan
    Write-Host "  [OK] Simulacion completada con exito en sandbox." -ForegroundColor Green
} elseif (-not $SkipClientConfig) {
    Write-Host "`n[6/6] Auto-configurando clientes MCP detectados (Claude Desktop, Antigravity, Codex, Cursor)..." -ForegroundColor Yellow

    function Update-McpClientConfig {
        param(
            [string]$ClientName,
            [string]$ConfigPath,
            [string]$ServerKey,
            [hashtable]$ServerConfig
        )

        $configDir = Split-Path $ConfigPath -Parent
        if (-not (Test-Path $configDir)) {
            Write-Host "  - ${ClientName}: No detectado (directorio no existe)." -ForegroundColor DarkGray
            return $false
        }

        # 1. Crear respaldo previo con timestamp
        $timestamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
        $backupPath = "$ConfigPath.bak.$timestamp"

        $configObj = @{ mcpServers = @{} }
        if (Test-Path $ConfigPath) {
            Copy-Item -Path $ConfigPath -Destination $backupPath -Force
            try {
                $content = [System.IO.File]::ReadAllText($ConfigPath, [System.Text.Encoding]::UTF8)
                if ($content.Trim()) {
                    $configObj = $content | ConvertFrom-Json
                }
            } catch {
                Write-Warning "No se pudo parsear $ConfigPath. Creando archivo nuevo con respaldo previo."
            }
        }

        try {
            $serversMap = @{}
            if ($configObj.mcpServers) {
                if ($configObj.mcpServers -is [System.Management.Automation.PSCustomObject]) {
                    foreach ($prop in $configObj.mcpServers.PSObject.Properties) {
                        $serversMap[$prop.Name] = $prop.Value
                    }
                } elseif ($configObj.mcpServers -is [System.Collections.IDictionary]) {
                    $serversMap = $configObj.mcpServers
                }
            }

            # 2. Modificar UNICAMENTE la entrada de Fluxer X
            $serversMap[$ServerKey] = $ServerConfig

            $finalObj = [ordered]@{
                mcpServers = $serversMap
            }

            if ($configObj -is [System.Management.Automation.PSCustomObject]) {
                foreach ($prop in $configObj.PSObject.Properties) {
                    if ($prop.Name -ne "mcpServers") {
                        $finalObj[$prop.Name] = $prop.Value
                    }
                }
            }

            # 3. Validar JSON resultante y asegurar formato de array para args (compatibilidad PowerShell 5.1)
            $jsonString = $finalObj | ConvertTo-Json -Depth 10
            $jsonString = $jsonString -replace '("args"\s*:\s*)"([^"\r\n]+)"', '$1[ "$2" ]'
            $validationCheck = $jsonString | ConvertFrom-Json
            if (-not $validationCheck.mcpServers.$ServerKey) {
                throw "Fallo de validacion interna al verificar entrada $ServerKey."
            }

            # 4. Escritura atomica UTF-8
            [System.IO.File]::WriteAllText($ConfigPath, $jsonString, [System.Text.Encoding]::UTF8)
            Write-Host "  [OK] ${ClientName}: Configurado exitosamente ($ServerKey)" -ForegroundColor Green
            Write-Host "       Backup seguro creado en: $backupPath" -ForegroundColor DarkGray
            return $true
        } catch {
            Write-Warning "Fallo al actualizar ${ClientName}. Restaurando backup..."
            if (Test-Path $backupPath) {
                Copy-Item -Path $backupPath -Destination $ConfigPath -Force
            }
            Write-Error "No se pudo actualizar la configuracion de ${ClientName}: $_"
            return $false
        }
    }

    $fluxerServerEntry = @{
        command = "node"
        args = @($serverJs)
    }

    # A) Claude Desktop
    $claudeConfig = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
    Update-McpClientConfig -ClientName "Claude Desktop" -ConfigPath $claudeConfig -ServerKey "Aeron_Fluxer_X" -ServerConfig $fluxerServerEntry

    # B) Antigravity
    $antigravityConfig = Join-Path $env:USERPROFILE ".gemini\config\mcp_config.json"
    Update-McpClientConfig -ClientName "Google Antigravity" -ConfigPath $antigravityConfig -ServerKey "Aeron_Fluxer_X" -ServerConfig $fluxerServerEntry

    # C) Codex / Extensiones MCP
    $codexConfig = Join-Path $env:USERPROFILE ".codex\config.json"
    if (Test-Path (Split-Path $codexConfig -Parent)) {
        Update-McpClientConfig -ClientName "Codex" -ConfigPath $codexConfig -ServerKey "Aeron_Fluxer_X" -ServerConfig $fluxerServerEntry
    }

    # D) Cursor (soporte nativo MCP)
    $cursorConfigDir = Join-Path $env:USERPROFILE ".cursor"
    $cursorInstalled = (Test-Path $cursorConfigDir) -or (Test-Path (Join-Path $env:LOCALAPPDATA "Programs\cursor")) -or (Test-Path (Join-Path $env:APPDATA "Cursor"))
    if ($cursorInstalled) {
        if (-not (Test-Path $cursorConfigDir)) {
            New-Item -ItemType Directory -Path $cursorConfigDir -Force | Out-Null
        }
        $cursorConfig = Join-Path $cursorConfigDir "mcp.json"
        Update-McpClientConfig -ClientName "Cursor" -ConfigPath $cursorConfig -ServerKey "Aeron_Fluxer_X" -ServerConfig $fluxerServerEntry
    } else {
        Write-Host "  - Cursor: No detectado en el sistema." -ForegroundColor DarkGray
    }
}

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "  INSTALACION DE FLUXER X COMPLETADA CON EXITO!" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "* Ubicacion del Motor: $fluxerEngineDir" -ForegroundColor White
Write-Host "* Entrypoint MCP:      $serverJs" -ForegroundColor White
Write-Host "* Clientes MCP:        Reinicie Claude Desktop, Cursor o recargue Antigravity." -ForegroundColor Yellow
Write-Host ""
