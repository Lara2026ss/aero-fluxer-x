@echo off
setlocal enabledelayedexpansion
title Instalador Fluxer Core MCP

echo ======================================================================
echo   🚀 FLUXER CORE MCP - INSTALADOR ROBUSTO PARA WINDOWS 11
echo ======================================================================
echo.

:: 1. Comprobar existencia de PowerShell (preferir pwsh.exe si existe, sino powershell.exe)
set PS_BIN=powershell.exe
where pwsh.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PS_BIN=pwsh.exe
) else (
    where powershell.exe >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR CRITICO] No se encontro PowerShell en su sistema.
        echo Fluxer Core requiere Windows PowerShell 5.1 o PowerShell 7+.
        pause
        exit /b 1
    )
)

:: 2. Si Install-FluxerX.ps1 no existe localmente, descargarlo de GitHub
if not exist "%~dp0Install-FluxerX.ps1" (
    echo [INFO] Descargando componentes del instalador Fluxer Core...
    %PS_BIN% -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13; try { Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/Lara2026ss/aero-fluxer-x/main/Install-FluxerX.ps1' -OutFile '%~dp0Install-FluxerX.ps1' -UseBasicParsing } catch { exit 1 }"
    if not exist "%~dp0Install-FluxerX.ps1" (
        echo [ERROR] No se pudo descargar Install-FluxerX.ps1. Verifique su conexion a Internet.
        pause
        exit /b 1
    )
    echo [OK] Componentes descargados correctamente.
    echo.
)

:: 3. Desbloquear archivo si fue descargado de Internet y ejecutar con política aislada segura
%PS_BIN% -NoProfile -Command "if (Test-Path '%~dp0Install-FluxerX.ps1') { Unblock-File -Path '%~dp0Install-FluxerX.ps1' -ErrorAction SilentlyContinue }"
%PS_BIN% -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-FluxerX.ps1" %*

set EXIT_CODE=%ERRORLEVEL%
if %EXIT_CODE% NEQ 0 (
    echo.
    echo [AVISO] El instalador finalizo con codigo de salida %EXIT_CODE%.
    pause
)

endlocal
exit /b %EXIT_CODE%
