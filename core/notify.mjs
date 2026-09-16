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
      $appIds = @('AERON FLUXER X', '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe', 'Microsoft.Windows.Shell.RunDialog')
      $sent = $false
      foreach ($appId in $appIds) {
        try {
          [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
          $sent = $true
          break
        } catch {}
      }
      if (-not $sent) { throw "ToastNotifier failed for all AUMIDs" }
    } catch {
      try {
        Add-Type -AssemblyName System.Windows.Forms,System.Drawing -ErrorAction SilentlyContinue
        $n = New-Object System.Windows.Forms.NotifyIcon
        $n.Icon = [System.Drawing.SystemIcons]::Information
        $n.BalloonTipTitle = $title
        $n.BalloonTipText = $text
        $n.Visible = $true
        $n.ShowBalloonTip(3000)
        Start-Sleep -Milliseconds 1000
        $n.Dispose()
      } catch {}
    }
  `;

  const b64 = Buffer.from(script, "utf16le").toString("base64");
  const cmd = `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${b64}`;

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
