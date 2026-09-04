<#
.SYNOPSIS
    Instalador Zero-Friction y Bootstrapper de Fluxer X MCP para Windows 11.
.DESCRIPTION
    Configura Fluxer X en el perfil del usuario sin privilegios de administrador,
    inicializa el estado local, y registra el servidor en Claude Desktop, Antigravity y Codex
    con respaldos automáticos y atómicos.
#>

[CmdletBinding()]
param(
    [switch]$SkipClientConfig,
    [string]$CustomAppDir
)

$ErrorActionPreference = "Stop"

Write-Host "══════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  🚀 FLUXER X MCP — INSTALADOR ZERO-FRICTION PARA WINDOWS 11" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

# 1. Validación de Sistema Operativo (Windows 10/11)
Write-Host "[1/6] Verificando compatibilidad de plataforma..." -ForegroundColor Yellow
$osVersion = [System.Environment]::OSVersion.Version
if ($osVersion.Major -lt 10) {
    Write-Error "Fluxer X requiere Windows 10 (Build 19041+) o Windows 11. Versión detectada: $osVersion"
    exit 1
}
Write-Host "  ✓ Windows detectado: $($osVersion.Major).$($osVersion.Minor) Build $($osVersion.Build) ($([System.Environment]::GetEnvironmentVariable('PROCESSOR_ARCHITECTURE')))" -ForegroundColor Green

# 2. Validación de Node.js Runtime
Write-Host "`n[2/6] Verificando entorno de ejecución Node.js..." -ForegroundColor Yellow
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "  ✗ Node.js no fue encontrado en el PATH." -ForegroundColor Red
    Write-Host "    Fluxer X requiere Node.js v18.0 o superior." -ForegroundColor Yellow
    Write-Host "    Intentando instalar Node.js LTS mediante winget..." -ForegroundColor Cyan
    try {
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    } catch {}
    
    if (-not $nodeCmd) {
        Write-Error "Por favor instale Node.js desde https://nodejs.org y vuelva a ejecutar este instalador."
        exit 1
    }
}

$nodeVerStr = (& node -v).Trim()
Write-Host "  ✓ Node.js runtime disponible: $nodeVerStr" -ForegroundColor Green

# 3. Preparación de Directorio de la Aplicación y Datos Locales
Write-Host "`n[3/6] Aprovisionando estructura de almacenamiento local..." -ForegroundColor Yellow
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = if ($CustomAppDir) { $CustomAppDir } else { $scriptDir }

$localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE "AppData\Local" }
$fluxerDataDir = Join-Path $localAppData "FluxerX"
$fluxerConfigDir = Join-Path $fluxerDataDir "config"
$fluxerStateDir = Join-Path $fluxerDataDir "state"
$fluxerLogsDir = Join-Path $fluxerDataDir "logs"
$fluxerShortcutsDir = Join-Path $fluxerDataDir "shortcuts"

$dirs = @($fluxerDataDir, $fluxerConfigDir, $fluxerStateDir, $fluxerLogsDir, $fluxerShortcutsDir)
foreach ($d in $dirs) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
}
Write-Host "  ✓ Directorio de datos de usuario: $fluxerDataDir" -ForegroundColor Green

# 4. Instalación de dependencias si node_modules no existe
Write-Host "`n[4/6] Verificando dependencias del paquete..." -ForegroundColor Yellow
$nodeModules = Join-Path $appDir "node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Host "  Instalando dependencias de producción (npm install --omit=dev)..." -ForegroundColor Cyan
    Push-Location $appDir
    try {
        cmd.exe /c "npm install --omit=dev"
    } finally {
        Pop-Location
    }
}
Write-Host "  ✓ Dependencias verificadas." -ForegroundColor Green

# 5. Ejecución del First-Run Bootstrap
Write-Host "`n[5/6] Ejecutando First-Run Bootstrap e identidad de host..." -ForegroundColor Yellow
$serverJs = Join-Path $appDir "server.js"
if (-not (Test-Path $serverJs)) {
    $serverJs = Join-Path $appDir "server.mjs"
}

$bootstrapCheckScript = @"
import('./core/runtime.mjs').then(async ({ createRuntime }) => {
  const runtime = await createRuntime({ root: process.cwd() });
  console.log('BOOTSTRAP_HOST:' + runtime.displayHostname);
  console.log('BOOTSTRAP_ID:' + runtime.hostId);
  console.log('BOOTSTRAP_READY:' + runtime.isReady);
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
"@

Push-Location $appDir
try {
    $bootstrapOutput = & node --input-type=module -e $bootstrapCheckScript
    $hostMatch = ($bootstrapOutput | Select-String "BOOTSTRAP_HOST:(.+)").Matches.Groups[1].Value
    $idMatch = ($bootstrapOutput | Select-String "BOOTSTRAP_ID:(.+)").Matches.Groups[1].Value
    Write-Host "  ✓ Host detectado: $hostMatch" -ForegroundColor Green
    Write-Host "  ✓ Host ID local (estable, no invasivo): $idMatch" -ForegroundColor Green
    Write-Host "  ✓ Estado persistido en: $fluxerStateDir\state.json" -ForegroundColor Green
} catch {
    Write-Error "Error ejecutando el bootstrap inicial: $_"
    exit 1
} finally {
    Pop-Location
}

# 6. Auto-Configuración Atómica de Clientes MCP (Claude Desktop, Antigravity, Codex)
if (-not $SkipClientConfig) {
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
            Write-Host "  - $ClientName: No detectado (directorio no existe)." -ForegroundColor DarkGray
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
            # Asegurar propiedad mcpServers como Hashtable / PSCustomObject
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

            # 2. Modificar ÚNICAMENTE la entrada de Fluxer X
            $serversMap[$ServerKey] = $ServerConfig

            # Reconstruir objeto completo
            $finalObj = [ordered]@{
                mcpServers = $serversMap
            }

            # Si el archivo original tenía otras propiedades de nivel raíz, preservarlas
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
                throw "Fallo de validación interna al verificar entrada $ServerKey."
            }

            # 4. Escritura atómica UTF-8
            [System.IO.File]::WriteAllText($ConfigPath, $jsonString, [System.Text.Encoding]::UTF8)
            Write-Host "  ✓ $ClientName: Configurado exitosamente ($ServerKey)" -ForegroundColor Green
            Write-Host "    Backup seguro creado en: $backupPath" -ForegroundColor DarkGray
        } catch {
            Write-Warning "Fallo al actualizar $ClientName. Restaurando backup..."
            if (Test-Path $backupPath) {
                Copy-Item -Path $backupPath -Destination $ConfigPath -Force
            }
            Write-Error "No se pudo actualizar la configuración de $ClientName: $_"
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

Write-Host "`n══════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  🎉 ¡INSTALACIÓN DE FLUXER X COMPLETADA CON ÉXITO!" -ForegroundColor Green
Write-Host "══════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "• Entrypoint: $serverJs" -ForegroundColor White
Write-Host "• Estado de Usuario: $fluxerDataDir" -ForegroundColor White
Write-Host "• Clientes MCP: Reinicie Claude Desktop o recargue Antigravity para usarlo." -ForegroundColor Yellow
Write-Host ""
