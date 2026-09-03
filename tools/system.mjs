/**
 * FLUXER — tools/system.mjs
 * Dominio: diagnóstico de hardware, entorno, clipboard, servicios, red, energía y actualizaciones.
 */
import { CURRENT_VERSION } from "../core/version.mjs";

const SYSTEM_CRITICAL_PROCESSES = new Set([
  "csrss", "lsass", "services", "smss", "wininit", "dwm", "explorer", "svchost",
  "system", "idle", "registry", "fontdrvhost", "winlogon", "spoolsv", "sihost",
  "taskhostw", "searchhost", "startmenuexperiencehost", "shellexperiencehost"
]);

function categorizeProcess(name) {
  const lower = (name || "").toLowerCase();
  if (SYSTEM_CRITICAL_PROCESSES.has(lower)) return { category: "system_critical", safeToClose: false };

  const games = ["steam", "epicgameslauncher", "valorant", "leagueclient", "genshinimpact", "roblox", "robloxplayerbeta", "minecraft", "unity", "unreal", "r5apex", "fortnite", "overwatch", "riotclientux"];
  if (games.some(g => lower.includes(g))) return { category: "games", safeToClose: true };

  const browsers = ["chrome", "msedge", "brave", "firefox", "opera", "vivaldi", "arc"];
  if (browsers.some(b => lower.includes(b))) return { category: "browsers", safeToClose: true };

  const ideDev = ["code", "cursor", "antigravity", "node", "python", "git", "powershell", "cmd", "wt", "conhost"];
  if (ideDev.some(d => lower.includes(d))) return { category: "ide_dev", safeToClose: false };

  const bgApps = ["discord", "spotify", "onedrive", "dropbox", "slack", "teams", "telegram", "whatsapp", "armourycreate", "asussoftware"];
  if (bgApps.some(a => lower.includes(a))) return { category: "background_apps", safeToClose: true };

  return { category: "other", safeToClose: true };
}

