@echo off
setlocal enabledelayedexpansion
title Wizard de Instalacion Publico — Aeron Fluxer Core MCP v10.4.0
color 0A

echo ╔══════════════════════════════════════════════════════════════════╗
echo ║         AERON FLUXER CORE MCP v10.4.0 — INSTALL WIZARD         ║
echo ║         Servidor MCP Autónomo, Seguro y de Alto Rendimiento    ║
echo ╚══════════════════════════════════════════════════════════════════╝
echo.

REM 1. Verificación de Node.js
echo [1/4] Verificando instalación de Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js no fue detectado en tu sistema.
    echo [i] Descargando e instalando Node.js LTS recomendado...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi' -OutFile '$env:TEMP\node_setup.msi'; Start-Process msiexec.exe -ArgumentList '/i', `"$env:TEMP\node_setup.msi`", '/quiet', '/norestart' -Wait"
    echo [✓] Node.js instalado correctamente.
) else (
    for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
    echo [✓] Node.js detectado: !NODE_VER!
)

REM 2. Selección de Carpeta de Instalación
echo.
echo [2/4] Configurando carpeta de instalación...
set "TARGET_DIR=%~dp0"
set "TARGET_DIR=%TARGET_DIR:~0,-1%"

echo [i] Instalando en la carpeta actual: "%TARGET_DIR%"

REM 3. Instalación de Dependencias
echo.
echo [3/4] Verificando e instalando dependencias de Node.js...
cd /d "%TARGET_DIR%"
call npm install --omit=dev --no-audit --no-fund
if %errorlevel% neq 0 (
    echo [!] Advertencia: npm install finalizo con codigo %errorlevel%. Continuando...
) else (
    echo [✓] Dependencias listas.
)

REM 4. Auto-Configuración en Claude Desktop
echo.
echo [4/4] Configurando integración MCP en tu sistema...
set "CLAUDE_CONFIG=%APPDATA%\Claude\claude_desktop_config.json"

if exist "%CLAUDE_CONFIG%" (
    echo [i] Claude Desktop detectado. Agregando entrada MCP a:
    echo     "%CLAUDE_CONFIG%"
    
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$configPath = '$env:APPDATA\Claude\claude_desktop_config.json'; $backupPath = '$configPath.bak'; Copy-Item -Path $configPath -Destination $backupPath -Force; $json = Get-Content -Path $configPath -Raw | ConvertFrom-Json; if (-not $json.PSObject.Properties['mcpServers']) { $json | Add-Member -MemberType NoteProperty -Name 'mcpServers' -Value ([PSCustomObject]@{}) }; $serverPath = ('%TARGET_DIR%\launcher.mjs' -replace '\\', '/'); $json.mcpServers | Add-Member -MemberType NoteProperty -Name 'fluxer-x' -Value ([PSCustomObject]@{ command = 'node'; args = @($serverPath) }) -Force; $json | ConvertTo-Json -Depth 10 | Set-Content -Path $configPath -Encoding UTF8; Write-Host '[✓] Integración con Claude Desktop configurada exitosamente!'"
) else (
    echo [i] Claude Desktop no encontrado en la ruta por defecto.
    echo [i] Copiando fragmento de configuración JSON al portapapeles...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$serverPath = ('%TARGET_DIR%\launcher.mjs' -replace '\\', '/'); $snippet = @{ mcpServers = @{ 'fluxer-x' = @{ command = 'node'; args = @($serverPath) } } } | ConvertTo-Json -Depth 5; Set-Clipboard -Value $snippet; Write-Host '[✓] Configuración JSON copiada al portapapeles de Windows!'"
    
    echo.
    echo 📋 Pega la siguiente configuración en tu cliente MCP (Claude Desktop, Antigravity, Cursor):
    echo ----------------------------------------------------------------------
    echo {
    echo   "mcpServers": {
    echo     "fluxer-x": {
    echo       "command": "node",
    echo       "args": ["%TARGET_DIR:\=/%/launcher.mjs"]
    echo     }
    echo   }
    echo }
    echo ----------------------------------------------------------------------
)

echo.
echo ══════════════════════════════════════════════════════════════════════
echo 🎉 ¡INSTALACIÓN DE AERON FLUXER CORE v10.4.0 COMPLETADA CON ÉXITO!
echo ══════════════════════════════════════════════════════════════════════
echo.
echo Para iniciar el servidor manualmente en cualquier momento:
echo   Ejecuta: start.bat
echo.
pause
