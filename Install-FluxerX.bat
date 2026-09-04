@echo off
setlocal enabledelayedexpansion
title Instalador Fluxer X MCP

echo ======================================================================
echo   🚀 FLUXER X MCP - INSTALADOR ZERO-FRICTION PARA WINDOWS 11
echo ======================================================================
echo.

:: 1. Comprobar existencia de PowerShell en PATH
where powershell.exe >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR CRITICO] No se encontro powershell.exe en su sistema.
    echo Fluxer X requiere Windows PowerShell 5.1 o superior.
    pause
    exit /b 1
)

:: 2. Si Install-FluxerX.ps1 no existe localmente (descarga aislada del .bat), descargarlo automáticamente
if not exist "%~dp0Install-FluxerX.ps1" (
    echo [INFO] Descargando componentes del instalador Fluxer X...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13; try { Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/Lara2026ss/aero-fluxer-x/main/Install-FluxerX.ps1' -OutFile '%~dp0Install-FluxerX.ps1' -UseBasicParsing } catch { exit 1 }"
    if not exist "%~dp0Install-FluxerX.ps1" (
        echo [ERROR] No se pudo descargar Install-FluxerX.ps1. Verifique su conexion a Internet.
        pause
        exit /b 1
    )
    echo [OK] Componentes descargados correctamente.
    echo.
)

:: 3. Ejecutar el instalador PowerShell usando política de proceso aislada
:: (Principio de menor privilegio: RemoteSigned acotado a este proceso, sin alterar directivas globales ni requerir UAC)
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0Install-FluxerX.ps1" %*

set EXIT_CODE=%ERRORLEVEL%
if %EXIT_CODE% NEQ 0 (
    echo.
    echo [AVISO] El instalador finalizo con codigo de salida %EXIT_CODE%.
    pause
)

endlocal
exit /b %EXIT_CODE%
