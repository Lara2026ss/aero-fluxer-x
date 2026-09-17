# ============================================================================
# 🔔 FLUXER XZ — platform/security_notification.ps1
# Notificacion Nativa de Windows Interactiva (Sin Ventana Emergente)
# Clic en la notificacion = AUTORIZAR | Cerrar o quitar (X) = DENEGAR
# ============================================================================

param(
  [string]$Title = "FLUXER XZ - Autorizacion de Seguridad",
  [string]$Tool = "sistema",
  [string]$Action = "ejecutar",
  [string]$Required = "ELEVADO",
  [string]$ConfirmationCode = "",
  [string]$ClientName = "Agente IA",
  [int]$TimeoutSec = 300,
  [string]$ResultFile = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms,System.Drawing -ErrorAction SilentlyContinue

try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
} catch {}

$global:decision = "WAITING"

# 1. Configurar Tray NotifyIcon con BalloonTip y Menu de Contexto
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Shield
$notify.Text = "FLUXER XZ - Clic para AUTORIZAR"
$notify.Visible = $true

$notify.Add_BalloonTipClicked({
  $global:decision = "APPROVED"
  [System.Windows.Forms.Application]::ExitThread()
})

$notify.Add_Click({
  $global:decision = "APPROVED"
  [System.Windows.Forms.Application]::ExitThread()
})

$notify.Add_DoubleClick({
  $global:decision = "APPROVED"
  [System.Windows.Forms.Application]::ExitThread()
})

$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip
$itemApprove = $contextMenu.Items.Add("Autorizar acceso (Aprobar)")
$itemApprove.Add_Click({
  $global:decision = "APPROVED"
  [System.Windows.Forms.Application]::ExitThread()
})
$itemDeny = $contextMenu.Items.Add("Denegar acceso (Rechazar)")
$itemDeny.Add_Click({
  $global:decision = "DENIED"
  [System.Windows.Forms.Application]::ExitThread()
})
$notify.ContextMenuStrip = $contextMenu

$fullTitle = if ($ConfirmationCode) { "$Title [$ConfirmationCode]" } else { $Title }
$bodyMsg = "La IA ($ClientName) solicita $Tool.$Action ($Required).`nHaz clic aqui para AUTORIZAR, o cierra para DENEGAR."

$notify.BalloonTipTitle = $fullTitle
$notify.BalloonTipText = $bodyMsg
$notify.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info

# 2. Configurar Toast Nativo de Windows 10/11 en paralelo
try {
  $xmlTemplate = @"
<toast duration="long">
  <visual>
    <binding template="ToastGeneric">
      <text>$([System.Security.SecurityElement]::Escape($fullTitle))</text>
      <text>$([System.Security.SecurityElement]::Escape("La IA ($ClientName) solicita ejecutar $Tool.$Action (Nivel: $Required)"))</text>
      <text>$([System.Security.SecurityElement]::Escape("Haz clic en esta notificacion para AUTORIZAR | Cierra para DENEGAR"))</text>
      <text placement="attribution">FLUXER XZ Security</text>
    </binding>
  </visual>
  <actions>
    <action content="Autorizar" arguments="approved" activationType="foreground"/>
    <action content="Denegar" arguments="denied" activationType="foreground"/>
  </actions>
</toast>
"@
  $xmlDoc = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xmlDoc.LoadXml($xmlTemplate)
  $toast = New-Object Windows.UI.Notifications.ToastNotification $xmlDoc

  $toast.add_Activated({
    param($s, $e)
    $arg = ""
    try { $arg = $e.Arguments } catch {}
    if ($arg -eq "denied") {
      $global:decision = "DENIED"
    } else {
      $global:decision = "APPROVED"
    }
    [System.Windows.Forms.Application]::ExitThread()
  }) | Out-Null

  $toast.add_Dismissed({
    param($s, $e)
    try {
      if ($e.Reason.ToString() -eq "UserCanceled") {
        if ($global:decision -eq "WAITING") {
          $global:decision = "DENIED"
          [System.Windows.Forms.Application]::ExitThread()
        }
      }
    } catch {}
  }) | Out-Null

  $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}WindowsPowerShell 1.0powershell.exe'
  $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId)
  $notifier.Show($toast)
} catch {}

# Mostrar BalloonTip
$notify.ShowBalloonTip($TimeoutSec * 1000)

try { [System.Media.SystemSounds]::Exclamation.Play() } catch {}

Write-Output "NOTIFICATION_ACTIVE:WAITING_USER"

# Bucle de eventos de Windows Forms con temporizador de expiracion
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 250
$start = [DateTime]::UtcNow
$timer.Add_Tick({
  $elapsed = ([DateTime]::UtcNow - $start).TotalSeconds
  if ($global:decision -ne "WAITING" -or $elapsed -ge $TimeoutSec) {
    $timer.Stop()
    [System.Windows.Forms.Application]::ExitThread()
  }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()

$notify.Visible = $false
$notify.Dispose()

if ($global:decision -eq "WAITING") {
  $global:decision = "TIMEOUT"
}

Write-Output ("DECISION:" + $global:decision)

if ($ResultFile) {
  try {
    @{
      decision = $global:decision.ToLower()
      code = $ConfirmationCode
      timestamp = (Get-Date).ToString("o")
    } | ConvertTo-Json | Set-Content -Path $ResultFile -Encoding UTF8
  } catch {}
}

if ($global:decision -eq "APPROVED") {
  [Environment]::Exit(0)
} elseif ($global:decision -eq "TIMEOUT") {
  [Environment]::Exit(2)
} else {
  [Environment]::Exit(1)
}
