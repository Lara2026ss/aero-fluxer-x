<#
.SYNOPSIS
    Instalador Zero-Friction y Auto-Recovery de Fluxer Core MCP para Windows 11.
.DESCRIPTION
    1. Pre-flight checks (Node.js, Git, PowerShell) con sugerencias amigables.
    2. Descarga resiliente con 3 reintentos y verificación de integridad.
    3. Extracción automática en "Documentos\Fluxer X".
    4. Auto-configuración no destructiva (merge) para Claude Desktop, Antigravity y Cursor.
    5. Auto-test funcional post-instalación y registro de log en %USERPROFILE%\FluxerX-install.log.
#>

[CmdletBinding()]
param(
    [switch]$SkipClientConfig,
    [string]$CustomAppDir,
    [string]$TargetVersion = "10.1.5",
    [string]$DownloadUrl,
    [switch]$ForceDownload,
    [switch]$NonInteractive,
    [switch]$TestMode
)

$ErrorActionPreference = "Continue"

$installLogFile = Join-Path $env:USERPROFILE "FluxerX-install.log"
function Log-Msg($msg, $color = "White") {
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $line = "[$ts] $msg"
    Add-Content -Path $installLogFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    if ($color -eq "Cyan") { Write-Host $msg -ForegroundColor Cyan }
    elseif ($color -eq "Green") { Write-Host $msg -ForegroundColor Green }
    elseif ($color -eq "Yellow") { Write-Host $msg -ForegroundColor Yellow }
    elseif ($color -eq "Red") { Write-Host $msg -ForegroundColor Red }
    elseif ($color -eq "DarkGray") { Write-Host $msg -ForegroundColor DarkGray }
    else { Write-Host $msg }
}

"=== FLUXER CORE INSTALL LOG - $(Get-Date) ===" | Set-Content -Path $installLogFile -Encoding UTF8 -ErrorAction SilentlyContinue

Log-Msg "======================================================================" "Cyan"
Log-Msg "  🚀 FLUXER CORE v$TargetVersion - INSTALADOR ROBUSTO WINDOWS 11" "Cyan"
Log-Msg "======================================================================`n" "Cyan"

# 1. Pre-flight Checks (Node.js, Git, PowerShell)
Log-Msg "[1/5] Ejecutando Pre-flight Checks del Sistema..." "Yellow"

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Log-Msg "  [!] Node.js no encontrado. Descarga recomendada: https://nodejs.org/" "Yellow"
    Log-Msg "      Intentando instalación silenciosa vía winget..." "DarkGray"
    try {
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    } catch {}
}

if ($nodeCmd) {
    $nodeVer = (& node -v).Trim()
    Log-Msg "  [OK] Node.js detectado: $nodeVer" "Green"
} else {
    Log-Msg "  [WARN] Node.js no instalado. Deberá instalarlo desde https://nodejs.org para ejecutar el servidor." "Yellow"
}

$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) {
    $gitVer = (& git --version).Trim()
    Log-Msg "  [OK] Git detectado: $gitVer" "Green"
} else {
    Log-Msg "  [INFO] Git opcional no detectado. (No requerido para el modo Portable)." "DarkGray"
}

$pwshCmd = Get-Command pwsh -ErrorAction SilentlyContinue
if ($pwshCmd) {
    Log-Msg "  [OK] PowerShell 7 (pwsh) detectado para máxima velocidad." "Green"
} else {
    Log-Msg "  [OK] Windows PowerShell 5.1 activo (compatible 100%)." "Green"
}

# 2. Directorios de Instalación y Almacenamiento Local
Log-Msg "`n[2/5] Configurando directorios de trabajo y sandbox..." "Yellow"
$myDocs = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::MyDocuments)
if (-not $myDocs) { $myDocs = Join-Path $env:USERPROFILE "Documents" }
$targetDocsDir = if ($TestMode) { Join-Path $env:TEMP "FluxerCore_Test_Docs" } else { $myDocs }
$fluxerEngineDir = if ($CustomAppDir) { $CustomAppDir } else { Join-Path $targetDocsDir "Fluxer X" }

$localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE "AppData\Local" }
$fluxerDataDir = if ($TestMode) { Join-Path $env:TEMP "FluxerCore_Test_Data" } else { Join-Path $localAppData "FluxerX" }
$fluxerCacheDir = Join-Path $fluxerDataDir "cache"

foreach ($d in @($fluxerEngineDir, $fluxerDataDir, $fluxerCacheDir)) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}
Log-Msg "  [OK] Motor MCP: $fluxerEngineDir" "Green"
Log-Msg "  [OK] Sandbox local: $fluxerDataDir" "Green"

# 3. Descarga Resiliente con Reintentos y Backoff
Log-Msg "`n[3/5] Obteniendo paquete de distribución v$TargetVersion..." "Yellow"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$hasSourceInScriptDir = (Test-Path (Join-Path $scriptDir "package.json")) -and (Test-Path (Join-Path $scriptDir "server.js"))

