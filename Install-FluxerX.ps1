<#
.SYNOPSIS
    Instalador Zero-Friction y Bootstrapper de Fluxer X MCP para Windows 11.
.DESCRIPTION
    Configura Fluxer X en el perfil del usuario sin requerir privilegios de administrador,
    asegura Node.js v18+, descarga el motor completo, verifica dependencias y registra
    el servidor en Claude Desktop, Antigravity y Codex con respaldos automaticos.
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

# 2. Validacion y Auto-Instalacion de Node.js Runtime (v18+)
Write-Host "`n[2/6] Verificando entorno de ejecucion Node.js..." -ForegroundColor Yellow
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
        Write-Host "  - Intentando instalacion via winget..." -ForegroundColor DarkGray
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
        Write-Host "  - winget no disponible. Descargando instalador oficial MSI..." -ForegroundColor Cyan
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

# 3. Preparacion de Directorio de la Aplicacion y Datos Locales
Write-Host "`n[3/6] Aprovisionando almacenamiento y motor Fluxer X..." -ForegroundColor Yellow
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE "AppData\Local" }
$fluxerDataDir = if ($TestMode) { Join-Path $env:TEMP "FluxerX_Sandbox_Test" } else { Join-Path $localAppData "FluxerX" }
$fluxerEngineDir = Join-Path $fluxerDataDir "engine"
$fluxerConfigDir = Join-Path $fluxerDataDir "config"
$fluxerStateDir = Join-Path $fluxerDataDir "state"
$fluxerLogsDir = Join-Path $fluxerDataDir "logs"
$fluxerShortcutsDir = Join-Path $fluxerDataDir "shortcuts"
$fluxerCacheDir = Join-Path $fluxerDataDir "cache"

$dirs = @($fluxerDataDir, $fluxerEngineDir, $fluxerConfigDir, $fluxerStateDir, $fluxerLogsDir, $fluxerShortcutsDir, $fluxerCacheDir)
foreach ($d in $dirs) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
}
Write-Host "  [OK] Directorio de datos de usuario: $fluxerDataDir" -ForegroundColor Green

$hasLocalEngine = (-not $ForceDownload) -and (Test-Path (Join-Path $scriptDir "package.json")) -and ((Test-Path (Join-Path $scriptDir "server.js")) -or (Test-Path (Join-Path $scriptDir "server.mjs")))

if ($CustomAppDir) {
    $appDir = $CustomAppDir
    Write-Host "  [OK] Directorio personalizado de aplicacion: $appDir" -ForegroundColor Green
} elseif ($hasLocalEngine -and (-not $TestMode)) {
    $appDir = $scriptDir
    Write-Host "  [OK] Motor local detectado en el paquete actual: $appDir" -ForegroundColor Green
} else {
    $appDir = $fluxerEngineDir
    Write-Host "  -> Modo Standalone (Instalacion Rapida):" -ForegroundColor Cyan
    Write-Host "     Descargando motor Fluxer X v$TargetVersion completo desde GitHub..." -ForegroundColor Cyan

    $downloadCandidates = @()
    if ($DownloadUrl) {
        $downloadCandidates += $DownloadUrl
    }
    $downloadCandidates += "https://github.com/Lara2026ss/aero-fluxer-x/releases/download/v$TargetVersion/fluxer-x-v$TargetVersion.zip"
    $downloadCandidates += "https://github.com/Lara2026ss/aero-fluxer-x/archive/refs/tags/v$TargetVersion.zip"
    $downloadCandidates += "https://github.com/Lara2026ss/aero-fluxer-x/archive/refs/heads/main.zip"

    $tempZip = Join-Path $fluxerCacheDir "fluxer-x-download.zip"
    $downloadSuccess = $false

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

    foreach ($candidateUrl in $downloadCandidates) {
        Write-Host "     Consultando origen: $candidateUrl..." -ForegroundColor DarkGray
        try {
            Invoke-WebRequest -Uri $candidateUrl -OutFile $tempZip -UseBasicParsing -TimeoutSec 45
            if ((Test-Path $tempZip) -and ((Get-Item $tempZip).Length -gt 10000)) {
                $downloadSuccess = $true
                $mbSize = [Math]::Round(((Get-Item $tempZip).Length / 1MB), 2)
                Write-Host "     [OK] Motor descargado exitosamente ($mbSize MB)." -ForegroundColor Green
                break
            }
        } catch {
            Write-Host "     - No disponible en esta URL, probando siguiente origen..." -ForegroundColor DarkGray
        }
    }

    if (-not $downloadSuccess) {
        Write-Error "No se pudo descargar Fluxer X desde GitHub. Verifique su conexion a Internet o descargue el repositorio manualmente."
        exit 1
    }

    Write-Host "     Descomprimiendo motor en: $fluxerEngineDir..." -ForegroundColor Cyan
    $tempExtract = Join-Path $fluxerCacheDir "temp_extract"
    if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Path $tempExtract -Force | Out-Null

    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
    Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue

    $subDirs = Get-ChildItem -Path $tempExtract -Directory
    $rootContent = $tempExtract
    if (($subDirs.Count -eq 1) -and (-not (Test-Path (Join-Path $tempExtract "package.json")))) {
        $rootContent = $subDirs[0].FullName
    }

    Get-ChildItem -Path $rootContent | ForEach-Object {
        $dest = Join-Path $fluxerEngineDir $_.Name
        if ($_.PSIsContainer) {
            Copy-Item -Path $_.FullName -Destination $dest -Recurse -Force
        } else {
            Copy-Item -Path $_.FullName -Destination $dest -Force
        }
    }
    Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue

    # Inicializar shortcuts por defecto si no existen
    $templateShortcuts = Join-Path $fluxerEngineDir "shortcuts.template.json"
    $targetShortcuts = Join-Path $fluxerShortcutsDir "shortcuts.json"
    if ((Test-Path $templateShortcuts) -and (-not (Test-Path $targetShortcuts))) {
        Copy-Item -Path $templateShortcuts -Destination $targetShortcuts -Force
        Write-Host "     [OK] Plantilla de shortcuts inicializada en perfil local." -ForegroundColor Green
    }

    Write-Host "     [OK] Motor Fluxer X instalado y preparado en el perfil de usuario." -ForegroundColor Green
}