export function createSystemDomain({ runtime, os, dns, net, domain, httpFetchText, sendNativeNotification }) {
  return domain(
    "system",
    "Diagnóstico de hardware, clipboard, variables de entorno, red, servicios y control de energía.",
    {
      // ── Hardware / OS ────────────────────────────────────────────────────────
      get_cpu_info: async () => {
        const cpus = os.cpus();
        const logicalCount = cpus.length;
        const physicalCount = logicalCount > 1 ? Math.floor(logicalCount / 2) : 1;
        return {
          ok: true,
          arch: process.arch,
          model: cpus[0]?.model || "Generic CPU",
          cores: physicalCount,
          physicalCores: physicalCount,
          logicalProcessors: logicalCount,
          speedMHz: cpus[0]?.speed || 0,
          loadavg: os.loadavg(),
        };
      },

      get_system_snapshot: async () => {
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const nets = os.networkInterfaces();
        const ips = [];
        for (const name of Object.keys(nets)) {
          for (const net of nets[name] || []) {
            if (net.family === "IPv4" && !net.internal) ips.push(net.address);
          }
        }
        return {
          ok: true,
          platform: process.platform,
          osRelease: os.release(),
          hostname: os.hostname(),
          uptimeSeconds: Math.round(os.uptime()),
          cpuModel: cpus[0]?.model || "Generic CPU",
          cores: cpus.length,
          memory: {
            totalGB: Number((totalMem / 1024 ** 3).toFixed(2)),
            usedGB: Number((usedMem / 1024 ** 3).toFixed(2)),
            freeGB: Number((freeMem / 1024 ** 3).toFixed(2)),
            usagePercent: Number(((usedMem / totalMem) * 100).toFixed(1)),
          },
          localIps: ips,
          nodeVersion: process.version,
        };
      },

      get_gpu_info: async () => {
        try {
          const cmd = "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion | Format-List";
          const res = await runtime.run(cmd);
          return { ok: res.ok || Boolean(res.stdout), output: res.stdout || res.stderr };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      get_ram_info: async () => {
        try {
          const total = os.totalmem();
          const free = os.freemem();
          const used = total - free;
          return {
            ok: true,
            totalBytes: total,
            freeBytes: free,
            usedBytes: used,
            totalGB: Number((total / 1024 ** 3).toFixed(2)),
            usedGB: Number((used / 1024 ** 3).toFixed(2)),
            freeGB: Number((free / 1024 ** 3).toFixed(2)),
            processMemory: process.memoryUsage(),
          };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      get_storage_info: async () => {
        try {
          const cmd = "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | Format-Table";
          const res = await runtime.run(cmd);
          return { ok: res.ok || Boolean(res.stdout), storage: res.stdout || res.stderr };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      get_battery_info: async () => {
        try {
          const cmd = "Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object EstimatedChargeRemaining,BatteryStatus | Format-List";
          const res = await runtime.run(cmd);
          return { ok: res.ok || Boolean(res.stdout), battery: res.stdout || res.stderr };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      get_temperature: async () => {
        try {
          const cmd = "Get-CimInstance MSAcpi_ThermalZoneTemperature -Namespace root/wmi -ErrorAction SilentlyContinue | Select-Object CurrentTemperature | Format-List";
          const res = await runtime.run(cmd);
          const hasSensors = Boolean(res.stdout && res.stdout.trim());
          return {
            ok: true,
            sensors: hasSensors ? res.stdout.trim() : "No se detectaron sensores térmicos WMI/ACPI compatibles en este equipo.",
            available: hasSensors
          };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      get_system_info: async () => ({
        ok: true,
        platform: "win32",
        isWindowsOnly: true,
        arch: process.arch,
        release: os.release(),
        hostname: os.hostname(),
        nodeVersion: process.version,
      }),

      get_kernel_info: async () => {
        try {
          const cmd = "[System.Environment]::OSVersion | Format-List";
          const res = await runtime.run(cmd);
          return { ok: res.ok || Boolean(res.stdout), kernel: res.stdout || res.stderr };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      get_hardware_info: async () => {
        try {
          const cmd = "Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model,TotalPhysicalMemory,SystemType | Format-List";
          const res = await runtime.run(cmd);
          return { ok: res.ok || Boolean(res.stdout), info: res.stdout || res.stderr };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      get_processes: async ({ limit = 30 } = {}) => {
        try {
          const n = Math.min(Number(limit) || 30, 100);
          const cmd = `Get-Process | Sort-Object CPU -Descending | Select-Object -First ${n} Id,ProcessName,CPU,WorkingSet | Format-Table`;
          const res = await runtime.run(cmd);
          return { ok: res.ok || Boolean(res.stdout), output: res.stdout || res.stderr };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      get_resource_usage: async () => ({
        ok: true,
        memory: process.memoryUsage(),
        uptime: process.uptime(),
      }),

      get_system_load: async () => {
        try {
          const cmd = "Get-CimInstance Win32_Processor | Select-Object LoadPercentage | Format-List";
          const res = await runtime.run(cmd);
          return { ok: res.ok || Boolean(res.stdout), load: res.stdout || res.stderr, loadavg: os.loadavg() };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      get_performance_stats: async () => {
        try {
          const cmd = "Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter \"Name='_Total'\" -ErrorAction SilentlyContinue | Select-Object PercentProcessorTime | Format-List";
          const res = await runtime.run(cmd);
          return { ok: res.ok || Boolean(res.stdout), stats: res.stdout || res.stderr };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      get_sensors: async () => {
        try {
          const cmd = "Get-CimInstance Win32_TemperatureProbe -ErrorAction SilentlyContinue | Format-List; Get-CimInstance Win32_Fan -ErrorAction SilentlyContinue | Format-List";
          const res = await runtime.run(cmd);
          return { ok: res.ok || Boolean(res.stdout), output: res.stdout || res.stderr };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      // ── Clipboard ───────────────────────────────────────────────────────────
      get_clipboard: async () => {
        const cmd = "Get-Clipboard";
        const res = await runtime.run(cmd);
        return { ok: true, text: res.stdout || "" };
      },

      set_clipboard: async ({ text = "" } = {}) => {
        const cmd = `Set-Clipboard -Value ${runtime.shellQuote(text)}`;
        await runtime.run(cmd);
        return { ok: true, copiedBytes: Buffer.byteLength(text, "utf8") };
      },

      // ── Variables de entorno ─────────────────────────────────────────────────
      get_env: async ({ name } = {}) => {
        if (!name) return { ok: false, error: "El parámetro 'name' es requerido." };
        const value = process.env[name] || runtime.env?.[name];
        if (value === undefined) return { ok: true, name, value: null, exists: false };
        const isSecret = /key|secret|token|password|passwd|auth|credential|api_?key/i.test(name);
        if (isSecret) return { ok: true, name, value: "[CONFIGURED]", exists: true, masked: true, length: value.length };
        return { ok: true, name, value, exists: true, masked: false };
      },

      set_env: async ({ name, value = "" } = {}) => {
        if (!name) return { ok: false, error: "El parámetro 'name' es requerido." };
        process.env[name] = String(value);
        if (runtime.env) runtime.env[name] = String(value);
        return { ok: true, name, value: String(value) };
      },

      list_env: async ({ filter } = {}) => {
        const entries = {};
        const q = filter ? filter.toLowerCase() : null;
        for (const [k, v] of Object.entries(process.env)) {
          if (!q || k.toLowerCase().includes(q)) {
            const isSecret = /key|secret|token|password|passwd|auth|credential|api_?key/i.test(k);
            entries[k] = isSecret ? "[CONFIGURED]" : v;
          }
        }
        return { ok: true, count: Object.keys(entries).length, env: entries };
      },

      // ── Red ─────────────────────────────────────────────────────────────────
      ping: async ({ host = "8.8.8.8", count = 3 } = {}) => {
        const n = Math.min(Number(count) || 3, 10);
        const cmd = `ping -n ${n} ${runtime.shellQuote(host)}`;
        const res = await runtime.run(cmd);
        return { ok: res.ok, host, output: res.stdout };
      },

      dns_lookup: async ({ domain: domainName, rrtype = "A" } = {}) => {
        if (!domainName) return { ok: false, error: "El parámetro 'domain' es requerido." };
        try {
          const records = await dns.resolve(domainName, rrtype.toUpperCase());
          return { ok: true, domain: domainName, rrtype, records };
        } catch (e) {
          return { ok: false, domain: domainName, error: e.message };
        }
      },

      test_port: async ({ host, port, timeoutMs = 3000 } = {}) => {
        if (!host || !port) return { ok: false, error: "Los parámetros 'host' y 'port' son requeridos." };
        return new Promise((resolve) => {
          const socket = new net.Socket();
          socket.setTimeout(Number(timeoutMs) || 3000);
          socket.on("connect", () => { socket.destroy(); resolve({ ok: true, host, port: Number(port), open: true }); });
          socket.on("timeout", () => { socket.destroy(); resolve({ ok: false, host, port: Number(port), open: false, error: "Timeout." }); });
          socket.on("error", (err) => { socket.destroy(); resolve({ ok: false, host, port: Number(port), open: false, error: err.message }); });
          socket.connect(Number(port), host);
        });
      },

      get_public_ip: async () => {
        const httpRes = await httpFetchText("https://api.ipify.org");
        return { ok: true, ip: httpRes.ok ? httpRes.text.trim() : "Desconocida" };
      },

      get_local_ip: async () => {
        const nets = os.networkInterfaces();
        const ips = [];
        for (const name of Object.keys(nets)) {
          for (const n of nets[name] || []) {
            if (n.family === "IPv4" && !n.internal) ips.push(n.address);
          }
        }
        return { ok: true, ip: ips.join(", ") || "127.0.0.1" };
      },

      get_open_ports: async () => {
        const cmd = "Get-NetTCPConnection -State Listen | Select-Object LocalPort,OwningProcess | Sort-Object LocalPort | Format-Table";
        return { ok: true, ports: (await runtime.run(cmd)).stdout };
      },

      // ── Servicios ───────────────────────────────────────────────────────────
      manage_services: async ({ service = "", action = "status" } = {}) => {
        const winActions = { status: "Get-Service", start: "Start-Service", stop: "Stop-Service", restart: "Restart-Service" };
        let cmd = "";
        if (!service || action === "list") {
          cmd = "Get-Service | Select-Object -First 30 Name,Status,DisplayName | Format-Table";
        } else {
          cmd = `${winActions[action] || "Get-Service"} -Name ${runtime.shellQuote(service)} | Format-List`;
        }
        return { ok: true, output: (await runtime.run(cmd)).stdout };
      },

      manage_startup: async () => {
        const cmd = "Get-CimInstance Win32_StartupCommand | Select-Object Name,Command,Location | Format-Table";
        return { ok: true, output: (await runtime.run(cmd)).stdout };
      },

      // ── Variables de Entorno ─────────────────────────────────────────────────
      get_env_vars: async ({ scope = "all", filter } = {}) => {
        // scope: "process" → lee process.env de Node.js (en vivo, inmediato)
        // scope: "user" | "system" → consulta el Registro de Windows vía PowerShell
        if (scope === "system" || scope === "user") {
          const target = scope === "system" ? "Machine" : "User";
          const res = await runtime.run(`[System.Environment]::GetEnvironmentVariables([System.EnvironmentVariableTarget]::${target}) | ConvertTo-Json`);
          try {
            let vars = JSON.parse(res.stdout);
            if (filter) {
              const f = String(filter).toLowerCase();
              vars = Object.fromEntries(Object.entries(vars).filter(([k]) => k.toLowerCase().includes(f)));
            }
            return { ok: true, scope, count: Object.keys(vars).length, vars };
          } catch { return { ok: false, scope, error: res.stderr }; }
        }
        // scope: "process" o "all" → process.env directamente
        const envs = {};
        for (const [k, v] of Object.entries(process.env)) {
          if (filter && !k.toLowerCase().includes(String(filter).toLowerCase())) continue;
          envs[k] = v;
        }
        return { ok: true, scope: "process", count: Object.keys(envs).length, vars: envs };
      },

      set_env_var: async ({ name, value, scope = "user" } = {}) => {
        if (!name) return { ok: false, error: "El parametro 'name' es requerido." };
        const val = String(value ?? "");
        if (scope === "process") {
          // Operar directamente sobre process.env del proceso MCP — sin subproceso
          process.env[name] = val;
          runtime.env[name] = val;
          return { ok: true, name, value: val, scope: "process", note: "Variable activa en el proceso MCP actual (sesion)." };
        }
        const target = scope === "system" ? "Machine" : "User";
        const cmd = `[System.Environment]::SetEnvironmentVariable(${runtime.shellQuote(name)}, ${runtime.shellQuote(val)}, [System.EnvironmentVariableTarget]::${target}); Write-Output "OK"`;
        const res = await runtime.run(cmd);
        return { ok: res.ok, name, value: val, scope, persisted: true, output: res.stdout };
      },

      remove_env_var: async ({ name, scope = "user" } = {}) => {
        if (!name) return { ok: false, error: "El parametro 'name' es requerido." };
        if (scope === "process") {
          // Eliminar del proceso MCP en vivo
          const existed = name in process.env;
          delete process.env[name];
          delete runtime.env[name];
          return { ok: true, name, scope: "process", existed, note: "Variable eliminada del proceso MCP actual (sesion)." };
        }
        const target = scope === "system" ? "Machine" : "User";
        const cmd = `[System.Environment]::SetEnvironmentVariable(${runtime.shellQuote(name)}, $null, [System.EnvironmentVariableTarget]::${target}); Write-Output "Removed"`;
        const res = await runtime.run(cmd);
        return { ok: res.ok, name, scope, persisted: true, output: res.stdout };
      },

      // ── Disco / Almacenamiento ──────────────────────────────────────────────
      get_disk_info: async () => {
        const cmd = "Get-PSDrive -PSProvider FileSystem | Select-Object Name,@{N='UsedGB';E={[Math]::Round($_.Used/1GB,2)}},@{N='FreeGB';E={[Math]::Round($_.Free/1GB,2)}},@{N='TotalGB';E={[Math]::Round(($_.Used+$_.Free)/1GB,2)}} | ConvertTo-Json";
        const res = await runtime.run(cmd);
        try { return { ok: true, drives: JSON.parse(res.stdout) }; } catch { return { ok: true, raw: res.stdout }; }
      },

      get_folder_size: async ({ path: folderPath } = {}) => {
        if (!folderPath) return { ok: false, error: "El parametro 'path' es requerido." };
        const cmd = `$s=(Get-ChildItem -Path ${runtime.shellQuote(runtime.hp(folderPath))} -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum; Write-Output ([Math]::Round($s/1MB,2))`;
        const res = await runtime.run(cmd);
        return { ok: res.ok, path: folderPath, sizeMB: parseFloat(res.stdout.trim()) || 0 };
      },

      // ── Batería ─────────────────────────────────────────────────────────────
      get_battery_info: async () => {
        const cmd = "Get-CimInstance Win32_Battery | Select-Object Name,BatteryStatus,EstimatedChargeRemaining,EstimatedRunTime,DesignCapacity | ConvertTo-Json";
        const res = await runtime.run(cmd);
        try { return { ok: true, battery: JSON.parse(res.stdout) }; }
        catch { return { ok: true, raw: res.stdout || "No se detecto bateria (equipo de escritorio)." }; }
      },

      // ── Tareas Programadas ──────────────────────────────────────────────────
      list_scheduled_tasks: async ({ filter } = {}) => {
        const cmd = filter
          ? `Get-ScheduledTask | Where-Object { $_.TaskName -like ${runtime.shellQuote("*" + filter + "*")} } | Select-Object TaskName,TaskPath,State | ConvertTo-Json`
          : "Get-ScheduledTask | Select-Object TaskName,TaskPath,State | Sort-Object State | ConvertTo-Json -Depth 1";
        const res = await runtime.run(cmd);
        const raw = (res.stdout || "").trim();
        if (!raw) {
          // Sin coincidencias (filtro sin resultados)
          return { ok: true, count: 0, tasks: [], filter: filter || null };
        }
        try {
          const parsed = JSON.parse(raw);
          const tasks = Array.isArray(parsed) ? parsed : [parsed];
          return { ok: true, count: tasks.length, tasks, filter: filter || null };
        } catch {
          return { ok: true, raw, filter: filter || null };
        }
      },

      run_scheduled_task: async ({ name } = {}) => {
        if (!name) return { ok: false, error: "El parametro 'name' es requerido." };
        const res = await runtime.run(`Start-ScheduledTask -TaskName ${runtime.shellQuote(name)}`);
        return { ok: res.ok, name, output: res.stdout || res.stderr };
      },

      // ── Registro de Windows ──────────────────────────────────────────────────
      read_registry: async ({ key, value } = {}) => {
        if (!key) return { ok: false, error: "El parametro 'key' es requerido. Ejemplo: HKCU\\Software\\MyApp o HKCU:\\Software\\MyApp" };
        // Normalizar: HKCU\ -> HKCU:\ — aceptar ambos formatos
        const normalizedKey = key.replace(
          /^(HKCU|HKLM|HKCC|HKU|HKCR)(\\)/i,
          (_, hive, sep) => hive.toUpperCase() + ":" + sep
        );
        const cmd = value
          ? `Get-ItemPropertyValue -Path ${runtime.shellQuote(normalizedKey)} -Name ${runtime.shellQuote(value)} -ErrorAction Stop`
          : `Get-ItemProperty -Path ${runtime.shellQuote(normalizedKey)} -ErrorAction Stop | ConvertTo-Json`;
        const res = await runtime.run(cmd);
        if (!res.ok) return { ok: false, key: normalizedKey, error: res.stderr };
        return { ok: true, key: normalizedKey, value: value || null, data: res.stdout.trim() };
      },

      write_registry: async ({ key, name, data, type = "String" } = {}) => {
        if (!key || !name) return { ok: false, error: "Los parametros 'key' y 'name' son requeridos." };
        // Normalizar hive (mismo fix que read_registry)
        const normalizedKey = key.replace(
          /^(HKCU|HKLM|HKCC|HKU|HKCR)(\\)/i,
          (_, hive, sep) => hive.toUpperCase() + ":" + sep
        );
        const validTypes = ["String", "ExpandString", "DWord", "QWord", "Binary", "MultiString"];
        const regType = validTypes.includes(type) ? type : "String";
        const cmd = `New-ItemProperty -Path ${runtime.shellQuote(normalizedKey)} -Name ${runtime.shellQuote(name)} -Value ${runtime.shellQuote(String(data ?? ""))} -PropertyType ${regType} -Force | Out-Null; Write-Output "OK"`;
        const res = await runtime.run(cmd);
        return { ok: res.ok, key: normalizedKey, name, type: regType, output: res.stdout };
      },

      // ── Windows Update / Defender ────────────────────────────────────────────
      get_windows_update_status: async () => {
        const cmd = "Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 10 HotFixID,Description,InstalledOn | ConvertTo-Json";
        const res = await runtime.run(cmd);
        try { return { ok: true, recentUpdates: JSON.parse(res.stdout) }; }
        catch { return { ok: true, raw: res.stdout }; }
      },

      get_defender_status: async () => {
        const cmd = "Get-MpComputerStatus | Select-Object AntivirusEnabled,RealTimeProtectionEnabled,AntivirusSignatureLastUpdated,QuickScanEndTime | ConvertTo-Json";
        const res = await runtime.run(cmd);
        try {
          const parsed = JSON.parse(res.stdout);
          const parseDotNetDate = (val) => {
            if (typeof val === "string") {
              const m = val.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
              if (m) return new Date(Number(m[1])).toISOString();
            }
            return val;
          };
          for (const key of Object.keys(parsed)) {
            parsed[key] = parseDotNetDate(parsed[key]);
          }
          return { ok: true, defender: parsed };
        }
        catch { return { ok: false, error: res.stderr }; }
      },

      // ── Información de red adicional ─────────────────────────────────────────
      get_wifi_networks: async () => {
        const res = await runtime.run("netsh wlan show networks mode=Bssid");
        return {
          ok: res.ok,
          output: res.stdout || res.stderr || "",
          ...(res.ok ? {} : { error: res.stderr || "El servicio WLAN Autoconfig no está ejecutándose o la tarjeta Wi-Fi está desactivada." })
        };
      },

      get_wifi_profile: async () => {
        const res = await runtime.run("netsh wlan show profiles");
        return {
          ok: res.ok,
          output: res.stdout || res.stderr || "",
          ...(res.ok ? {} : { error: res.stderr || "No se pudieron obtener los perfiles de red inalámbrica." })
        };
      },

      // ── Energía ─────────────────────────────────────────────────────────────
      set_power_profile: async ({ profile = "balanced" } = {}) => {
        const profiles = {
          balanced: "381b4222-f694-41f0-9685-ff5bb260df2e",
          performance: "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
          powersaver: "a1841308-3541-4fab-bc81-f71556f20b4a",
        };
        const cmd = `powercfg /setactive ${profiles[profile] || profiles.balanced}`;
        return { ok: true, output: (await runtime.run(cmd)).stdout };
      },

      set_performance_mode: async () => {
        const cmd = "powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";
        return { ok: true, output: (await runtime.run(cmd)).stdout };
      },

      // ── Notificaciones / Utilidades ──────────────────────────────────────────
      send_notification: async ({ title = "AERON FLUXER X", message = "" } = {}) => {
        const sent = sendNativeNotification(title, message);
        return { ok: true, sent };
      },

      sleep: async ({ seconds = 1, ms } = {}) => {
        const delayMs = Number(ms) || Math.max(0, Number(seconds) * 1000);
        await new Promise((r) => setTimeout(r, delayMs));
        return { ok: true, sleptMs: delayMs };
      },

      wait: async ({ seconds = 1, ms } = {}) => {
        const delayMs = Number(ms) || Math.max(0, Number(seconds) * 1000);
        await new Promise((r) => setTimeout(r, delayMs));
        return { ok: true, waitedMs: delayMs };
      },

      reload_server: async () => runtime.control.reload(),
      shutdown_server: async () => runtime.control.shutdown(),

      // ── Optimización y Diagnóstico de Memoria RAM ─────────────────────────────
      clean_ram: async () => {
        const totalMem = os.totalmem();
        const freeMemBefore = os.freemem();
        const beforeMB = (totalMem - freeMemBefore) / (1024 * 1024);

        let trimmedCount = 0;
        if (process.platform === "win32") {
          const psScript = `
$code = @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
public class RamOptimizer {
    [DllImport("psapi.dll")]
    public static extern int EmptyWorkingSet(IntPtr hwProc);
    public static int Optimize() {
        int count = 0;
        foreach (Process p in Process.GetProcesses()) {
            try {
                if (!p.HasExited && p.Id > 4 && p.ProcessName != "System" && p.ProcessName != "Registry") {
                    EmptyWorkingSet(p.Handle);
                    count++;
                }
            } catch {}
        }
        return count;
    }
}
'@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
[RamOptimizer]::Optimize()
`;
          const b64 = Buffer.from(psScript, "utf16le").toString("base64");
          const res = await runtime.run(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`);
          trimmedCount = parseInt(res.stdout?.trim() || "0", 10) || 0;
        }

        if (global.gc) {
          try { global.gc(); } catch {}
        }

        const freeMemAfter = os.freemem();
        const afterMB = (totalMem - freeMemAfter) / (1024 * 1024);
        const freedMB = Math.max(0, Number(((freeMemAfter - freeMemBefore) / (1024 * 1024)).toFixed(1)));

        return {
          ok: true,
          status: "RAM optimizada con éxito",
          freed_mb: freedMB,
          processes_trimmed: trimmedCount,
          memory_before: {
            used_gb: Number((beforeMB / 1024).toFixed(2)),
            free_gb: Number((freeMemBefore / (1024 ** 3)).toFixed(2)),
            usage_percent: Number(((beforeMB / (totalMem / 1024 / 1024)) * 100).toFixed(1)),
          },
          memory_after: {
            used_gb: Number((afterMB / 1024).toFixed(2)),
            free_gb: Number((freeMemAfter / (1024 ** 3)).toFixed(2)),
            usage_percent: Number(((afterMB / (totalMem / 1024 / 1024)) * 100).toFixed(1)),
          },
          recommendation: freedMB > 200
            ? `Se liberaron ${freedMB}MB de memoria en ${trimmedCount} procesos. El sistema tiene ahora más margen de trabajo.`
            : "La memoria se encuentra en un estado relativamente compacto.",
        };
      },

      optimize_ram: async function() { return this.clean_ram(); },
      clean_memory: async function() { return this.clean_ram(); },

      analyze_memory_usage: async () => {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const usagePercent = Number(((usedMem / totalMem) * 100).toFixed(1));

        let topConsumers = [];
        if (process.platform === "win32") {
          try {
            const ps = `Get-Process | Where-Object { $_.WorkingSet64 -gt 25MB } | Select-Object Id, ProcessName, WorkingSet64, Responding | Sort-Object -Descending WorkingSet64 | Select-Object -First 30 | ConvertTo-Json -Compress`;
            const b64 = Buffer.from(ps, "utf16le").toString("base64");
            const res = await runtime.run(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`);
            if (res.stdout) {
              const parsed = JSON.parse(res.stdout);
              const list = Array.isArray(parsed) ? parsed : [parsed];
              topConsumers = list.map((p) => {
                const cat = categorizeProcess(p.ProcessName);
                return {
                  pid: p.Id,
                  name: p.ProcessName,
                  memory_mb: Math.round(p.WorkingSet64 / (1024 * 1024)),
                  responding: p.Responding !== false,
                  category: cat.category,
                  safe_to_close: cat.safeToClose,
                };
              });
            }
          } catch {}
        }

        const reclaimableConsumers = topConsumers.filter((c) => c.safe_to_close);
        const reclaimableMB = reclaimableConsumers.reduce((acc, c) => acc + c.memory_mb, 0);

        return {
          ok: true,
          total_gb: Number((totalMem / (1024 ** 3)).toFixed(2)),
          used_gb: Number((usedMem / (1024 ** 3)).toFixed(2)),
          free_gb: Number((freeMem / (1024 ** 3)).toFixed(2)),
          usage_percent: usagePercent,
          is_high_memory_pressure: usagePercent > 85,
          reclaimable_estimate_mb: reclaimableMB,
          top_consumers: topConsumers,
          recommendations: [
            usagePercent > 85 ? `⚠️ RAM al ${usagePercent}% — se recomienda ejecutar clean_ram para optimizar la memoria.` : "Uso de RAM en niveles estables.",
            reclaimableConsumers.length > 0 ? `Se detectaron ${reclaimableConsumers.length} aplicaciones no esenciales consumiendo ~${reclaimableMB}MB (ej. juegos o apps secundarias) que el usuario puede cerrar si no las está utilizando.` : null,
          ].filter(Boolean),
        };
      },

      analyze_memory: async function() { return this.analyze_memory_usage(); },

      terminate_process: async ({ pid, name, force = false } = {}) => {
        if (!pid && !name) {
          return { ok: false, error: "Se requiere 'pid' o 'name' del proceso a terminar." };
        }

        const targetName = (name || "").toLowerCase();
        if (SYSTEM_CRITICAL_PROCESSES.has(targetName)) {
          return {
            ok: false,
            error: "PROTECTED_PROCESS",
            message: `No se permite terminar el proceso crítico del sistema operativo: ${name}. Está protegido para evitar pantallazos azules o inestabilidad.`,
          };
        }

        if (process.platform === "win32") {
          const cmd = pid ? `Stop-Process -Id ${Number(pid)} -Force` : `Stop-Process -Name "${name}" -Force`;
          const res = await runtime.run(`powershell -NoProfile -NonInteractive -Command "${cmd}"`);
          return {
            ok: res.ok,
            pid,
            name,
            message: res.ok ? `Proceso ${name || pid} terminado exitosamente.` : `Error al terminar proceso: ${res.stderr || res.stdout}`,
          };
        }

        return { ok: false, error: "Plataforma no soportada para terminate_process." };
      },

      kill_process_by_name: async function(args) { return this.terminate_process(args); },

      // ── Gestión de Discos y Boot Configuration Data (bcdedit) ─────────────────
      bcd_manager: async ({ action = "status", guid, timeout, driveLetter = "S" } = {}) => {
        if (!runtime.permissions?.isElevationActive()) {
          return {
            ok: false,
            requires_elevation: true,
            error: "ELEVATION_REQUIRED",
            message: "Las operaciones sobre discos y BCD (bcdedit) requieren permisos elevados de administrador. Solicita autorización al usuario (ej. 'te doy permiso total' para 20 minutos o 'permiso de 1 hora').",
            prompt_to_user: "Esta operación sobre el gestor de arranque (BCD) y particiones EFI requiere permisos de administrador. ¿Deseas autorizar la ejecución?",
          };
        }

        const validAction = action.toLowerCase();
        switch (validAction) {
          case "status":
          case "enum": {
            const res = await runtime.runElevated("bcdedit /enum all");
            return { ok: res.ok, action: "enum", output: res.stdout || res.stderr };
          }

          case "backup": {
            const backupPath = `C:\\Windows\\Temp\\bcd_backup_${Date.now()}.bcd`;
            const res = await runtime.runElevated(`bcdedit /export "${backupPath}"`);
            return { ok: res.ok, action: "backup", backup_path: backupPath, output: res.stdout || res.stderr };
          }

          case "mount_esp": {
            const letter = (driveLetter || "S").toUpperCase().replace(":", "");
            const res = await runtime.runElevated(`mountvol ${letter}: /s`);
            return {
              ok: res.ok,
              action: "mount_esp",
              drive_letter: `${letter}:`,
              message: res.ok ? `Partición EFI del sistema montada en ${letter}: exitosamente.` : res.stderr,
            };
          }

          case "unmount_esp": {
            const letter = (driveLetter || "S").toUpperCase().replace(":", "");
            const res = await runtime.runElevated(`mountvol ${letter}: /d`);
            return {
              ok: res.ok,
              action: "unmount_esp",
              drive_letter: `${letter}:`,
              message: res.ok ? `Partición EFI en ${letter}: desmontada exitosamente.` : res.stderr,
            };
          }

          case "set_timeout": {
            const t = Math.max(0, Number(timeout) || 30);
            const res = await runtime.runElevated(`bcdedit /timeout ${t}`);
            return { ok: res.ok, action: "set_timeout", timeout: t, output: res.stdout || res.stderr };
          }

          case "delete_entry": {
            if (!guid) return { ok: false, error: "El parámetro 'guid' del boot entry es requerido para eliminar." };
            const normalizedGuid = guid.trim().toLowerCase();
            if (normalizedGuid === "{current}" || normalizedGuid === "{bootmgr}" || normalizedGuid === "{default}") {
              return { ok: false, error: "PROTECTED_ENTRY", message: "No se permite eliminar las entradas esenciales {current}, {default} o {bootmgr}." };
            }
            // Backup preventivo automático obligatorio
            const backupPath = `C:\\Windows\\Temp\\bcd_pre_delete_${Date.now()}.bcd`;
            await runtime.runElevated(`bcdedit /export "${backupPath}"`);
            const res = await runtime.runElevated(`bcdedit /delete ${guid}`);
            return { ok: res.ok, action: "delete_entry", guid, backup_path: backupPath, output: res.stdout || res.stderr };
          }

          default:
            return { ok: false, error: `Acción no reconocida: ${action}. Acciones válidas: enum, status, backup, mount_esp, unmount_esp, delete_entry, set_timeout.` };
        }
      },

      manage_disks: async () => {
        try {
          const ps = `
@{
  volumes = (Get-Volume | Select-Object DriveLetter, FileSystemLabel, FileSystem, SizeRemaining, Size, HealthStatus)
  disks = (Get-Disk | Select-Object Number, FriendlyName, OperationalStatus, PartitionStyle, TotalSize)
} | ConvertTo-Json -Compress -Depth 3
`;
          const b64 = Buffer.from(ps, "utf16le").toString("base64");
          const res = await runtime.run(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`);
          if (res.stdout) {
            const data = JSON.parse(res.stdout);
            return { ok: true, ...data };
          }
          return { ok: false, error: res.stderr || "No se pudo obtener información de discos." };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      },
    }
  );
}
