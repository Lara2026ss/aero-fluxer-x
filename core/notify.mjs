// ══════════════════════════════════════════════════════════════════════════════
// 🔔 AERON FLUXER X — Windows Native Notification Dispatcher
// Windows 10/11 Native Toast + Forms BalloonTip Fallback
// ══════════════════════════════════════════════════════════════════════════════

import { exec, execSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SECURITY_NOTIFICATION_SCRIPT = path.resolve(__dirname, "../platform/security_notification.ps1");

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

  const isSilent = Boolean(options.silent);
  const allowModal = !options.noModal && !options.connectionEvent && !options.subtle;
  const audioTag = isSilent ? "<audio silent='true'/>" : "";

  const script = `
    $title = '${safeTitle}'
    $text = '${safeMessage}'
    try {
      [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
      $xmlTitle = [System.Security.SecurityElement]::Escape($title)
      $xmlText = [System.Security.SecurityElement]::Escape($text)
      $template = "<toast><visual><binding template='ToastGeneric'><text>$xmlTitle</text><text>$xmlText</text></binding></visual>${audioTag}</toast>"
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
      ${allowModal ? `try {
        $ws = New-Object -ComObject WScript.Shell
        $ws.Popup($text, 4, $title, 64) | Out-Null
      } catch {` : ``}
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
      ${allowModal ? `}` : ``}
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
 * Muestra una ventana de diálogo emergente nativa de Windows con botones "Sí, Autorizar" y "Declinar".
 * Se ejecuta en segundo plano con STA sin bloquear el hilo principal de Node.js.
 */
export function promptSecurityDialog({
  title = "FLUXER XZ — Autorización de Seguridad",
  tool = "",
  action = "",
  required = "advanced",
  confirmationCode = "",
  requestId = "",
  clientName = "Agente IA",
  timeoutSec = 300,
} = {}, onDecision = null) {
  const args = [
    "-NoProfile",
    "-STA",
    "-ExecutionPolicy", "Bypass",
    "-File", SECURITY_NOTIFICATION_SCRIPT,
    "-Title", String(title),
    "-Tool", String(tool),
    "-Action", String(action),
    "-Required", String(required).toUpperCase(),
    "-ConfirmationCode", String(confirmationCode).toUpperCase(),
    "-ClientName", String(clientName),
    "-TimeoutSec", String(timeoutSec),
  ];

  try {
    const child = spawn("powershell.exe", args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });

    child.on("close", (code) => {
      const out = stdout.trim();
      if (typeof onDecision === "function") {
        if (out.includes("DECISION:APPROVED") || code === 0) {
          onDecision("approved");
        } else if (out.includes("DECISION:TIMEOUT") || code === 2) {
          onDecision("timeout");
        } else if (out.includes("DECISION:DENIED") || code === 1) {
          onDecision("denied");
        } else {
          onDecision("timeout");
        }
      }
    });

    return child;
  } catch {
    return null;
  }
}

export default { sendNativeNotification, promptSecurityDialog };

