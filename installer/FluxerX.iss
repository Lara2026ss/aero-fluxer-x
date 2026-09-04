; ══════════════════════════════════════════════════════════════════════════════
; 🚀 FLUXER X MCP — Inno Setup Script (Setup.exe Compiler Spec)
; ══════════════════════════════════════════════════════════════════════════════

#define MyAppName "Fluxer X MCP"
#define MyAppVersion "9.2.0"
#define MyAppPublisher "Fluxer X Team"
#define MyAppURL "https://github.com/Lara2026ss/aero-fluxer-x"
#define MyAppExeName "server.js"

[Setup]
AppId={{D37B4C81-984F-4C82-B4D7-1A8E9B645D02}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\FluxerX\app
DefaultGroupName=Fluxer X
DisableProgramGroupPage=yes
LicenseFile=..\LICENSE
PrivilegesRequired=lowest
OutputBaseFilename=FluxerX-Setup-v{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".git\*,.github\*,node_modules\*,storage\logs\*,dist\*,*.bak*,storage\cache\*"

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy RemoteSigned -Scope Process -File ""{app}\Install-FluxerX.ps1"""; StatusMsg: "Configurando entorno local e integraciones MCP..."; Flags: runhidden
