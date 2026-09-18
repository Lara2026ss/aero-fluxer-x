/**
 * Batería Exhaustiva de Pruebas MCP de Todas las Acciones de FLUXER:files
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function runMcpFilesSuite() {
  console.log("🚀 Iniciando Validación Completa de Acciones de FLUXER:files vía MCP Stdio...");

  const cp = spawn("node", ["server.js"], {
    cwd: ROOT,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let messageId = 1;
  const pendingRequests = new Map();

  cp.stdout.on("data", (chunk) => {
    const raw = chunk.toString();
    const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.id && pendingRequests.has(parsed.id)) {
          const { resolve } = pendingRequests.get(parsed.id);
          pendingRequests.delete(parsed.id);
          resolve(parsed);
        }
      } catch {}
    }
  });

  function sendRpc(method, params = {}) {
    return new Promise((resolve) => {
      const id = messageId++;
      pendingRequests.set(id, { resolve });
      const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      cp.stdin.write(payload);
    });
  }

  function callTool(action, args = {}) {
    return sendRpc("tools/call", {
      name: "files",
      arguments: { action, args },
    }).then((res) => {
      try {
        const text = res.result?.content?.[0]?.text;
        return text ? JSON.parse(text) : res;
      } catch {
        return res;
      }
    });
  }

  // 1. Handshake MCP
  await sendRpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "AntigravityMcpTester", version: "1.0.0" },
  });
  cp.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  console.log("✓ Handshake MCP inicializado con éxito.");

  // Crear archivo de prueba
  const testFile = path.join(ROOT, "storage", "mcp_test_file.txt");
  const testJson = path.join(ROOT, "storage", "mcp_test.json");
  const testCsv = path.join(ROOT, "storage", "mcp_test.csv");
  await fs.mkdir(path.dirname(testFile), { recursive: true });
  await fs.writeFile(testFile, "Line 1: Alpha\nLine 2: Beta\nLine 3: Gamma\nLine 4: Delta\nLine 5: Epsilon\n", "utf8");
  await fs.writeFile(testJson, JSON.stringify({ app: "Fluxer", count: 10, items: ["a", "b"] }, null, 2), "utf8");

  const results = [];

  async function testAction(name, fn) {
    try {
      const res = await fn();
      if (res && (res.ok === true || res.content || res.tree || res.entries || res.matches)) {
        console.log(`  ✓ [files.${name}] OK`);
        results.push({ name, ok: true });
      } else {
        console.log(`  ❌ [files.${name}] FAILED:`, res?.error || res);
        results.push({ name, ok: false, error: res?.error });
      }
    } catch (err) {
      console.log(`  ❌ [files.${name}] EXCEPTION:`, err.message);
      results.push({ name, ok: false, error: err.message });
    }
  }

  console.log("\n--- Batería de Navegación e Inspección ---");
  await testAction("list_directory", () => callTool("list_directory", { path: "." }));
  await testAction("list_directory_with_sizes", () => callTool("list_directory_with_sizes", { path: "." }));
  await testAction("directory_tree", () => callTool("directory_tree", { path: "core", depth: 1 }));
  await testAction("search_files", () => callTool("search_files", { path: "core", pattern: "*.mjs" }));
  await testAction("get_file_info", () => callTool("get_file_info", { path: testFile }));
  await testAction("calculate_checksum", () => callTool("calculate_checksum", { path: testFile, algorithm: "sha256" }));

  console.log("\n--- Batería de Búsqueda (Grep) ---");
  await testAction("grep_files (texto exacto)", () => callTool("grep_files", { path: testFile, query: "Gamma" }));
  await testAction("grep_files (regex)", () => callTool("grep_files", { path: testFile, query: "Line\\s+\\d+:\\s+D.*", isRegex: true }));
  await testAction("grep_files (en directorio)", () => callTool("grep_files", { path: "core", query: "createRuntime", include: "*.mjs" }));

  console.log("\n--- Batería de Lectura ---");
  await testAction("read_text_file (completo)", () => callTool("read_text_file", { path: testFile }));
  await testAction("read_text_file (rango startLine/endLine)", () => callTool("read_text_file", { path: testFile, startLine: 2, endLine: 4, includeLineNumbers: true }));
  await testAction("read_text_file (paginado)", () => callTool("read_text_file", { path: testFile, page: 1, linesPerPage: 2 }));
  await testAction("read_file_range", () => callTool("read_file_range", { path: testFile, startLine: 1, endLine: 3 }));
  await testAction("read_multiple_files", () => callTool("read_multiple_files", { paths: [testFile, testJson] }));
  await testAction("read_json", () => callTool("read_json", { path: testJson, key: "app" }));

  console.log("\n--- Batería de Escritura y Edición ---");
  await testAction("append_to_file", () => callTool("append_to_file", { path: testFile, content: "Line 6: Zeta" }));
  await testAction("edit_file (con aliases find/replace)", () => callTool("edit_file", { path: testFile, find: "Line 3: Gamma", replace: "Line 3: Gamma (Edited)" }));
  await testAction("insert_lines", () => callTool("insert_lines", { path: testFile, atLine: 2, lines: ["Line 1.5: Inserted"] }));
  await testAction("delete_lines", () => callTool("delete_lines", { path: testFile, startLine: 2, endLine: 2 }));
  await testAction("json_manager (set/get)", () => callTool("json_manager", { path: testJson, op: "set", key: "version", value: "8.1.1" }));

  console.log("\n--- Batería de CSV & Comparación ---");
  await testAction("write_csv", () => callTool("write_csv", { path: testCsv, headers: ["id", "name", "role"], rows: [["1", "Alice", "Admin"], ["2", "Bob", "User"]] }));
  await testAction("read_csv", () => callTool("read_csv", { path: testCsv }));
  await testAction("file_diff", () => callTool("file_diff", { left: testFile, right: testFile }));

  // Limpieza
  await fs.unlink(testFile).catch(() => {});
  await fs.unlink(testJson).catch(() => {});
  await fs.unlink(testCsv).catch(() => {});

  cp.kill();

  const total = results.length;
  const passed = results.filter(r => r.ok).length;
  const failed = total - passed;

  console.log("\n==================================================");
  console.log(`📊 RESULTADO MCP: ${passed}/${total} ACCIONES EXITOSAS (${failed} fallos)`);
  console.log("==================================================\n");

  process.exit(failed > 0 ? 1 : 0);
}

runMcpFilesSuite().catch(console.error);
