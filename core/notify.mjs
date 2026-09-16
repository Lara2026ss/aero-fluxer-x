// ══════════════════════════════════════════════════════════════════════════════
// 🔔 AERON FLUXER X — Windows Native Notification Dispatcher
// Windows 10/11 Native Toast + Forms BalloonTip Fallback
// ══════════════════════════════════════════════════════════════════════════════

import { exec, execSync } from "node:child_process";

const recentNotifications = new Map();

/**
 * Envía una notificación nativa al escritorio de Windows (Toast de Windows 10/11 o Popup de fallback).
 * Incluye protección contra duplicación/ráfagas para evitar múltiples alertas idénticas.
 */
export function sendNativeNotification(title, message, options = {}) {
  const safeTitle = String(title || "FLUXER CORE MCP").replace(/'/g, "''");
  const safeMessage = String(message || "").replace(/'/g, "''");

  const dedupKey = `${safeTitle}:::${safeMessage}`;
  const now = Date.now();
  const lastTime = recentNotifications.get(dedupKey) || 0;
  if (!options.force && now - lastTime < 6000) {
    // Alerta duplicada en ventana de 6 segundos: suprimir silenciosamente
    return true;
  }
  recentNotifications.set(dedupKey, now);
  if (recentNotifications.size > 50) {
    for (const [k, t] of recentNotifications.entries()) {
      if (now - t > 30000) recentNotifications.delete(k);
    }
  }

  const script = `
    $title = '${safeTitle}'
    $text = '${safeMessage}'
    try {
      [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
      $xmlTitle = [System.Security.SecurityElement]::Escape($title)
      $xmlText = [System.Security.SecurityElement]::Escape($text)
      $template = "<toast><visual><binding template='ToastGeneric'><text>$xmlTitle</text><text>$xmlText</text></binding></visual></toast>"
      $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
      $xml.LoadXml($template)
      $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
      $appIds = @('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe', 'Microsoft.Windows.Shell.RunDialog', 'FLUXER CORE MCP')
      $sent = $false
      foreach ($appId in $appIds) {
        try {
          [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
          $sent = $true
          break
        } catch {}
      }
      if (-not $sent) { throw "ToastNotifier fallback required" }
    } catch {
      try {
        $ws = New-Object -ComObject WScript.Shell
        $ws.Popup($text, 4, $title, 64) | Out-Null
      } catch {
        try {
          Add-Type -AssemblyName System.Windows.Forms,System.Drawing -ErrorAction SilentlyContinue
          $n = New-Object System.Windows.Forms.NotifyIcon
          $n.Icon = [System.Drawing.SystemIcons]::Information
          $n.BalloonTipTitle = $title
          $n.BalloonTipText = $text
          $n.Visible = $true
          $n.ShowBalloonTip(4000)
          Start-Sleep -Milliseconds 1500
          $n.Dispose()
        } catch {}
      }
    }
  `;

  const b64 = Buffer.from(script, "utf16le").toString("base64");
  const cmd = `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${b64}`;

  try {
    if (options.sync) {
      execSync(cmd, { stdio: "ignore", timeout: 4000 });
    } else {
      exec(cmd, { stdio: "ignore" }, () => {});
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Muestra una ventana de diálogo nativa de Windows con botones "Sí, Autorizar" y "Declinar".
 * Se ejecuta en segundo plano sin bloquear el hilo principal de Node.js.
 */
export function promptSecurityDialog({
  title = "Fluxer X — Autorización de Seguridad",
  tool = "",
  action = "",
  required = "advanced",
  confirmationCode = "",
  requestId = "",
  clientName = "Agente IA",
} = {}, onDecision = null) {
  const safeTitle = String(title).replace(/'/g, "''");
  const safeTool = String(tool).replace(/'/g, "''");
  const safeAction = String(action).replace(/'/g, "''");
  const safeRequired = String(required).replace(/'/g, "''").toUpperCase();
  const safeCode = String(confirmationCode).replace(/'/g, "''").toUpperCase();
  const safeClient = String(clientName).replace(/'/g, "''");

  const script = `
    Add-Type -AssemblyName System.Windows.Forms,System.Drawing -ErrorAction SilentlyContinue
    $form = New-Object System.Windows.Forms.Form
    $form.Text = '${safeTitle}'
    $form.Size = New-Object System.Drawing.Size(480, 290)
    $form.StartPosition = 'CenterScreen'
    $form.TopMost = $true
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.BackColor = [System.Drawing.Color]::FromArgb(248, 249, 250)

    try {
      $pic = New-Object System.Windows.Forms.PictureBox
      $pic.Location = New-Object System.Drawing.Point(20, 20)
      $pic.Size = New-Object System.Drawing.Size(36, 36)
      $pic.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::StretchImage
      $pic.Image = [System.Drawing.SystemIcons]::Shield.ToBitmap()
      $form.Controls.Add($pic)
    } catch {}

    $lblHeader = New-Object System.Windows.Forms.Label
    $lblHeader.Location = New-Object System.Drawing.Point(68, 18)
    $lblHeader.Size = New-Object System.Drawing.Size(390, 30)
    $lblHeader.Font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
    $lblHeader.ForeColor = [System.Drawing.Color]::FromArgb(33, 37, 41)
    $lblHeader.Text = 'Autorización de Acción Requerida'
    $form.Controls.Add($lblHeader)

    $lblBody = New-Object System.Windows.Forms.Label
    $lblBody.Location = New-Object System.Drawing.Point(68, 52)
    $lblBody.Size = New-Object System.Drawing.Size(390, 115)
    $lblBody.Font = New-Object System.Drawing.Font('Segoe UI', 9)
    $lblBody.ForeColor = [System.Drawing.Color]::FromArgb(73, 80, 87)
    $lblBody.Text = "La IA (${safeClient}) solicita ejecutar:\`r\`n• Acción: ${safeTool}.${safeAction}\`r\`n• Permiso Requerido: ${safeRequired}\`r\`n• Código de Confirmación: [ ${safeCode} ]\`r\`n\`r\`n¿Deseas autorizar la ejecución?"
    $form.Controls.Add($lblBody)

    $btnYes = New-Object System.Windows.Forms.Button
    $btnYes.Location = New-Object System.Drawing.Point(180, 190)
    $btnYes.Size = New-Object System.Drawing.Size(130, 36)
    $btnYes.Text = '✅ Sí, Autorizar'
    $btnYes.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
    $btnYes.BackColor = [System.Drawing.Color]::FromArgb(25, 135, 84)
    $btnYes.ForeColor = [System.Drawing.Color]::White
    $btnYes.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $btnYes.DialogResult = [System.Windows.Forms.DialogResult]::Yes

    $btnNo = New-Object System.Windows.Forms.Button
    $btnNo.Location = New-Object System.Drawing.Point(320, 190)
    $btnNo.Size = New-Object System.Drawing.Size(130, 36)
    $btnNo.Text = '❌ Declinar'
    $btnNo.Font = New-Object System.Drawing.Font('Segoe UI', 9)
    $btnNo.BackColor = [System.Drawing.Color]::FromArgb(220, 53, 69)
    $btnNo.ForeColor = [System.Drawing.Color]::White
    $btnNo.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $btnNo.DialogResult = [System.Windows.Forms.DialogResult]::No

    $form.Controls.Add($btnYes)
    $form.Controls.Add($btnNo)
    $form.AcceptButton = $btnYes
    $form.CancelButton = $btnNo

    try { [System.Media.SystemSounds]::Exclamation.Play() } catch {}

    $res = $form.ShowDialog()
    if ($res -eq [System.Windows.Forms.DialogResult]::Yes) {
      Write-Output "DECISION:APPROVED"
    } else {
      Write-Output "DECISION:DENIED"
    }
  `;

  const b64 = Buffer.from(script, "utf16le").toString("base64");
  const cmd = `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${b64}`;

  try {
    const child = exec(cmd, { windowsHide: false }, (err, stdout) => {
      const out = (stdout || "").trim();
      if (typeof onDecision === "function") {
        if (out.includes("DECISION:APPROVED")) {
          onDecision("approved");
        } else {
          onDecision("denied");
        }
      }
    });
    return child;
  } catch {
    return null;
  }
}

export default { sendNativeNotification, promptSecurityDialog };

