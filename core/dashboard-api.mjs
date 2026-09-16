import http from "node:http";
import fs from "node:fs/promises";

const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FLUXER Runtime Dashboard</title>
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
      padding: 1.25rem 2rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(13, 15, 23, 0.85);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    h1 {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 600;
      background: linear-gradient(to right, var(--neon-cyan), var(--neon-violet));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: flex;
      align-items: center;
      gap: 0.75rem;
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
      align-items: center;
      gap: 1.5rem;
      color: var(--text-muted);
      font-size: 0.85rem;
    }
    .header-stats span {
      color: var(--text);
      font-weight: 500;
    }
    #notif-pill {
      display: none;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
      background: rgba(245, 158, 11, 0.15);
      color: var(--neon-amber);
      border: 1px solid rgba(245, 158, 11, 0.3);
      font-weight: 600;
      font-size: 0.8rem;
      animation: pulse 2s infinite;
      cursor: pointer;
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
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1.25rem;
      margin-bottom: 1.5rem;
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
      gap: 0.75rem;
    }
    .card:hover {
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      border-color: rgba(255,255,255,0.15);
    }
    .card-title {
      font-size: 0.85rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }
    .card-value {
      font-size: 1.8rem;
      font-weight: 300;
      color: var(--text);
    }
    .card-sub {
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    .progress-bar {
      width: 100%;
      height: 6px;
      background: rgba(255,255,255,0.1);
      border-radius: 3px;
      overflow: hidden;
      margin-top: auto;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--neon-cyan), var(--neon-violet));
      border-radius: 3px;
      transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .queue-breakdown {
      display: flex;
      gap: 0.5rem;
      font-size: 0.75rem;
    }
    .badge {
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      background: rgba(255,255,255,0.1);
      font-size: 0.75rem;
    }
    .badge.critical { color: var(--neon-rose); background: rgba(244,63,94,0.15); border: 1px solid rgba(244,63,94,0.3); }
    .badge.high { color: var(--neon-amber); background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.3); }
    .badge.normal { color: var(--neon-cyan); background: rgba(6,182,212,0.15); }
    .badge.low { color: var(--text-muted); }

    /* ── Notification Section ─────────────────────────────── */
    .notif-section {
      background: rgba(139, 92, 246, 0.03);
      border: 1px solid rgba(139, 92, 246, 0.2);
      border-radius: 12px;
      padding: 1.25rem;
      margin-bottom: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .notif-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .notif-section-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .notif-item {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1rem 1.25rem;
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      animation: slideIn 0.3s ease;
      transition: all 0.2s ease;
    }
    .notif-item.admin_elevation, .notif-item.critical {
      border-color: rgba(244, 63, 94, 0.35);
      background: rgba(244, 63, 94, 0.04);
    }
    .notif-item.strong_permission {
      border-color: rgba(245, 158, 11, 0.35);
      background: rgba(245, 158, 11, 0.04);
    }
    .notif-item-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-right: 1.5rem;
    }
    .notif-item-title {
      font-weight: 600;
      font-size: 0.9rem;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .notif-code-tag {
      font-family: monospace;
      font-size: 0.75rem;
      background: rgba(255, 255, 255, 0.1);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      color: var(--neon-cyan);
      letter-spacing: 0.05em;
    }
    .notif-item-msg {
      font-size: 0.85rem;
      color: var(--text-muted);
      line-height: 1.45;
    }
    .notif-btn-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 0.35rem;
    }
    .btn-approve {
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;
      border: none;
      border-radius: 6px;
      padding: 0.45rem 1rem;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
    }
    .btn-approve:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.45);
    }
    .btn-deny {
      background: rgba(244, 63, 94, 0.12);
      color: var(--neon-rose);
      border: 1px solid rgba(244, 63, 94, 0.25);
      border-radius: 6px;
      padding: 0.45rem 0.85rem;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.2s ease;
    }
    .btn-deny:hover {
      background: rgba(244, 63, 94, 0.22);
      border-color: var(--neon-rose);
    }
    .btn-close-x {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 1.1rem;
      line-height: 1;
      padding: 0.25rem 0.45rem;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-close-x:hover {
      color: var(--neon-rose);
      background: rgba(244, 63, 94, 0.15);
    }
    
    .feed {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      max-height: 480px;
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
      padding: 0.85rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
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
    .feed-action { font-weight: 500; font-size: 0.9rem; }
    .feed-meta {
      display: flex;
      gap: 1rem;
      color: var(--text-muted);
      font-size: 0.78rem;
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
    <h1><div class="live-dot"></div> FLUXER Runtime Dashboard</h1>
    <div class="header-stats">
      <div id="notif-pill" onclick="document.getElementById('notif-section').scrollIntoView({ behavior: 'smooth' })">
        🔔 <span id="notif-pill-text">0 Permisos Pendientes</span>
      </div>
      <div>Uptime: <span id="uptime">00:00:00</span></div>
      <div>Client: <span id="client-info">Detecting...</span></div>
    </div>
  </header>
  
  <main>
    <div class="left-col">
      <!-- 🔔 CENTRO DE NOTIFICACIONES Y AUTORIZACIÓN DE IA INTEGRADO -->
      <section class="notif-section" id="notif-section">
        <div class="notif-section-header">
          <div class="notif-section-title">
            <span>🔔 Centro de Notificaciones & Autorización IA</span>
            <span id="notif-header-count" class="badge low">0 pendientes</span>
          </div>
          <span style="font-size:0.75rem; color:var(--text-muted);">
            Autoriza con un clic o presiona '✕' para denegar a la IA
          </span>
        </div>
        <div id="notif-container">
          <div id="notif-empty" style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem; border: 1px dashed var(--border); border-radius: 8px;">
            ✓ No hay autorizaciones pendientes. La IA opera dentro de los límites estándar permitidos.
          </div>
        </div>
      </section>

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
        <div class="card-title" style="margin-bottom: 0.5rem;">Real-time Execution Feed</div>
        <div class="feed" id="feed">
          <div class="feed-item" style="opacity: 0.5; text-align: center; padding: 2rem;">Waiting for events...</div>
        </div>
      </div>
    </div>
    
    <div class="right-col">
      <div class="card">
        <div class="card-title" style="margin-bottom: 0.5rem;">REST Endpoints</div>
        <div class="rest-links">
          <a href="/notifications" target="_blank" class="rest-link">Notifications <code>JSON</code></a>
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
    
    let startTime = Date.now();
    setInterval(() => {
      const diff = Math.floor((Date.now() - startTime) / 1000);
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      document.getElementById('uptime').textContent = \`\${h}:\${m}:\${s}\`;
    }, 1000);

    // ── GESTIÓN INTEGRADA DE NOTIFICACIONES ────────────────────────────────────
    async function loadNotifications() {
      try {
        const res = await fetch('/api/notifications');
        const data = await res.json();
        renderNotifications(data.notifications || []);
      } catch {}
    }

    function renderNotifications(notifs) {
      const container = document.getElementById('notif-container');
      const pill = document.getElementById('notif-pill');
      const pillText = document.getElementById('notif-pill-text');
      const headerCount = document.getElementById('notif-header-count');

      const pending = notifs.filter(n => n.status === 'pending');
      
      if (pending.length > 0) {
        pill.style.display = 'flex';
        pillText.textContent = \`\${pending.length} Permiso\${pending.length > 1 ? 's' : ''} Pendiente\${pending.length > 1 ? 's' : ''}\`;
        headerCount.textContent = \`\${pending.length} pendiente\${pending.length > 1 ? 's' : ''}\`;
        headerCount.className = 'badge high';
      } else {
        pill.style.display = 'none';
        headerCount.textContent = '0 pendientes';
        headerCount.className = 'badge low';
      }

      if (pending.length === 0) {
        container.innerHTML = \`
          <div id="notif-empty" style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem; border: 1px dashed var(--border); border-radius: 8px;">
            ✓ No hay autorizaciones pendientes. La IA opera dentro de los límites estándar permitidos.
          </div>
        \`;
        return;
      }

      container.innerHTML = '';
      pending.forEach(n => {
        const item = document.createElement('div');
        item.className = \`notif-item \${n.category || 'standard'}\`;
        item.id = \`notif-\${n.id}\`;

        const badgeClass = (n.category === 'admin_elevation' || n.category === 'critical') ? 'critical' : 'high';

        item.innerHTML = \`
          <button class="btn-close-x" onclick="dismissNotif('\${n.id}')" title="Denegar acceso y descartar">✕</button>
          <div class="notif-item-top">
            <div class="notif-item-title">
              <span class="badge \${badgeClass}">\${n.badge || 'PERMISO REQUERIDO'}</span>
              <span>\${n.tool ? n.tool + '.' + n.action : n.title}</span>
              \${n.clientName ? \`<span class="badge" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); font-size: 0.72rem;">🤖 \${n.clientName}</span>\` : ''}
              \${n.confirmationCode ? \`<span class="notif-code-tag">CÓDIGO: \${n.confirmationCode}</span>\` : ''}
            </div>
            <span style="color: var(--text-muted); font-size: 0.75rem;">\${new Date(n.createdAt).toLocaleTimeString()}</span>
          </div>
          <div class="notif-item-msg">\${n.message}</div>
          <div class="notif-btn-row">
            <button class="btn-approve" onclick="approveNotif('\${n.id}', '\${n.confirmationCode || ''}')">
              ✓ Autorizar Acceso (15 min)
            </button>
            <button class="btn-deny" onclick="denyNotif('\${n.id}', '\${n.confirmationCode || ''}')">
              ✕ Denegar / No
            </button>
          </div>
        \`;
        container.appendChild(item);
      });
    }

    async function approveNotif(id, code) {
      const el = document.getElementById(\`notif-\${id}\`);
      if (el) el.style.opacity = '0.5';
      try {
        const res = await fetch('/api/notifications/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, confirmationCode: code, grantMinutes: 15 }),
        });
        const result = await res.json();
        if (el) {
          el.innerHTML = \`<div style="color: var(--neon-emerald); font-weight: 600; font-size: 0.85rem; padding: 0.5rem 0;">✓ Acceso concedido a la IA exitosamente (15 min).</div>\`;
          setTimeout(() => loadNotifications(), 1500);
        }
      } catch (e) {
        if (el) el.style.opacity = '1';
        alert('Error autorizando: ' + e.message);
      }
    }

    async function denyNotif(id, code) {
      const el = document.getElementById(\`notif-\${id}\`);
      if (el) el.style.opacity = '0.5';
      try {
        await fetch('/api/notifications/deny', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, confirmationCode: code, reason: 'Denegado por el usuario en Dashboard' }),
        });
        if (el) {
          el.innerHTML = \`<div style="color: var(--neon-rose); font-weight: 600; font-size: 0.85rem; padding: 0.5rem 0;">✕ Acceso denegado a la IA.</div>\`;
          setTimeout(() => loadNotifications(), 1200);
        }
      } catch (e) {
        if (el) el.style.opacity = '1';
      }
    }

    async function dismissNotif(id) {
      const el = document.getElementById(\`notif-\${id}\`);
      if (el) {
        el.style.transform = 'translateX(20px)';
        el.style.opacity = '0';
      }
      try {
        await fetch('/api/notifications/dismiss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        setTimeout(() => loadNotifications(), 300);
      } catch {}
    }

    loadNotifications();

    // ── SSE REAL-TIME EVENTS ──────────────────────────────────────────────────
    const evtSource = new EventSource('/events');
    
    evtSource.addEventListener('notification_created', () => loadNotifications());
    evtSource.addEventListener('notification_resolved', () => loadNotifications());
    evtSource.addEventListener('notification_dismissed', () => loadNotifications());

    evtSource.addEventListener('metrics', (e) => {
      const data = JSON.parse(e.data);
      if (data.memory) {
        const rssMB = Math.round(data.memory.rss / 1024 / 1024);
        const heapMB = Math.round(data.memory.heapUsed / 1024 / 1024);
        document.getElementById('mem-val').textContent = \`\${rssMB} MB\`;
        document.getElementById('mem-sub').textContent = \`RSS: \${rssMB} MB | Heap: \${heapMB} MB\`;
        document.getElementById('mem-bar').style.width = \`\${Math.min((rssMB / 2048) * 100, 100)}%\`;
      }
      if (data.cpu && data.cpu.loadavg) {
        document.getElementById('cpu-val').textContent = data.cpu.loadavg[0].toFixed(2);
        document.getElementById('cpu-sub').textContent = \`\${data.cpu.loadavg[0].toFixed(2)} / \${data.cpu.loadavg[1].toFixed(2)} / \${data.cpu.loadavg[2].toFixed(2)}\`;
      }
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
      if (data.cache) {
        const total = data.cache.hits + data.cache.misses;
        const rate = total > 0 ? Math.round((data.cache.hits / total) * 100) : 0;
        document.getElementById('cache-val').textContent = \`\${rate}%\`;
        document.getElementById('cache-sub').textContent = \`Hits: \${data.cache.hits} | Misses: \${data.cache.misses}\`;
        document.getElementById('cache-bar').style.width = \`\${rate}%\`;
      }
      if (data.latency) {
        document.getElementById('lat-val').textContent = \`\${data.latency.p50 || 0}ms\`;
        document.getElementById('lat-sub').textContent = \`P50: \${data.latency.p50 || 0} | P95: \${data.latency.p95 || 0} | P99: \${data.latency.p99 || 0}\`;
      }
    });

    evtSource.addEventListener('tool_result', (e) => {
      const data = JSON.parse(e.data);
      const feed = document.getElementById('feed');
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
  const sseClients = new Set();

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

  // Suscribir eventos del NotificationCenter al SSE broadcast
  let cleanupNotifEvents = null;
  if (runtime.notifications) {
    const onCreated = (n) => broadcast("notification_created", n);
    const onResolved = (n) => broadcast("notification_resolved", n);
    const onDismissed = (n) => broadcast("notification_dismissed", n);

    runtime.notifications.on("created", onCreated);
    runtime.notifications.on("resolved", onResolved);
    runtime.notifications.on("dismissed", onDismissed);

    cleanupNotifEvents = () => {
      runtime.notifications.off("created", onCreated);
      runtime.notifications.off("resolved", onResolved);
      runtime.notifications.off("dismissed", onDismissed);
    };
  }

  // Handlers REST estándar
  const routes = {
    "/notifications": async () => ({
      ok: true,
      pendingCount: runtime.notifications?.pendingCount?.() || 0,
      notifications: runtime.notifications?.list?.() || [],
    }),
    "/api/notifications": async () => ({
      ok: true,
      pendingCount: runtime.notifications?.pendingCount?.() || 0,
      notifications: runtime.notifications?.list?.() || [],
    }),
    "/status": async () => ({
      ok: true,
      title: "FLUXER Dashboard",
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
    "/queue": async () => ({
      active: runtime.taskQueue.active,
      size: runtime.taskQueue.queueSize,
      max: runtime.taskQueue.maxQueue,
      breakdown: runtime.taskQueue.queueSnapshot(),
      pct: runtime.taskQueue.maxQueue
        ? +((runtime.taskQueue.queueSize / runtime.taskQueue.maxQueue) * 100).toFixed(1)
        : 0,
    }),
    "/security": async () => ({
      ok: true,
      ...(runtime.permissions.modeInfo ? runtime.permissions.modeInfo() : { mode: "NORMAL" }),
    }),
    "/audit": async () => {
      const entries = await runtime.auditLog?.readRecent(100) || [];
      return { ok: true, count: entries.length, entries };
    },
    "/config": async () => {
      const cfg = { ...runtime.config };
      if (cfg.ai) cfg.ai = { ...cfg.ai };
      return { ok: true, config: cfg };
    },
    "/health/full": async () => {
      const { runHealthCheck } = await import("./health.mjs");
      return runHealthCheck({ runtime, registry, config: runtime.config });
    },
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "127.0.0.1");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Fluxer-Token");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url, `http://${host}:${port}`);

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

      // GET / o /dashboard
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/dashboard")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(dashboardHtml);
        return;
      }

      // GET /events (SSE)
      if (url.pathname === "/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write("retry: 3000\n\n");
        res.write(`event: metrics\ndata: ${JSON.stringify(runtime.metrics.snapshot())}\n\n`);
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
      }

      // Endpoints interactivos de Notificaciones / Autorizaciones
      if (req.method === "POST" && ["/api/notifications/approve", "/api/notifications/deny", "/api/notifications/dismiss"].includes(url.pathname)) {
        let body = {};
        try {
          const raw = await new Promise((resolve) => {
            let buf = "";
            req.on("data", (chunk) => (buf += chunk));
            req.on("end", () => resolve(buf));
          });
          body = raw ? JSON.parse(raw) : {};
        } catch {}

        const target = body.id || body.confirmationCode || body.code;
        let responsePayload;

        if (url.pathname === "/api/notifications/approve") {
          responsePayload = runtime.notifications
            ? runtime.notifications.approve(target, { grantMinutes: body.grantMinutes || 15 })
            : { ok: false, error: "Notification center not available" };
        } else if (url.pathname === "/api/notifications/deny") {
          responsePayload = runtime.notifications
            ? runtime.notifications.deny(target, { reason: body.reason || "Denegado por el usuario" })
            : { ok: false, error: "Notification center not available" };
        } else {
          responsePayload = runtime.notifications
            ? runtime.notifications.dismiss(target)
            : { ok: false, error: "Notification center not available" };
        }

        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(responsePayload, null, 2));
        return;
      }

      if (req.method === "DELETE" && url.pathname.startsWith("/api/notifications/")) {
        const id = url.pathname.replace("/api/notifications/", "").trim();
        const responsePayload = runtime.notifications
          ? runtime.notifications.dismiss(id)
          : { ok: false, error: "Notification center not available" };
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(responsePayload, null, 2));
        return;
      }

      // Endpoints REST estándar
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

  server.on("close", () => {
    clearInterval(metricsInterval);
    if (cleanupNotifEvents) cleanupNotifEvents();
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
