/**
 * Test de Verificación Quirúrgica para Fallos Reportados en Files
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function testFilesFixes() {
  console.log("🔍 Probando correcciones específicas de FLUXER:files...");

  const { createRuntime } = await import("../core/runtime.mjs");
  const { Registry } = await import("../core/registry.mjs");

  const runtime = await createRuntime({ root: ROOT, version: "8.1.1", brand: "FLUXER" });
  const registry = new Registry(runtime);
  await registry.load();
  runtime._registry = registry;

  const filesDomain = registry.modules.get("files");
  assert.ok(filesDomain, "Dominio files debe existir");

  // Crear archivo de prueba grande (6000 líneas)
  const testFilePath = path.join(ROOT, "storage", "test_large_file.html");
  await fs.mkdir(path.dirname(testFilePath), { recursive: true });

  const testLines = [];
  testLines.push("<!DOCTYPE html><html><head>");
  for (let i = 2; i <= 126; i++) testLines.push(`<div>Filler line ${i}</div>`);
  testLines.push('  <div class="hero-video-container" id="hero-video">');
  for (let i = 128; i <= 2000; i++) testLines.push(`  <p>Content line ${i}</p>`);
  testLines.push("  <script>");
  testLines.push("    function initStaff() {");
  testLines.push("      const StaffModule = { name: 'StaffSystem' };");
  testLines.push("      return StaffModule;");
  testLines.push("    }");
  testLines.push("  </script>");
  for (let i = 2008; i <= 6000; i++) testLines.push(`  <!-- Line ${i} -->`);
  testLines.push("</html>");

  await fs.writeFile(testFilePath, testLines.join("\r\n"), "utf8");

  // 1. Probar grep_files en ARCHIVO INDIVIDUAL DIRECTO
  console.log("\n[1/6] Test grep_files en archivo individual (5000+ líneas)...");
  
  // Buscar 'hero-video'
  const grep1 = await filesDomain.actions.grep_files({ path: testFilePath, query: "hero-video" });
  assert.equal(grep1.ok, true, "grep_files debe retornar ok: true");
  assert.equal(grep1.count, 1, "Debe encontrar 1 match para hero-video");
  assert.equal(grep1.matches[0].lineNumber, 127, "hero-video debe estar en línea 127");
  console.log("  ✓ Match 'hero-video' encontrado en línea 127.");

  // Buscar '<script>'
  const grep2 = await filesDomain.actions.grep_files({ path: testFilePath, query: "<script>" });
  assert.equal(grep2.ok, true);
  assert.equal(grep2.count, 1);
  assert.equal(grep2.matches[0].lineNumber, 2001);
  console.log("  ✓ Match '<script>' encontrado en línea 2001.");

  // Buscar 'StaffModule'
  const grep3 = await filesDomain.actions.grep_files({ path: testFilePath, query: "StaffModule" });
  assert.equal(grep3.ok, true);
  assert.equal(grep3.count, 2);
  console.log("  ✓ Match 'StaffModule' encontrado (2 coincidencias).");

  // 2. Probar grep_files con regex
  console.log("\n[2/6] Test grep_files con isRegex: true...");
  const grepRegex = await filesDomain.actions.grep_files({
    path: testFilePath,
    query: "function\\s+\\w+\\(",
    isRegex: true,
  });
  assert.equal(grepRegex.ok, true);
  assert.equal(grepRegex.count, 1);
  assert.equal(grepRegex.matches[0].lineNumber, 2002);
  console.log("  ✓ Match regex 'function initStaff(' encontrado en línea 2002.");

  // 3. Probar read_text_file con startLine y endLine
  console.log("\n[3/6] Test read_text_file con startLine/endLine...");
  const readRange = await filesDomain.actions.read_text_file({
    path: testFilePath,
    startLine: 125,
    endLine: 129,
    includeLineNumbers: true,
  });
  assert.equal(readRange.ok, true);
  assert.equal(readRange.linesReturned, 5);
  assert.ok(readRange.content.includes("127:   <div class=\"hero-video-container\" id=\"hero-video\">"));
  console.log("  ✓ read_text_file retornó exactamente el rango 125-129 con números de línea.");

  // 4. Probar read_text_file con paginación
  console.log("\n[4/6] Test read_text_file con page/linesPerPage...");
  const readPage = await filesDomain.actions.read_text_file({
    path: testFilePath,
    page: 2,
    linesPerPage: 50,
  });
  assert.equal(readPage.ok, true);
  assert.equal(readPage.page, 2);
  assert.equal(readPage.linesPerPage, 50);
  assert.equal(readPage.linesReturned, 50);
  assert.equal(readPage.hasMore, true);
  assert.equal(readPage.nextPage, 3);
  console.log("  ✓ read_text_file paginó con hasMore: true y nextPage: 3.");

  // 5. Probar read_file_range con includeLineNumbers
  console.log("\n[5/6] Test read_file_range...");
  const rfr = await filesDomain.actions.read_file_range({
    path: testFilePath,
    startLine: 2000,
    endLine: 2005,
    includeLineNumbers: true,
  });
  assert.equal(rfr.ok, true);
  assert.equal(rfr.linesCount, 6);
  assert.ok(rfr.content.includes("2001:   <script>"));
  console.log("  ✓ read_file_range leyó líneas 2000-2005 con formato.");

  // 6. Probar edit_file con normalización multilínea CRLF/LF
  console.log("\n[6/6] Test edit_file multilínea con CRLF/LF...");
  const oldSnippet = "    function initStaff() {\n      const StaffModule = { name: 'StaffSystem' };";
  const newSnippet = "    function initStaffV2() {\n      const StaffModule = { name: 'StaffSystemV2', active: true };";

  const editRes = await filesDomain.actions.edit_file({
    path: testFilePath,
    find: oldSnippet,
    replace: newSnippet,
  });
  assert.equal(editRes.ok, true, "edit_file debe aceptar aliases find/replace y normalizar CRLF");
  assert.equal(editRes.replacementsCount, 1);

  // Verificar que el reemplazo se guardó correctamente
  const verifyEdit = await filesDomain.actions.grep_files({ path: testFilePath, query: "StaffSystemV2" });
  assert.equal(verifyEdit.ok, true);
  assert.equal(verifyEdit.count, 1);
  console.log("  ✓ edit_file reemplazó fragmento multilínea tolerando saltos de línea.");

  // Limpieza
  await fs.unlink(testFilePath).catch(() => {});
  await runtime.shutdown("test-complete");

  console.log("\n==================================================");
  console.log("🎉 TODOS LOS CASOS DE PRUEBA DE FILES PASARON AL 100%");
  console.log("==================================================\n");
}

testFilesFixes().catch((err) => {
  console.error("❌ ERROR EN TEST:", err);
  process.exit(1);
});
