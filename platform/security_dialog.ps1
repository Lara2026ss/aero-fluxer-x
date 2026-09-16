# ============================================================================
# 🛡️ FLUXER XZ — platform/security_dialog.ps1
# Tarjeta de Notificacion Nativa e Interactiva en Esquina Inferior Derecha
# Estilo Windows Hardware / HP Smart / Action Center (No Intrusiva)
# ============================================================================

param(
  [string]$Title = "Fluxer X - Autorizacion de Seguridad",
  [string]$Tool = "sistema",
  [string]$Action = "ejecutar",
  [string]$Required = "ELEVADO",
  [string]$ConfirmationCode = "",
  [string]$ClientName = "Agente IA",
  [int]$TimeoutSec = 180,
  [string]$ResultFile = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms,System.Drawing -ErrorAction SilentlyContinue

try {
  [System.Windows.Forms.Application]::EnableVisualStyles()
} catch {}

# Subclase con ShowWithoutActivation para no robar el foco del teclado del usuario
$typeDef = @"
using System;
using System.Windows.Forms;
using System.Runtime.InteropServices;
public class SecurityNotificationCard : Form {
    protected override bool ShowWithoutActivation {
        get { return true; }
    }
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
"@
try {
  Add-Type -TypeDefinition $typeDef -ReferencedAssemblies "System.Windows.Forms.dll" -ErrorAction SilentlyContinue
  $form = New-Object SecurityNotificationCard
} catch {
  $form = New-Object System.Windows.Forms.Form
}

[int]$cardW = 440
[int]$cardH = 200
[int]$closeBtnX = $cardW - 32
[int]$bodyW = $cardW - 32

$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$workArea = $screen.WorkingArea
[int]$posX = $workArea.Right - $cardW - 16
[int]$posY = $workArea.Bottom - $cardH - 16

$form.Text = $Title
$form.Size = New-Object System.Drawing.Size($cardW, $cardH)
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.Location = New-Object System.Drawing.Point($posX, $posY)
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(255, 255, 255)

# Panel contenedor con borde gris moderno
$pnlMain = New-Object System.Windows.Forms.Panel
$pnlMain.Dock = [System.Windows.Forms.DockStyle]::Fill
$pnlMain.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
$pnlMain.BackColor = [System.Drawing.Color]::FromArgb(255, 255, 255)
$form.Controls.Add($pnlMain)

# Barra superior de la tarjeta (Gris suave)
$pnlHeader = New-Object System.Windows.Forms.Panel
$pnlHeader.Location = New-Object System.Drawing.Point(0, 0)
$pnlHeader.Size = New-Object System.Drawing.Size($cardW, 36)
$pnlHeader.BackColor = [System.Drawing.Color]::FromArgb(243, 244, 246)
$pnlMain.Controls.Add($pnlHeader)

# Icono de escudo
try {
  $pic = New-Object System.Windows.Forms.PictureBox
  $pic.Location = New-Object System.Drawing.Point(12, 8)
  $pic.Size = New-Object System.Drawing.Size(20, 20)
  $pic.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::StretchImage
  $pic.Image = [System.Drawing.SystemIcons]::Shield.ToBitmap()
  $pnlHeader.Controls.Add($pic)
} catch {}

# Titulo de cabecera
$lblHdr = New-Object System.Windows.Forms.Label
$lblHdr.Location = New-Object System.Drawing.Point(38, 8)
$lblHdr.Size = New-Object System.Drawing.Size(340, 20)
$lblHdr.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$lblHdr.ForeColor = [System.Drawing.Color]::FromArgb(31, 41, 55)
$lblHdr.Text = "FLUXER X • Solicitud de Permiso"
$pnlHeader.Controls.Add($lblHdr)

# Boton cerrar (✕)
$btnClose = New-Object System.Windows.Forms.Label
$btnClose.Location = New-Object System.Drawing.Point($closeBtnX, 6)
$btnClose.Size = New-Object System.Drawing.Size(24, 24)
$btnClose.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$btnClose.ForeColor = [System.Drawing.Color]::FromArgb(156, 163, 175)
$btnClose.Text = "✕"
$btnClose.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnClose.Add_Click({
  $form.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
  $form.Close()
})
$pnlHeader.Controls.Add($btnClose)

# Texto descriptivo
$lblBody = New-Object System.Windows.Forms.Label
$lblBody.Location = New-Object System.Drawing.Point(16, 48)
$lblBody.Size = New-Object System.Drawing.Size($bodyW, 38)
$lblBody.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$lblBody.ForeColor = [System.Drawing.Color]::FromArgb(55, 65, 81)
$lblBody.Text = "La IA (" + $ClientName + ") solicita ejecutar " + $Tool + "." + $Action + "."
$pnlMain.Controls.Add($lblBody)

# Datos de nivel y codigo
$lblMeta = New-Object System.Windows.Forms.Label
$lblMeta.Location = New-Object System.Drawing.Point(16, 90)
$lblMeta.Size = New-Object System.Drawing.Size($bodyW, 26)
$lblMeta.Font = New-Object System.Drawing.Font("Consolas", 9.5, [System.Drawing.FontStyle]::Bold)
$lblMeta.ForeColor = [System.Drawing.Color]::FromArgb(15, 118, 110)
$lblMeta.Text = "Nivel: " + $Required.ToUpper() + "  |  Codigo: [ " + $ConfirmationCode + " ]"
$pnlMain.Controls.Add($lblMeta)

# Boton Autorizar (Verde)
$btnYes = New-Object System.Windows.Forms.Button
$btnYes.Location = New-Object System.Drawing.Point(170, 140)
$btnYes.Size = New-Object System.Drawing.Size(125, 38)
$btnYes.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$btnYes.BackColor = [System.Drawing.Color]::FromArgb(16, 185, 129)
$btnYes.ForeColor = [System.Drawing.Color]::White
$btnYes.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$btnYes.FlatAppearance.BorderSize = 0
$btnYes.Text = "Si, Autorizar"
$btnYes.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnYes.DialogResult = [System.Windows.Forms.DialogResult]::Yes
$pnlMain.Controls.Add($btnYes)

# Boton Declinar (Rojo)
$btnNo = New-Object System.Windows.Forms.Button
$btnNo.Location = New-Object System.Drawing.Point(305, 140)
$btnNo.Size = New-Object System.Drawing.Size(115, 38)
$btnNo.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$btnNo.BackColor = [System.Drawing.Color]::FromArgb(239, 68, 68)
$btnNo.ForeColor = [System.Drawing.Color]::White
$btnNo.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$btnNo.FlatAppearance.BorderSize = 0
$btnNo.Text = "Declinar"
$btnNo.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnNo.DialogResult = [System.Windows.Forms.DialogResult]::No
$pnlMain.Controls.Add($btnNo)

$form.AcceptButton = $btnYes
$form.CancelButton = $btnNo

# Forzar TopMost permanente en la esquina
$form.Add_Shown({
  try {
    $HWND_TOPMOST = [IntPtr](-1)
    [SecurityNotificationCard]::SetWindowPos($form.Handle, $HWND_TOPMOST, 0, 0, 0, 0, 0x0001 -bor 0x0002 -bor 0x0040) | Out-Null
  } catch {}
})

# Temporizador de auto-cierre
if ($TimeoutSec -gt 0) {
  $timer = New-Object System.Windows.Forms.Timer
  $timer.Interval = $TimeoutSec * 1000
  $timer.Add_Tick({
    $timer.Stop()
    $form.DialogResult = [System.Windows.Forms.DialogResult]::Abort
    $form.Close()
  })
  $timer.Start()
}

# Sonido discreto de alerta
try { [System.Media.SystemSounds]::Asterisk.Play() } catch {}

$res = $form.ShowDialog()

$decision = "DENIED"
if ($res -eq [System.Windows.Forms.DialogResult]::Yes) {
  $decision = "APPROVED"
} elseif ($res -eq [System.Windows.Forms.DialogResult]::Abort) {
  $decision = "TIMEOUT"
} else {
  $decision = "DENIED"
}

Write-Output ("DECISION:" + $decision)

if ($ResultFile) {
  try {
    @{
      decision = $decision.ToLower()
      code = $ConfirmationCode
      timestamp = (Get-Date).ToString("o")
    } | ConvertTo-Json | Set-Content -Path $ResultFile -Encoding UTF8
  } catch {}
}

if ($decision -eq "APPROVED") {
  [Environment]::Exit(0)
} elseif ($decision -eq "TIMEOUT") {
  [Environment]::Exit(2)
} else {
  [Environment]::Exit(1)
}
