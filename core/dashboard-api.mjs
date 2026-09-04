import http from "node:http";
import fs from "node:fs/promises";

const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FLUXER v7.0 Runtime Dashboard</title>
  <style>
    :root {
      --bg: #0d0f17;
      --card-bg: rgba(255, 255, 255, 0.03);
      --border: rgba(255, 255, 255, 0.08);
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --neon-violet: #8b5cf6;
      --neon-cyan: #06b6d4;
      --neon-emerald: #10b981;
      --neon-rose: #f43f5e;
      --neon-amber: #f59e0b;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      padding: 1.5rem 2rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(13, 15, 23, 0.8);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
      background: linear-gradient(to right, var(--neon-cyan), var(--neon-violet));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .live-dot {
      width: 10px;
      height: 10px;
      background: var(--neon-emerald);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--neon-emerald);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
      100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    .header-stats {
      display: flex;
      gap: 2rem;
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .header-stats span {
      color: var(--text);
      font-weight: 500;
    }
    main {
      padding: 2rem;
      flex: 1;
      display: grid;
      grid-template-columns: 3fr 1fr;
      gap: 2rem;
      max-width: 1600px;
      margin: 0 auto;
      width: 100%;
      box-sizing: border-box;
    }
    @media (max-width: 1024px) {
      main { grid-template-columns: 1fr; }
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    .card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      border-color: rgba(255,255,255,0.15);
    }
    .card-title {
      font-size: 0.9rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }
    .card-value {
      font-size: 2rem;
      font-weight: 300;
      color: var(--text);
    }
    .card-sub {
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .progress-bar {
      width: 100%;
      height: 8px;
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
      overflow: hidden;
      margin-top: auto;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--neon-cyan), var(--neon-violet));
      border-radius: 4px;
      transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .queue-breakdown {
      display: flex;
      gap: 0.5rem;
      font-size: 0.8rem;
    }
    .badge {
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      background: rgba(255,255,255,0.1);
    }
    .badge.critical { color: var(--neon-rose); background: rgba(244,63,94,0.1); }
    .badge.high { color: var(--neon-amber); background: rgba(245,158,11,0.1); }
    .badge.normal { color: var(--neon-cyan); background: rgba(6,182,212,0.1); }
    .badge.low { color: var(--text-muted); }
    
    .feed {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      max-height: 500px;
      overflow-y: auto;
      padding-right: 0.5rem;
    }
    .feed::-webkit-scrollbar { width: 6px; }
    .feed::-webkit-scrollbar-track { background: transparent; }
    .feed::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    .feed-item {
      background: rgba(255,255,255,0.02);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      animation: slideIn 0.3s ease;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(10px); }
      to { opacity: 1; transform: translateX(0); }
    }
    .feed-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.85rem;
    }
    .feed-tool {
      font-family: monospace;
      color: var(--neon-cyan);
      background: rgba(6,182,212,0.1);
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
    }
    .feed-action { font-weight: 500; }
    .feed-meta {
      display: flex;
      gap: 1rem;
      color: var(--text-muted);
      font-size: 0.8rem;
    }
    .chip {
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .chip.ok { background: rgba(16,185,129,0.2); color: var(--neon-emerald); }
    .chip.fail { background: rgba(244,63,94,0.2); color: var(--neon-rose); }
    
    .rest-links {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .rest-link {
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--border);
      padding: 0.75rem 1rem;
      border-radius: 6px;
      color: var(--text);
      text-decoration: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.2s;
    }
    .rest-link:hover {
      background: rgba(255,255,255,0.1);
      border-color: var(--neon-violet);
      color: var(--neon-violet);
    }
    .rest-link code { font-size: 0.8rem; color: var(--text-muted); }
  </style>
</head>
<body>
  <header>
    <h1><div class="live-dot"></div> FLUXER v7.0 Runtime Dashboard</h1>
    <div class="header-stats">
      <div>Uptime: <span id="uptime">00:00:00</span></div>
      <div>Client: <span id="client-info">Detecting...</span></div>
    </div>
  </header>
  
  <main>
    <div class="left-col">
      <div class="grid">
        <div class="card">
          <div class="card-title">Memory Usage</div>
          <div class="card-value" id="mem-val">0 MB</div>
          <div class="card-sub" id="mem-sub">RSS: 0 MB | Heap: 0 MB</div>
          <div class="progress-bar"><div class="progress-fill" id="mem-bar" style="width: 0%"></div></div>
        </div>
        
        <div class="card">
          <div class="card-title">CPU Loadavg</div>
          <div class="card-value" id="cpu-val">0.00</div>
          <div class="card-sub" id="cpu-sub">1m / 5m / 15m</div>
        </div>
        
        <div class="card">
          <div class="card-title">Task Queue</div>
          <div class="card-value" id="queue-val">0 / 0</div>
          <div class="queue-breakdown" id="queue-bd">
            <span class="badge critical">C:0</span>
            <span class="badge high">H:0</span>
            <span class="badge normal">N:0</span>
            <span class="badge low">L:0</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" id="queue-bar" style="width: 0%"></div></div>
        </div>
        
        <div class="card">
          <div class="card-title">Cache Hit Rate</div>
          <div class="card-value" id="cache-val">0%</div>
          <div class="card-sub" id="cache-sub">Hits: 0 | Misses: 0</div>
          <div class="progress-bar"><div class="progress-fill" id="cache-bar" style="width: 0%; background: linear-gradient(90deg, var(--neon-emerald), var(--neon-cyan))"></div></div>
        </div>
        
        <div class="card">
          <div class="card-title">Latency (ms)</div>
          <div class="card-value" id="lat-val">0ms</div>
          <div class="card-sub" id="lat-sub">P50: 0 | P95: 0 | P99: 0</div>
        </div>
      </div>
      
      <div class="card" style="flex: 1;">
        <div class="card-title" style="margin-bottom: 1rem;">Real-time Execution Feed</div>
        <div class="feed" id="feed">
          <!-- Feed items injected via JS -->
          <div class="feed-item" style="opacity: 0.5; text-align: center; padding: 2rem;">Waiting for events...</div>
        </div>
      </div>
    </div>
    
    <div class="right-col">
      <div class="card">
        <div class="card-title" style="margin-bottom: 1rem;">REST Endpoints</div>
        <div class="rest-links">
          <a href="/status" target="_blank" class="rest-link">Status <code>JSON</code></a>
          <a href="/tools" target="_blank" class="rest-link">Tools <code>JSON</code></a>
          <a href="/metrics" target="_blank" class="rest-link">Metrics <code>JSON</code></a>
          <a href="/health" target="_blank" class="rest-link">Health <code>JSON</code></a>
          <a href="/logs" target="_blank" class="rest-link">Logs <code>TEXT</code></a>
          <a href="/queue" target="_blank" class="rest-link">Queue <code>JSON</code></a>
        </div>
      </div>
    </div>
  </main>

  <script>
    document.getElementById('client-info').textContent = navigator.userAgent.split(' ')[0] || 'Browser';
    
    // Uptime formatter
    let startTime = Date.now();
    setInterval(() => {
      const diff = Math.floor((Date.now() - startTime) / 1000);
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      document.getElementById('uptime').textContent = \`\${h}:\${m}:\${s}\`;
    }, 1000);

    const evtSource = new EventSource('/events');
    
    evtSource.addEventListener('metrics', (e) => {
      const data = JSON.parse(e.data);
      
      // Update Memory
      if (data.memory) {
        const rssMB = Math.round(data.memory.rss / 1024 / 1024);
        const heapMB = Math.round(data.memory.heapUsed / 1024 / 1024);
        document.getElementById('mem-val').textContent = \`\${rssMB} MB\`;
        document.getElementById('mem-sub').textContent = \`RSS: \${rssMB} MB | Heap: \${heapMB} MB\`;
        document.getElementById('mem-bar').style.width = \`\${Math.min((rssMB / 2048) * 100, 100)}%\`;
      }
      
      // Update CPU
      if (data.cpu && data.cpu.loadavg) {
        document.getElementById('cpu-val').textContent = data.cpu.loadavg[0].toFixed(2);
        document.getElementById('cpu-sub').textContent = \`\${data.cpu.loadavg[0].toFixed(2)} / \${data.cpu.loadavg[1].toFixed(2)} / \${data.cpu.loadavg[2].toFixed(2)}\`;
      }
      
      // Fetch queue dynamically if possible or assume metrics provides it. 
      // If metrics doesn't provide queue, we do a background fetch to /queue
      fetch('/queue').then(r => r.json()).then(q => {
        document.getElementById('queue-val').textContent = \`\${q.active || q.size} / \${q.max || '∞'}\`;
        document.getElementById('queue-bar').style.width = \`\${q.pct || 0}%\`;
        if (q.breakdown) {
          document.getElementById('queue-bd').innerHTML = \`
            <span class="badge critical">C:\${q.breakdown.CRITICAL || 0}</span>
            <span class="badge high">H:\${q.breakdown.HIGH || 0}</span>
            <span class="badge normal">N:\${q.breakdown.NORMAL || 0}</span>
            <span class="badge low">L:\${q.breakdown.LOW || 0}</span>
          \`;
        }
      }).catch(() => {});
      
      // Cache
      if (data.cache) {
        const total = data.cache.hits + data.cache.misses;
        const rate = total > 0 ? Math.round((data.cache.hits / total) * 100) : 0;
        document.getElementById('cache-val').textContent = \`\${rate}%\`;
        document.getElementById('cache-sub').textContent = \`Hits: \${data.cache.hits} | Misses: \${data.cache.misses}\`;
        document.getElementById('cache-bar').style.width = \`\${rate}%\`;
      }
      
      // Latency
      if (data.latency) {
        document.getElementById('lat-val').textContent = \`\${data.latency.p50 || 0}ms\`;
        document.getElementById('lat-sub').textContent = \`P50: \${data.latency.p50 || 0} | P95: \${data.latency.p95 || 0} | P99: \${data.latency.p99 || 0}\`;
      }
    });

    evtSource.addEventListener('tool_result', (e) => {
      const data = JSON.parse(e.data);
      const feed = document.getElementById('feed');
      
      // Remove placeholder
      if (feed.children.length === 1 && feed.children[0].textContent.includes('Waiting')) {
        feed.innerHTML = '';
      }
      
      const item = document.createElement('div');
      item.className = 'feed-item';
      
      const timeStr = new Date(data.ts).toLocaleTimeString();
      const chipClass = data.ok ? 'ok' : 'fail';
      const chipText = data.ok ? 'OK' : 'FAIL';
      
      item.innerHTML = \`
        <div class="feed-header">
          <div><span class="chip \${chipClass}">\${chipText}</span> <span class="feed-tool">\${data.tool || 'unknown'}</span></div>
          <span style="color: var(--text-muted); font-size: 0.75rem;">\${timeStr}</span>
        </div>
        <div class="feed-action">\${data.action || 'execute'}</div>
        <div class="feed-meta">
          <span>⏱ \${data.durationMs || 0}ms</span>
        </div>
      \`;
      
      feed.prepend(item);
      
      if (feed.children.length > 50) {
        feed.removeChild(feed.lastChild);
      }
    });
  </script>
</body>
</html>`;

/**
 * Dashboard HTTP local de FLUXER.
 * Expone endpoints REST y un endpoint SSE para monitoreo en tiempo real.
 * Escucha en 127.0.0.1:8765 por defecto (sólo acceso local).
 */
export async function startDashboardApi({
  runtime,
  registry,
  router,
  host = "127.0.0.1",
  port = 8765,
}) {
  // Registro de clientes SSE activos
  const sseClients = new Set();

  /** Emite un evento SSE a todos los clientes conectados. */
  function broadcast(eventName, data) {
    if (!sseClients.size) return;
    const msg = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(msg);
      } catch {
        sseClients.delete(res);
      }
    }
  }

  // Push de métricas cada 2 segundos a todos los clientes SSE conectados
  const metricsInterval = setInterval(() => {
    if (!sseClients.size) return;
    broadcast("metrics", runtime.metrics.snapshot());
  }, 2000);

  // Hook en el router para emitir resultados de herramientas en tiempo real
  if (router._dashboardAfterHook) {
    router.removeAfter(router._dashboardAfterHook);
  }
  const afterHook = async ({ request, response }) => {
    broadcast("tool_result", {
      tool: request.tool,
      action: request.action,
      ok: response.ok,
      durationMs: response.durationMs,
      ts: new Date().toISOString(),
    });
  };
  router._dashboardAfterHook = afterHook;
  router.after(afterHook);

  // Handlers REST estándar — compatibles con v5+
  const routes = {
    "/status": async () => ({
      ok: true,
      title: "FLUXER v8.0 Dashboard",
      state: await runtime.readState(),
    }),
    "/tools": async () => registry.snapshot().modules,
    "/api/tools": async () => registry.snapshot().modules,
    "/metrics": async () => runtime.metrics.snapshot(),
    "/api/metrics": async () => runtime.metrics.snapshot(),
    "/health": async () => registry.health(),
    "/api/health": async () => registry.health(),
    "/logs": async () => {
      try {
        const content = await fs.readFile(runtime.logger.file, "utf8");
        return content.split("\n").slice(-120).join("\n");
      } catch {
        return "No hay logs disponibles.";
      }
    },

    // v6: estado de la cola de tareas
    "/queue": async () => ({
      active: runtime.taskQueue.active,
      size: runtime.taskQueue.queueSize,
      max: runtime.taskQueue.maxQueue,
      breakdown: runtime.taskQueue.queueSnapshot(),
      pct: runtime.taskQueue.maxQueue
        ? +((runtime.taskQueue.queueSize / runtime.taskQueue.maxQueue) * 100).toFixed(1)
        : 0,
    }),

    // v7: modo de seguridad
    "/security": async () => ({
      ok: true,
      ...(runtime.permissions.modeInfo ? runtime.permissions.modeInfo() : { mode: "NORMAL" }),
    }),

    // v7: audit log
    "/audit": async () => {
      const entries = await runtime.auditLog?.readRecent(100) || [];
      return { ok: true, count: entries.length, entries };
    },

    // v7: configuración (sin secretos)
    "/config": async () => {
      const cfg = { ...runtime.config };
      if (cfg.ai) cfg.ai = { ...cfg.ai }; // shallow copy
      return { ok: true, config: cfg };
    },

    // v7: salud completa del sistema
    "/health/full": async () => {
      const { runHealthCheck } = await import("./health.mjs");
      return runHealthCheck({ runtime, registry, config: runtime.config });
    },
  };

  const server = http.createServer(async (req, res) => {
    // CORS para herramientas locales de desarrollo
    res.setHeader("Access-Control-Allow-Origin", "127.0.0.1");

    try {
      const url = new URL(req.url, `http://${host}:${port}`);

      // Verificación de autenticación cuando FLUXER_DASHBOARD_TOKEN está configurado
      const requiredToken = process.env.FLUXER_DASHBOARD_TOKEN || runtime?.config?.dashboard?.token;
      if (requiredToken) {
        const authHeader = req.headers["authorization"] || req.headers["x-fluxer-token"] || "";
        const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
        const queryToken = url.searchParams.get("token") || "";
        if (bearerToken !== requiredToken && queryToken !== requiredToken) {
          res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: "Unauthorized: Invalid or missing dashboard token", code: "UNAUTHORIZED" }));
          return;
        }
      }

      // ——— Endpoint HTML Dashboard: GET / o GET /dashboard ———
      if (
        req.method === "GET" &&
        (url.pathname === "/" || url.pathname === "/dashboard")
      ) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(dashboardHtml);
        return;
      }

      // ——— Endpoint SSE: GET /events ———
      if (url.pathname === "/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        // Instrucción de reconexion automática en 3s
        res.write("retry: 3000\n\n");
        // Snapshot inmediato al conectar
        res.write(
          `event: metrics\ndata: ${JSON.stringify(runtime.metrics.snapshot())}\n\n`,
        );
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
      }

      // ——— Endpoints REST ———
      const handler = routes[url.pathname];
      if (!handler) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "not found" }));
        return;
      }
      const body = await handler();
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body, null, 2));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
  });

  // Limpiar intervalo SSE y afterHook cuando el servidor se cierra
  server.on("close", () => {
    clearInterval(metricsInterval);
    if (router?.afterHooks) {
      const idx = router.afterHooks.indexOf(afterHook);
      if (idx !== -1) router.afterHooks.splice(idx, 1);
    }
    if (router?._dashboardAfterHook === afterHook) {
      router._dashboardAfterHook = null;
    }
  });

  return new Promise((resolve) => {
    server.once("error", async () => resolve(null));
    server.listen(port, host, async () => {
      await runtime.logger.info("fluxer_dashboard_started", { host, port });
      resolve(server);
    });
  });
}
