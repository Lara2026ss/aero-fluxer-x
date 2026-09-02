/**
 * FLUXER 8.0 — Integration Test Suite
 * Valida de punta a punta la arquitectura modular, seguridad, dominios y subsistemas.
 */
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

console.log("🧪 Iniciando FLUXER 8.0 Integration Test Suite...");

async function run() {
  const { createRuntime } = await import("../core/runtime.mjs");
  const { Registry } = await import("../core/registry.mjs");
  const { Router } = await import("../core/router.mjs");
  const { runHealthCheck } = await import("../core/health.mjs");

  // 1. Runtime & Config initialization
  console.log("\n[1/8] Verificando Inicialización de Runtime y Config...");
  const runtime = await createRuntime({ root: ROOT, version: "9.0.0", brand: "AERON FLUXER X" });
  assert.ok(runtime.config, "Configuración centralizada debe estar cargada");
  assert.ok(runtime.auditLog, "AuditLog debe estar activo");
  console.log("  ✓ Runtime y Config inicializados correctamente.");

  // 2. Registry & Domains
  console.log("\n[2/8] Verificando Carga de Dominios y Acciones...");
  const registry = new Registry(runtime);
  await registry.load();
  runtime._registry = registry;

  const domains = registry.moduleNames();
  const expectedDomains = ["files", "system", "terminal", "packages", "database", "security", "shortcuts"];
  for (const expected of expectedDomains) {
    assert.ok(domains.includes(expected), `Dominio ${expected} debe estar registrado`);
  }
  // Verificar que dominios eliminados NO estén presentes
  const removedDomains = ["git", "ollama", "web", "browser", "ai", "alero_rooks"];
  for (const removed of removedDomains) {
    assert.ok(!domains.includes(removed), `Dominio ${removed} debe haber sido completamente eliminado`);
  }
  assert.ok(domains.length >= 7, "Deben existir al menos 7 dominios modulares");
  assert.ok(registry.actionCount() >= 120, `Total de acciones (${registry.actionCount()}) >= 120`);
  console.log(`  ✓ ${domains.length} Dominios modulares cargados con un total de ${registry.actionCount()} acciones.`);

  // 3. Router & Execution
  console.log("\n[3/8] Verificando Router e invocación de herramientas...");
  const router = new Router({ runtime, registry });
  const sysInfo = await router.execute("system", "get_system_info", {});
  assert.equal(sysInfo.ok, true, "system.get_system_info debe responder ok: true");
  assert.ok(sysInfo.platform, "system.get_system_info debe incluir platform");
  console.log("  ✓ Router ejecutó acción estándar con respuesta estructurada.");

  // 3b. Terminal Domain (Run, Inline Script, Persistent Sessions, Processes, Background)
  console.log("\n[3b] Verificando Terminal domain (Comandos, Inline Script, Sesiones Persistentes, Procesos)...");
  
  // run_command
  const cmdRes = await registry.resolve("terminal", "run_command").handler({
    command: process.platform === "win32" ? "Write-Output 'fluxer-terminal-ok'" : "echo 'fluxer-terminal-ok'",
  });
  assert.equal(cmdRes.ok, true);
  assert.ok(cmdRes.stdout.includes("fluxer-terminal-ok"));
  assert.ok(typeof cmdRes.durationMs === "number");

  // run_inline_script
  const inlineRes = await registry.resolve("terminal", "run_inline_script").handler({
    code: "console.log(JSON.stringify({ status: 'inline_executed', value: 42 }));",
    language: "javascript",
  });
  assert.equal(inlineRes.ok, true);
  assert.ok(inlineRes.stdout.includes("inline_executed"));

  // create_session & run_session_command
  const sessionRes = await registry.resolve("terminal", "create_session").handler({
    sessionId: "test-sess-1",
    cwd: runtime.dirs.storage,
    env: { FLUXER_CUSTOM_VAR: "active_value" },
  });
  assert.equal(sessionRes.ok, true);

  const runSessRes = await registry.resolve("terminal", "run_session_command").handler({
    sessionId: "test-sess-1",
    command: process.platform === "win32" ? "Write-Output $env:FLUXER_CUSTOM_VAR" : "echo $FLUXER_CUSTOM_VAR",
  });
  assert.equal(runSessRes.ok, true);
  assert.ok(runSessRes.stdout.includes("active_value"));

  // cd navigation in session
  const cdRes = await registry.resolve("terminal", "run_session_command").handler({
    sessionId: "test-sess-1",
    command: "cd ..",
  });
  assert.equal(cdRes.ok, true);

  // list_processes
  const procRes = await registry.resolve("terminal", "list_processes").handler({ limit: 10 });
  assert.equal(procRes.ok, true);
  assert.ok(procRes.processes.length > 0);

  // close_session
  await registry.resolve("terminal", "close_session").handler({ sessionId: "test-sess-1" });
  console.log("  ✓ Terminal domain (comandos, inline script, sesiones, procesos) verificado.");

  // 4. Permission Engine & Security Modes
  console.log("\n[4/8] Verificando Permission Engine y Security Modes...");
  runtime.permissions.setSecurityMode("SAFE");
  assert.equal(runtime.permissions.securityMode, "SAFE");
  const blockedCheck = runtime.permissions.checkSecurityMode("terminal", "run_command");
  assert.equal(blockedCheck.blocked, true, "Modo SAFE debe bloquear terminal.run_command");

  runtime.permissions.setSecurityMode("NORMAL");
  assert.equal(runtime.permissions.securityMode, "NORMAL");
  console.log("  ✓ Modos de seguridad SAFE/NORMAL funcionan y bloquean según perfil.");

  // 5. Secret Masking & Security Boundary
  console.log("\n[5/8] Verificando Secret Masking y Security Boundary...");
  process.env.TEST_SECRET_KEY = "super_secret_token_12345";
  const getEnvRes = await registry.resolve("system", "get_env").handler({ name: "TEST_SECRET_KEY" }, runtime);
  assert.equal(getEnvRes.value, "[CONFIGURED]", "Las claves secretas deben enmascararse");
  assert.equal(getEnvRes.masked, true, "Debe reportar masked: true");
  delete process.env.TEST_SECRET_KEY;
  console.log("  ✓ Secret Manager Boundary verificado.");

  // 6. Files & Document Creation/Reading (.docx, .xlsx, .pdf)
  console.log("\n[6/8] Verificando Files domain & unificación de documentos...");
  const testDocDir = path.join(runtime.dirs.storage, "test_docs");
  await fs.mkdir(testDocDir, { recursive: true });

  const docxPath = path.join(testDocDir, "test.docx");
  const xlsxPath = path.join(testDocDir, "test.xlsx");
  const pdfPath = path.join(testDocDir, "test.pdf");

  // Create docx
  const createDocx = await registry.resolve("files", "create_document").handler({
    path: docxPath,
    title: "Documento de Prueba FLUXER",
    content: "Línea 1 de prueba\nLínea 2 de prueba",
  });
  assert.equal(createDocx.ok, true, "create_document docx debe ser ok");

  // Read docx
  const readDocx = await registry.resolve("files", "read_document").handler({ path: docxPath });
  assert.equal(readDocx.ok, true, "read_document docx debe ser ok");
  assert.equal(readDocx.format, "docx");
  assert.ok(readDocx.content.includes("Documento de Prueba FLUXER"));

  // Create xlsx
  const createXlsx = await registry.resolve("files", "create_document").handler({
    path: xlsxPath,
    title: "Ventas",
    format: "xlsx",
    paragraphs: [["Producto", "Precio"], ["Teclado", 50], ["Monitor", 200]],
  });
  assert.equal(createXlsx.ok, true, "create_document xlsx debe ser ok");

  // Read xlsx
  const readXlsx = await registry.resolve("files", "read_document").handler({ path: xlsxPath });
  assert.equal(readXlsx.ok, true, "read_document xlsx debe ser ok");
  assert.equal(readXlsx.format, "xlsx");
  assert.ok(readXlsx.sheetCount >= 1);

  // Create pdf
  const createPdf = await registry.resolve("files", "create_document").handler({
    path: pdfPath,
    title: "Reporte PDF FLUXER",
    content: "Contenido del PDF generado nativamente.",
    format: "pdf",
  });
  assert.equal(createPdf.ok, true, "create_document pdf debe ser ok");

  // Read pdf
  const readPdf = await registry.resolve("files", "read_document").handler({ path: pdfPath });
  assert.equal(readPdf.ok, true, "read_document pdf debe ser ok");
  assert.equal(readPdf.format, "pdf");
  assert.ok(readPdf.content.includes("Reporte PDF FLUXER"));

  // Cleanup test files
  await fs.rm(testDocDir, { recursive: true, force: true }).catch(() => {});
  console.log("  ✓ Creación y lectura de documentos (.docx, .xlsx, .pdf) verificadas.");

  // 6b. Superior Files & Writing Capabilities (Atomic, Backups, JSON Manager, Line Surgery, CSV, Batch)
  console.log("\n[6b] Verificando Capacidades Superiores de Files (Backups, JSON Manager, Cirugía de Líneas, CSV, Lotes)...");
  const testAdvDir = path.join(runtime.dirs.storage, "test_adv_files");
  await fs.mkdir(testAdvDir, { recursive: true });

  const testTxt = path.join(testAdvDir, "demo.txt");
  const writeRes = await registry.resolve("files", "write_file").handler({
    path: testTxt,
    content: "Línea 1\nLínea 2\nLínea 3",
    backup: true,
  });
  assert.equal(writeRes.ok, true);
  assert.ok(writeRes.checksumSha256);
  assert.equal(writeRes.linesCount, 3);

  // Line surgery: insert_lines, delete_lines, replace_lines, patch_file
  const insRes = await registry.resolve("files", "insert_lines").handler({
    path: testTxt,
    afterLine: 2,
    lines: ["Línea 2.5 (insertada)"],
  });
  assert.equal(insRes.ok, true);
  assert.equal(insRes.totalLines, 4);

  const patchRes = await registry.resolve("files", "patch_file").handler({
    path: testTxt,
    searchBlock: "Línea 2.5 (insertada)",
    replaceBlock: "Línea 2.5 (parcheada)",
  });
  assert.equal(patchRes.ok, true);

  // JSON Manager with dot-notation
  const testJson = path.join(testAdvDir, "config.json");
  await registry.resolve("files", "write_json").handler({
    path: testJson,
    data: { server: { port: 3000, active: true }, stats: { counter: 5 } },
  });

  const jSetRes = await registry.resolve("files", "json_manager").handler({
    path: testJson,
    op: "set",
    key: "server.port",
    value: 8080,
  });
  assert.equal(jSetRes.ok, true);

  const jIncRes = await registry.resolve("files", "json_manager").handler({
    path: testJson,
    op: "increment",
    key: "stats.counter",
    value: 10,
  });
  assert.equal(jIncRes.ok, true);

  const jGetRes = await registry.resolve("files", "json_manager").handler({
    path: testJson,
    op: "get",
    key: "server.port",
  });
  assert.equal(jGetRes.value, 8080);

  const rJsonRes = await registry.resolve("files", "read_json").handler({
    path: testJson,
    key: "stats.counter",
  });
  assert.equal(rJsonRes.data, 15);

  // CSV Engine
  const testCsv = path.join(testAdvDir, "data.csv");
  const wCsvRes = await registry.resolve("files", "write_csv").handler({
    path: testCsv,
    headers: ["id", "nombre", "rol"],
    rows: [
      { id: 1, nombre: "Admin", rol: "super" },
      { id: 2, nombre: "Mau", rol: "owner" },
    ],
  });
  assert.equal(wCsvRes.ok, true);

  const rCsvRes = await registry.resolve("files", "read_csv").handler({ path: testCsv });
  assert.equal(rCsvRes.ok, true);
  assert.equal(rCsvRes.count, 2);
  assert.equal(rCsvRes.records[1].nombre, "Mau");

  // Batch operations
  const batchSrc = path.join(testAdvDir, "batch_src.txt");
  const batchDst = path.join(testAdvDir, "batch_dst.txt");
  await registry.resolve("files", "write_file").handler({ path: batchSrc, content: "batch test" });
  const bCopyRes = await registry.resolve("files", "batch_copy").handler({
    files: [{ source: batchSrc, destination: batchDst }],
  });
  assert.equal(bCopyRes.ok, true);
  assert.equal(bCopyRes.succeeded, 1);

  // Cleanup
  await fs.rm(testAdvDir, { recursive: true, force: true }).catch(() => {});
  console.log("  ✓ Capacidades superiores de Files (atómico, backups, JSON dot-notation, cirugía de líneas, CSV, lotes) validadas.");

  // 7. Database Domain (SQLite queries)
  console.log("\n[7/8] Verificando Database domain (SQLite)...");
  const testDbPath = path.join(runtime.dirs.storage, "test_suite.db");
  const createDbRes = await registry.resolve("database", "create_database").handler({ database: testDbPath });
  assert.equal(createDbRes.ok, true, "create_database debe ser ok");

  const execRes = await registry.resolve("database", "execute_query").handler({
    database: testDbPath,
    query: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO users (name) VALUES ('Alice'), ('Bob');",
  });
  assert.equal(execRes.ok, true, "execute_query CREATE/INSERT debe ser ok");

  const selectRes = await registry.resolve("database", "execute_query").handler({
    database: testDbPath,
    query: "SELECT * FROM users;",
  });
  assert.equal(selectRes.ok, true, "execute_query SELECT debe ser ok");
  assert.ok(selectRes.output.includes("Alice") && selectRes.output.includes("Bob"));

  await registry.resolve("database", "delete_database").handler({ database: testDbPath });
  console.log("  ✓ Database domain (SQLite nativo) ejecutó DDL y DML correctamente.");

  // 8. Health Checker
  console.log("\n[8/8] Verificando Health Checker v8.0...");
  const healthRes = await runHealthCheck({ runtime, registry, config: runtime.config });
  assert.equal(healthRes.ok, true, "Health check requerido debe pasar");
  console.log("  ✓ Health checker completó diagnóstico con resultado positivo.");

  // Cleanup
  await runtime.shutdown("test-complete");
  console.log("\n==================================================");
  console.log("🎉 TODOS LOS TESTS DE INTEGRACIÓN PASARON (8/8)");
  console.log("==================================================\n");
}

run().catch((err) => {
  console.error("\n❌ ERROR EN TEST SUITE:", err);
  process.exit(1);
});
