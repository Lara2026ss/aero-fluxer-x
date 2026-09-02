// ══════════════════════════════════════════════════════════════════════════════
// 🔔 AERON FLUXER X — Windows Native Notification Dispatcher
// Windows 10/11 Native Toast + Forms BalloonTip Fallback
// ══════════════════════════════════════════════════════════════════════════════

import { exec, execSync } from "node:child_process";

export function sendNativeNotification(title, message, options = {}) {
  const safeTitle = String(title || "AERON FLUXER X").replace(/'/g, "''");
  const safeMessage = String(message || "").replace(/'/g, "''");

  // Generar script de PowerShell compatible con Windows 10 y Windows 11
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
      $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
      [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('AERON FLUXER X').Show($toast)
    } catch {
      try {
        Add-Type -AssemblyName System.Windows.Forms,System.Drawing -ErrorAction SilentlyContinue
        $n = New-Object System.Windows.Forms.NotifyIcon
        $n.Icon = [System.Drawing.SystemIcons]::Information
        $n.BalloonTipTitle = $title
        $n.BalloonTipText = $text
        $n.Visible = $true
        $n.ShowBalloonTip(2000)
        Start-Sleep -Milliseconds 400
        $n.Dispose()
      } catch {}
    }
  `;

  const b64 = Buffer.from(script, "utf16le").toString("base64");
  const cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${b64}`;

  try {
    if (options.sync) {
      execSync(cmd, { stdio: "ignore", timeout: 3000 });
    } else {
      exec(cmd, { stdio: "ignore" }, () => {});
    }
    return true;
  } catch {
    return false;
  }
}

export default { sendNativeNotification };
