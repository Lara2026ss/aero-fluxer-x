export function createNetworkDomain({ runtime, dns, net, domain }) {
  const actions = {
    diagnose_network: async () => {
      const isWin = process.platform === "win32";
      if (!isWin) {
        const res = await runtime.run("ip addr || ifconfig");
        return { ok: true, diagnostics: res.stdout || res.stderr };
      }
      const cmd = `Get-NetIPConfiguration | ForEach-Object {
        [PSCustomObject]@{
          InterfaceAlias     = $_.InterfaceAlias
          IPv4Address        = ($_.IPv4Address.IPAddress -join ', ')
          IPv4DefaultGateway = ($_.IPv4DefaultGateway.NextHop -join ', ')
          DNSServers         = ($_.DNSServer.ServerAddresses -join ', ')
        }
      } | Format-List`;
      const res = await runtime.run(cmd);
      return { ok: true, diagnostics: res.stdout || res.stderr };
    },

    test_connection: async ({ host = "8.8.8.8", port = 53, timeoutMs = 3000 } = {}) => {
      if (!host) return { ok: false, error: "host is required" };
      const startTime = performance.now();
      return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(Number(timeoutMs) || 3000);
        socket.on("connect", () => {
          const durationMs = Math.round(performance.now() - startTime);
          socket.destroy();
          resolve({ ok: true, host, port: Number(port), reachable: true, durationMs });
        });
        socket.on("timeout", () => {
          socket.destroy();
          resolve({ ok: false, host, port: Number(port), reachable: false, error: "Connection timed out" });
        });
        socket.on("error", (err) => {
          socket.destroy();
          resolve({ ok: false, host, port: Number(port), reachable: false, error: err.message });
        });
        socket.connect(Number(port), host);
      });
    },

    dns_query: async ({ domain: domainName, rrtype = "A" } = {}) => {
      if (!domainName) return { ok: false, error: "domain is required" };
      try {
        const records = await dns.resolve(domainName, rrtype.toUpperCase());
        return { ok: true, domain: domainName, rrtype, records };
      } catch (e) {
        return { ok: false, domain: domainName, error: e.message };
      }
    },

    scan_ports: async ({ host = "127.0.0.1", ports = [80, 443, 3000, 5000, 8000, 8080, 8765], timeoutMs = 1500 } = {}) => {
      const portList = Array.isArray(ports) ? ports : [ports];
      const results = [];
      for (const p of portList) {
        const portNum = Number(p);
        const res = await new Promise((resolve) => {
          const socket = new net.Socket();
          socket.setTimeout(Number(timeoutMs) || 1500);
          socket.on("connect", () => { socket.destroy(); resolve({ port: portNum, open: true }); });
          socket.on("timeout", () => { socket.destroy(); resolve({ port: portNum, open: false }); });
          socket.on("error", () => { socket.destroy(); resolve({ port: portNum, open: false }); });
          socket.connect(portNum, host);
        });
        results.push(res);
      }
      return { ok: true, host, ports: results, openCount: results.filter(r => r.open).length };
    },

    get_interfaces: async () => {
      const os = await import("node:os");
      const nets = os.networkInterfaces();
      const ifaces = [];
      for (const [name, list] of Object.entries(nets)) {
        for (const item of list || []) {
          ifaces.push({ name, ...item });
        }
      }
      return { ok: true, count: ifaces.length, interfaces: ifaces};
    }
  };

  return domain("network", "Diagnóstico de red, pruebas de puertos, consultas DNS y telemetría de interfaces.", actions, {});
}
