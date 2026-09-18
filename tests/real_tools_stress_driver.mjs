/**
 * FLUXER XZ — Real Tools Continuous Stress & Verification Driver
 * 
 * Arranca el proceso real de `server.js` mediante stdio y ejecuta llamadas
 * JSON-RPC 2.0 auténticas sobre cada dominio de herramientas bajo carga real.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

class LiveMcpClient {
  constructor() {
    this.proc = null;
    this.msgId = 1;
    this.pending = new Map();
    this.buffer = "";
  }

  async start() {
    const serverPath = path.resolve(process.cwd(), "server.js");
    this.proc = spawn(process.execPath, [serverPath], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        FLUXER_TRUSTED_CLIENT: "true",
        AERON_FEEDBACK_GATEWAY_DISABLE: "true",
      },
    });

    this.proc.stdout.on("data", (chunk) => {
      this.buffer += chunk.toString("utf8");
      this._processBuffer();
    });

    this.proc.stderr.on("data", (chunk) => {});

    // MCP Handshake
    const initRes = await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "Fluxer Real-Load Tester", version: "4.0.0" },
    });

    this.sendNotification("notifications/initialized", {});
    return initRes;
  }

  _processBuffer() {
    while (true) {
      const idx = this.buffer.indexOf("\n");
      if (idx === -1) break;
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;

      try {
        const msg = JSON.parse(line);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) {
            reject(msg.error);
          } else {
            resolve(msg.result);
          }
        }
      } catch {}
    }
  }

  sendRequest(method, params) {
    const id = this.msgId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(payload);
    });
  }

  sendNotification(method, params) {
    const payload = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
    this.proc.stdin.write(payload);
  }

  async callTool(name, args) {
    const res = await this.sendRequest("tools/call", {
      name,
      arguments: args,
    });
    if (res?.content?.[0]?.text) {
      try {
        return JSON.parse(res.content[0].text);
      } catch {
        return res.content[0].text;
      }
    }
    return res;
  }

  async stop() {
    if (this.proc) {
      this.proc.stdin.end();
      this.proc.kill("SIGTERM");
    }
  }
}

async function runRealLoadSuite() {
  console.log("══════════════════════════════════════════════════════════════════");
  console.log("🔥 FLUXER XZ: SUITE DE PRUEBAS CONTINUAS CON CARGA REAL");
  console.log("══════════════════════════════════════════════════════════════════\n");

  const client = new LiveMcpClient();
  const init = await client.start();
  console.log(`[MCP CONNECTED] Servidor: ${init?.serverInfo?.name} v${init?.serverInfo?.version}\n`);

  const results = [];
  const testDir = path.resolve(process.cwd(), "storage", "test_real_load_" + Date.now());
  await fs.mkdir(testDir, { recursive: true });

  async function test(name, fn) {
    process.stdout.write(`▶ Probando: ${name}... `);
    const start = performance.now();
    try {
      await fn();
      const dur = Math.round(performance.now() - start);
      console.log(`🟢 OK (${dur}ms)`);
      results.push({ name, status: "PASS", durationMs: dur });
    } catch (err) {
      const dur = Math.round(performance.now() - start);
      console.log(`🔴 FALLÓ (${dur}ms)`);
      console.error(`   Error: ${err.message}`);
      results.push({ name, status: "FAIL", durationMs: dur, error: err.message });
    }
  }

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. DOMINIO: SYSTEM
    // ─────────────────────────────────────────────────────────────────────────
    console.log("─── [1/10] DOMINIO: SYSTEM (Carga y Diagnóstico Real) ───");

    await test("system.get_system_snapshot (Lectura profunda de HW/SO)", async () => {
      const res = await client.callTool("system", { action: "get_system_snapshot", args: {} });
      assert.equal(res.ok, true);
      assert.ok(res.platform === "win32");
      assert.ok(res.memory?.totalGB > 0);
      assert.ok(res.cores > 0);
    });

    await test("system.get_processes (Inspección de procesos reales)", async () => {
      const res = await client.callTool("system", { action: "get_processes", args: { limit: 10, compact: true } });
      assert.equal(res.ok, true);
      assert.ok(Array.isArray(res.processes) && res.processes.length > 0);
    });

    await test("system.get_disk_info (Volúmenes reales de almacenamiento)", async () => {
      const res = await client.callTool("system", { action: "get_disk_info", args: {} });
      assert.equal(res.ok, true);
      assert.ok(Array.isArray(res.disks) && res.disks.length > 0);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. DOMINIO: DATABASE (SQLite Real bajo carga)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n─── [2/10] DOMINIO: DATABASE (Transacciones y Consultas SQLite) ───");
    const dbPath = path.join(testDir, "stress_test.db");

    await test("database.query (Creación de tabla estructurada)", async () => {
      const res = await client.callTool("database", {
        action: "query",
        args: {
          database: dbPath,
          query: "CREATE TABLE stress_records (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, metric REAL, payload JSON, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);",
        },
      });
      assert.equal(res.ok, true);
    });

    await test("database.query (Inserción masiva de 250 registros)", async () => {
      for (let i = 1; i <= 250; i++) {
        const res = await client.callTool("database", {
          action: "query",
          args: {
            database: dbPath,
            query: "INSERT INTO stress_records (name, metric, payload) VALUES (?, ?, ?);",
            params: [`item_${i}`, i * 1.414, JSON.stringify({ batch: Math.floor(i / 50), valid: true })],
          },
        });
        assert.equal(res.ok, true);
      }
    });

    await test("database.query (Agregaciones y búsquedas complejas)", async () => {
      const res = await client.callTool("database", {
        action: "query",
        args: {
          database: dbPath,
          query: "SELECT COUNT(*) as total, AVG(metric) as avg_metric, MAX(metric) as max_metric FROM stress_records WHERE id > 50;",
        },
      });
      assert.equal(res.ok, true);
      assert.equal(res.rows[0].total, 200);
    });

    await test("database.export (Exportación de esquema y datos a JSON)", async () => {
      const res = await client.callTool("database", {
        action: "export",
        args: {
          database: dbPath,
          table: "stress_records",
          format: "json",
        },
      });
      assert.equal(res.ok, true);
      assert.ok(res.rows?.length === 250 || res.count === 250);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. DOMINIO: FILES (PDFs, Imágenes, Integridad y Handle Liberation)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n─── [3/10] DOMINIO: FILES (Documentos, Imágenes y Staging) ───");

    const img1 = path.join(testDir, "page1.png");
    const img2 = path.join(testDir, "page2.png");
    const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    await fs.writeFile(img1, tinyPng);
    await fs.writeFile(img2, tinyPng);

    const pdfOut1 = path.join(testDir, "doc_out1.pdf");
    const pdfOut2 = path.join(testDir, "doc_out2.pdf");

    await test("files.image_to_pdf (Conversión real de imágenes a PDF)", async () => {
      const res = await client.callTool("files", {
        action: "image_to_pdf",
        args: {
          images: [img1, img2],
          outputPath: pdfOut1,
          pageSize: "A4",
          orientation: "portrait",
        },
      });
      assert.equal(res.ok, true);
      const pdfStat = await fs.stat(pdfOut1);
      assert.ok(pdfStat.size > 100);
    });

    await test("files.image_to_pdf (Segunda conversión para merge)", async () => {
      const res = await client.callTool("files", {
        action: "image_to_pdf",
        args: {
          images: [img2],
          outputPath: pdfOut2,
          pageSize: "Letter",
        },
      });
      assert.equal(res.ok, true);
    });

    const mergedPdf = path.join(testDir, "merged_document.pdf");
    await test("files.merge_pdfs (Fusión real de múltiples PDFs)", async () => {
      const res = await client.callTool("files", {
        action: "merge_pdfs",
        args: {
          inputFiles: [pdfOut1, pdfOut2],
          outputPath: mergedPdf,
        },
      });
      assert.equal(res.ok, true);
      assert.ok(res.mergedCount === 2 || res.pageCount >= 2);
    });

    await test("files.get_metadata (Inspección profunda de metadatos)", async () => {
      const res = await client.callTool("files", {
        action: "get_metadata",
        args: { path: mergedPdf },
      });
      assert.equal(res.ok, true);
      assert.ok(res.size > 200);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. DOMINIO: PRINT (Preflight de PDF)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n─── [4/10] DOMINIO: PRINT (Validación Preflight de Impresión) ───");

    await test("print.preflight (Análisis de páginas y dimensiones sin imprimir)", async () => {
      const res = await client.callTool("print", {
        action: "preflight",
        args: { filePath: mergedPdf },
      });
      assert.equal(res.ok, true);
      assert.ok(res.preflight?.pageCount >= 2 || res.pageCount >= 2);
    });

    await test("print.list_printers (Detección de impresoras en Windows)", async () => {
      const res = await client.callTool("print", {
        action: "list_printers",
        args: {},
      });
      assert.equal(res.ok, true);
      assert.ok(Array.isArray(res.printers));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. DOMINIO: FL STUDIO (Music Compiler & Chord Engine)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n─── [5/10] DOMINIO: FL STUDIO (Generación y Compilación Musical) ───");

    await test("flstudio.music_create (Compilación de arreglo completo en 1-shot)", async () => {
      const res = await client.callTool("flstudio", {
        action: "music_create",
        args: {
          tempo: 124,
          scale: "C:minor",
          chords: ["Cm7", "Fm7", "Bb7", "Ebmaj7"],
          style: "lofi",
          bars: 8,
        },
      });
      assert.equal(res.ok, true);
      assert.ok(res.composition || res.score || res.patterns);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 6. DOMINIO: SECURITY (HMAC, Leases, WORM SQLite)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n─── [6/10] DOMINIO: SECURITY (Criptografía, Aprobación HMAC y WORM) ───");

    let activeLeaseId = null;
    await test("security.request_action_approval (Desafío HMAC)", async () => {
      const res = await client.callTool("security", {
        action: "request_action_approval",
        args: {
          tool: "files",
          action: "gc",
          args: { directory: testDir, budget: { calls: 3 } },
        },
      });
      assert.equal(res.ok, true);
      assert.ok(res.approval?.actionId);

      const click = await client.callTool("security", {
        action: "simulate_user_click",
        args: { actionId: res.approval.actionId },
      });
      assert.equal(click.ok, true);
      assert.equal(click.userActionVerified, true);

      const app = await client.callTool("security", {
        action: "approve_user_action",
        args: {
          actionId: res.approval.actionId,
          userActionSignature: click.userActionSignature,
          clickTimestamp: click.clickTimestamp,
        },
      });
      assert.equal(app.ok, true);
      assert.ok(app.approval?.leaseId);
      activeLeaseId = app.approval.leaseId;
    });

    await test("security.get_lease (Inspección de cuota de Capability Lease)", async () => {
      assert.ok(activeLeaseId);
      const res = await client.callTool("security", {
        action: "get_lease",
        args: { leaseId: activeLeaseId },
      });
      assert.equal(res.ok, true);
      assert.equal(res.lease.status, "active");
    });

    await test("security.worm_audit_verify (Verificación matemática de cadena Merkle)", async () => {
      const res = await client.callTool("security", {
        action: "worm_audit_verify",
        args: {},
      });
      assert.equal(res.ok, true);
      assert.equal(res.intact, true);
      assert.equal(res.tampered, false);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 7. DOMINIO: WORKFLOW (DAG con Checkpointing en SQLite)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n─── [7/10] DOMINIO: WORKFLOW (DAG, Snapshot de Tareas y Resume) ───");

    const dagRunId = `real_dag_${Date.now()}`;
    await test("workflow.run (Ejecución multi-paso con snapshots)", async () => {
      const res = await client.callTool("workflow", {
        action: "run",
        args: {
          runId: dagRunId,
          tasks: [
            {
              id: "step_check_os",
              capability: "system",
              operation: "get_system_snapshot",
              options: { compact: true },
            },
            {
              id: "step_db_query",
              capability: "database",
              operation: "query",
              options: { database: dbPath, query: "SELECT COUNT(*) as cnt FROM stress_records;" },
              dependsOn: ["step_check_os"],
            },
          ],
        },
      });
      assert.equal(res.ok, true);
      assert.equal(res.status, "completed");
    });

    await test("workflow.checkpoints (Inspección de snapshots en SQLite)", async () => {
      const res = await client.callTool("workflow", {
        action: "checkpoints",
        args: { runId: dagRunId },
      });
      assert.equal(res.ok, true);
      assert.equal(res.checkpoints?.length, 2);
      assert.equal(res.checkpoints[0].status, "completed");
      assert.equal(res.checkpoints[1].status, "completed");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 8. DOMINIO: TERMINAL (Ejecución Controlada de Procesos)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n─── [8/10] DOMINIO: TERMINAL (Comandos Seguros) ───");

    await test("terminal.exec (Ejecución de PowerShell con salida estructurada)", async () => {
      const res = await client.callTool("terminal", {
        action: "run_command",
        args: { command: "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'" },
      });
      assert.equal(res.ok, true);
      assert.ok(res.stdout || res.output);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 9. DOMINIO: DEVELOPER (Telemetría de Ring Buffer en Memoria)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n─── [9/10] DOMINIO: DEVELOPER (Ring Buffer de Telemetría) ───");

    await test("developer.telemetry (Inspección de las últimas llamadas MCP)", async () => {
      const res = await client.callTool("developer", {
        action: "telemetry",
        args: { limit: 15 },
      });
      assert.equal(res.ok, true);
      assert.ok(Array.isArray(res.entries));
      assert.ok(res.entries.length > 0);
      assert.ok(res.entries[0].tool && res.entries[0].durationMs >= 0);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 10. DOMINIO: WEB (Búsqueda y Deduplicación)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n─── [10/10] DOMINIO: WEB (Búsqueda y Deduplicación en Paralelo) ───");

    await test("web.search (Búsqueda multi-motor en vivo)", async () => {
      const res = await client.callTool("web", {
        action: "search",
        args: { query: "Node.js SQLite performance benchmarks", limit: 3 },
      });
      assert.equal(res.ok, true);
      assert.ok(Array.isArray(res.results));
    });

  } finally {
    await client.stop();
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("📊 RESUMEN FINAL DE PRUEBAS BAJO CARGA REAL");
  console.log("══════════════════════════════════════════════════════════════════");
  
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.table(results.map((r) => ({
    Prueba: r.name.length > 45 ? r.name.slice(0, 45) + "..." : r.name,
    Estado: r.status,
    "Tiempo (ms)": r.durationMs,
  })));

  console.log(`\nTOTAL: ${results.length} pruebas | APROBADAS: ${passed} | FALLADAS: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

runRealLoadSuite().catch((err) => {
  console.error("FATAL DRIVER ERROR:", err);
  process.exit(1);
});