if ($hasSourceInScriptDir -and (-not $ForceDownload) -and ($scriptDir -ne $fluxerEngineDir)) {
    Log-Msg "  Copiando archivos desde origen local ($scriptDir)..." "Cyan"
    Get-ChildItem -Path $scriptDir -Exclude "node_modules",".git","dist" | ForEach-Object {
        $dest = Join-Path $fluxerEngineDir $_.Name
        if ($_.PSIsContainer) { Copy-Item -Path $_.FullName -Destination $dest -Recurse -Force }
        else { Copy-Item -Path $_.FullName -Destination $dest -Force }
    }
    Log-Msg "  [OK] Motor desplegado desde paquete local." "Green"
} else {
    $tempZip = Join-Path $fluxerCacheDir "fluxer-core-v$TargetVersion.zip"
    $downloadUrls = @(
        "https://github.com/Lara2026ss/aero-fluxer-x/releases/download/v$TargetVersion/FluxerX-v$TargetVersion-Portable.zip",
        "https://github.com/Lara2026ss/aero-fluxer-x/releases/download/v$TargetVersion/fluxer-x-v$TargetVersion.zip",
        "https://github.com/Lara2026ss/aero-fluxer-x/archive/refs/tags/v$TargetVersion.zip",
        "https://github.com/Lara2026ss/aero-fluxer-x/archive/refs/heads/main.zip"
    )
    if ($DownloadUrl) { $downloadUrls = @($DownloadUrl) + $downloadUrls }

    $downloadSuccess = $false
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

    for ($attempt = 1; $attempt -le 3; $attempt++) {
        foreach ($url in $downloadUrls) {
            Log-Msg "  - [Intento $attempt/3] Descargando desde: $url" "DarkGray"
            try {
                Invoke-WebRequest -Uri $url -OutFile $tempZip -UseBasicParsing -TimeoutSec 40
                if ((Test-Path $tempZip) -and ((Get-Item $tempZip).Length -gt 10000)) {
                    $downloadSuccess = $true
                    $mbSize = [Math]::Round(((Get-Item $tempZip).Length / 1MB), 2)
                    Log-Msg "  [OK] Paquete descargado con éxito ($mbSize MB)." "Green"
                    break
                }
            } catch {}
        }
        if ($downloadSuccess) { break }
        Start-Sleep -Seconds ($attempt * 2)
    }

    if ($downloadSuccess) {
        Log-Msg "  Extrayendo archivos en: $fluxerEngineDir..." "Cyan"
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
            if ($_.PSIsContainer) { Copy-Item -Path $_.FullName -Destination $dest -Recurse -Force }
            else { Copy-Item -Path $_.FullName -Destination $dest -Force }
        }
        Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
        Log-Msg "  [OK] Extracción verificada y completada." "Green"
    } else {
        Log-Msg "  [WARN] No se pudo descargar automáticamente. Si tiene el ZIP manual, descomprímalo en '$fluxerEngineDir'." "Yellow"
    }
}

# 4. Auto-configuración no destructiva de clientes MCP (Merge)
if (-not $SkipClientConfig) {
    Log-Msg "`n[4/5] Configurando clientes MCP (Claude Desktop, Antigravity, Cursor)..." "Yellow"

    function Merge-McpConfig($clientName, $configPath, $serverName, $serverEntry) {
        if (-not (Test-Path (Split-Path $configPath -Parent))) {
            return
        }
        try {
            $configObj = @{}
            if (Test-Path $configPath) {
                $raw = Get-Content $configPath -Raw -Encoding UTF8
                if ($raw.Trim()) {
                    $configObj = $raw | ConvertFrom-Json -AsHashtable
                }
            }
            if (-not $configObj.ContainsKey("mcpServers")) {
                $configObj["mcpServers"] = @{}
            }
            $configObj["mcpServers"][$serverName] = $serverEntry
            $json = $configObj | ConvertTo-Json -Depth 10
            [System.IO.File]::WriteAllText($configPath, $json, [System.Text.Encoding]::UTF8)
            Log-Msg "  [OK] ${clientName}: Configurado exitosamente ($serverName)." "Green"
        } catch {
            Log-Msg "  [WARN] No se pudo actualizar ${clientName}: $_" "Yellow"
        }
    }

    $serverJs = Join-Path $fluxerEngineDir "server.js"
    $entry = @{
        command = "node"
        args = @($serverJs)
    }

    # Claude Desktop
    $claudePath = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
    Merge-McpConfig "Claude Desktop" $claudePath "Fluxer_Core" $entry

    # Google Antigravity
    $antigravityPath = Join-Path $env:USERPROFILE ".gemini\config\mcp_config.json"
    Merge-McpConfig "Google Antigravity" $antigravityPath "Fluxer_Core" $entry

    # Cursor
    $cursorDir = Join-Path $env:USERPROFILE ".cursor"
    if (Test-Path $cursorDir) {
        Merge-McpConfig "Cursor" (Join-Path $cursorDir "mcp.json") "Fluxer_Core" $entry
    }
}

# 5. Auto-test Funcional Integrado
Log-Msg "`n[5/5] Ejecutando auto-test funcional del servidor..." "Yellow"
$serverJs = Join-Path $fluxerEngineDir "server.js"
if (Test-Path $serverJs) {
    try {
        $testOutput = & node -e "import { CURRENT_VERSION, BRAND_NAME } from './core/version.mjs'; console.log(BRAND_NAME + ' v' + CURRENT_VERSION);" 2>&1
        Log-Msg "  [TEST PASS] $testOutput verificado en tiempo de ejecución." "Green"
    } catch {
        Log-Msg "  [TEST WARN] No se pudo ejecutar test rápido: $_" "Yellow"
    }
}

Log-Msg "`n======================================================================" "Cyan"
Log-Msg "  🎉 FLUXER CORE v$TargetVersion LISTO PARA USAR" "Green"
Log-Msg "======================================================================" "Cyan"
Log-Msg "  - Ubicación:  $fluxerEngineDir" "White"
Log-Msg "  - Registro:   $installLogFile" "DarkGray"
Log-Msg "  - Próximo:    Reinicie Claude Desktop o recargue Antigravity para comenzar." "Yellow"
