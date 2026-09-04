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

:: 2. Ejecutar el instalador PowerShell usando política de proceso aislada
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