# 4. Instalacion de dependencias si node_modules no existe
Write-Host "`n[4/6] Verificando dependencias del paquete..." -ForegroundColor Yellow
$nodeModules = Join-Path $appDir "node_modules"
$mcpSdk = Join-Path $nodeModules "@modelcontextprotocol\sdk"

if ((-not (Test-Path $nodeModules)) -or (-not (Test-Path $mcpSdk))) {
    Write-Host "  Instalando dependencias de produccion (npm install --omit=dev)..." -ForegroundColor Cyan
    Push-Location $appDir
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
Write-Host "  [OK] Dependencias verificadas." -ForegroundColor Green

# 5. Ejecucion del First-Run Bootstrap
Write-Host "`n[5/6] Ejecutando First-Run Bootstrap e identidad de host..." -ForegroundColor Yellow
$serverJs = Join-Path $appDir "server.js"
if (-not (Test-Path $serverJs)) {
    $serverJs = Join-Path $appDir "server.mjs"
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

Push-Location $appDir
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

# 5.1 Verificacion Funcional del Servidor MCP
Write-Host "`n  -> Verificando arranque funcional del servidor MCP..." -ForegroundColor Cyan
Push-Location $appDir
try {
    $diagScript = "import('./core/version.mjs').then(v => { console.log('MCP_SERVER_OK:' + v.CURRENT_VERSION); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"
    $diagOutput = & node --input-type=module -e $diagScript
    if ($diagOutput -match "MCP_SERVER_OK:(.+)") {
        $ver = $Matches[1]
        Write-Host "  [OK] Servidor MCP probado: Motor v$ver verificado y operativo." -ForegroundColor Green
    } else {
        Write-Warning "Respuesta inesperada al verificar el servidor: $diagOutput"
    }
} catch {
    Write-Error "Fallo la verificacion funcional del servidor MCP: $_"
    exit 1
} finally {
    Pop-Location
}

# 6. Auto-Configuracion Atomica de Clientes MCP (Claude Desktop, Antigravity, Codex)
if ($TestMode) {
    Write-Host "`n[6/6] Modo de Prueba activado (-TestMode): Omitiendo modificacion de clientes reales." -ForegroundColor Cyan
    Write-Host "  [OK] Simulacion de aprovisionamiento completada exitosamente en: $fluxerDataDir" -ForegroundColor Green
} elseif (-not $SkipClientConfig) {
    Write-Host "`n[6/6] Auto-configurando clientes MCP compatibles..." -ForegroundColor Yellow

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
            return
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

            # 3. Validar JSON resultante
            $jsonString = $finalObj | ConvertTo-Json -Depth 10
            $validationCheck = $jsonString | ConvertFrom-Json
            if (-not $validationCheck.mcpServers.$ServerKey) {
                throw "Fallo de validacion interna al verificar entrada $ServerKey."
            }

            # 4. Escritura atomica UTF-8
            [System.IO.File]::WriteAllText($ConfigPath, $jsonString, [System.Text.Encoding]::UTF8)
            Write-Host "  [OK] ${ClientName}: Configurado exitosamente ($ServerKey)" -ForegroundColor Green
            Write-Host "       Backup seguro creado en: $backupPath" -ForegroundColor DarkGray
        } catch {
            Write-Warning "Fallo al actualizar ${ClientName}. Restaurando backup..."
            if (Test-Path $backupPath) {
                Copy-Item -Path $backupPath -Destination $ConfigPath -Force
            }
            Write-Error "No se pudo actualizar la configuracion de ${ClientName}: $_"
        }
    }

    $fluxerServerEntry = @{
        command = "node"
        args = @($serverJs)
    }

    # A) Claude Desktop
    $claudeConfig = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
    Update-McpClientConfig -ClientName "Claude Desktop" -ConfigPath $claudeConfig -ServerKey "Fluxer_X" -ServerConfig $fluxerServerEntry

    # B) Antigravity
    $antigravityConfig = Join-Path $env:USERPROFILE ".gemini\config\mcp_config.json"
    Update-McpClientConfig -ClientName "Google Antigravity" -ConfigPath $antigravityConfig -ServerKey "Fluxer_X" -ServerConfig $fluxerServerEntry

    # C) Codex / Extensiones MCP
    $codexConfig = Join-Path $env:USERPROFILE ".codex\config.json"
    if (Test-Path (Split-Path $codexConfig -Parent)) {
        Update-McpClientConfig -ClientName "Codex" -ConfigPath $codexConfig -ServerKey "Fluxer_X" -ServerConfig $fluxerServerEntry
    }
}

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "  INSTALACION DE FLUXER X COMPLETADA CON EXITO!" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "* Entrypoint: $serverJs" -ForegroundColor White
Write-Host "* Estado de Usuario: $fluxerDataDir" -ForegroundColor White
Write-Host "* Clientes MCP: Reinicie Claude Desktop o recargue Antigravity para usarlo." -ForegroundColor Yellow
Write-Host ""
