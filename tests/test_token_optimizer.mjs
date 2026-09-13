import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { expandContent, checkTokenAdvisory, resetAdvisoryCache } from "../core/token-optimizer.mjs";
import { createFilesDomain } from "../tools/files.mjs";

async function runTests() {
  console.log("🧪 Iniciando pruebas de Token Optimizer & Binary Expander...");

  // 1. Test Gzip Decompression
  const originalLargeText = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(50);
  const gzippedBase64 = zlib.gzipSync(Buffer.from(originalLargeText, "utf8")).toString("base64");
  const expandedGzip = expandContent({ content: gzippedBase64, encoding: "gzip" });
  assert.equal(expandedGzip, originalLargeText, "Gzip expansion must match original text");
  console.log("  ✓ Gzip base64 expansión verificada (De " + gzippedBase64.length + " chars a " + expandedGzip.length + " chars)");

  // 2. Test Deflate Decompression
  const deflatedBase64 = zlib.deflateSync(Buffer.from(originalLargeText, "utf8")).toString("base64");
  const expandedDeflate = expandContent({ content: deflatedBase64, encoding: "deflate" });
  assert.equal(expandedDeflate, originalLargeText, "Deflate expansion must match original text");
  console.log("  ✓ Deflate base64 expansión verificada");

  // 3. Test Binary Bitstring
  const bitString = "01001000 01101111 01101100 01100001 00100000 01001101 01110101 01101110 01100100 01101111"; // 'Hola Mundo'
  const expandedBits = expandContent({ content: bitString, encoding: "bin" });
  assert.equal(expandedBits, "Hola Mundo", "Bitstring expansion must match Hola Mundo");
  console.log("  ✓ Binary bitstring (0s y 1s) expansión verificada: " + expandedBits);

  // 4. Test Numbers / Bytes
  const numbersArray = [72, 111, 108, 97, 32, 70, 108, 117, 120, 101, 114]; // 'Hola Fluxer'
  const expandedNums = expandContent({ numbers: numbersArray });
  assert.equal(expandedNums, "Hola Fluxer", "Numbers array expansion must match Hola Fluxer");
  console.log("  ✓ Numbers array expansión verificada: " + expandedNums);

  // 5. Test Template & Macros
  const templateStr = "HEADER: $PROJ\nAUTHOR: $AUTH\nDESCRIPTION: {{DESC}}";
  const expandedTemplate = expandContent({
    template: templateStr,
    macros: {
      "$PROJ": "Fluxer Core v11.0.7",
      "$AUTH": "Antigravity AI",
      "{{DESC}}": "Ultra-optimized system"
    }
  });
  assert(expandedTemplate.includes("Fluxer Core v11.0.7"), "Template macro substitution failed");
  console.log("  ✓ Template & Macros expansión verificada");

  // 6. Test Repeat Generator
  const expandedRepeat = expandContent({ repeat: { pattern: "ABC-", times: 10 } });
  assert.equal(expandedRepeat, "ABC-".repeat(10), "Repeat expansion failed");
  console.log("  ✓ Repeat pattern expansión verificada");

  // 7. Test Predefined Boilerplate
  const license = expandContent({ boilerplate: "mit_license" });
  assert(license.includes("MIT License"), "Boilerplate MIT License failed");
  console.log("  ✓ Boilerplate nativo verificado");

  // 8. Test Advisory Gate Logic
  resetAdvisoryCache();
  const testLongText = "A".repeat(300);

  // Primer llamado sin comprimir: debe dar advertencia rápida
  const adv1 = checkTokenAdvisory({ action: "write_file", target: "test.txt", content: testLongText });
  assert.equal(adv1.shouldProceed, false, "First call with long text must trigger advisory");
  assert.equal(adv1.response.advisory, "TOKEN_COMPRESSION_NOTICE", "Advisory notice type mismatch");
  console.log("  ✓ Primer llamado: emite advertencia rápida correctamente");

  // Segundo llamado idéntico: debe proceder automáticamente
  const adv2 = checkTokenAdvisory({ action: "write_file", target: "test.txt", content: testLongText });
  assert.equal(adv2.shouldProceed, true, "Second call must proceed automatically");
  assert.equal(adv2.wasRetry, true, "Second call must be marked as retry");
  console.log("  ✓ Segundo llamado: procede automáticamente sin volver a advertir");

  // Con skip_advisory: true debe proceder en el primer intento
  resetAdvisoryCache();
  const advSkip = checkTokenAdvisory({ action: "write_file", target: "test.txt", content: testLongText, skip_advisory: true });
  assert.equal(advSkip.shouldProceed, true, "skip_advisory: true must proceed immediately");
  console.log("  ✓ skip_advisory: true procede inmediatamente");

  // Con encoding: 'gzip' debe proceder sin advertencia
  resetAdvisoryCache();
  const advGzip = checkTokenAdvisory({ action: "write_file", target: "test.txt", content: gzippedBase64, encoding: "gzip" });
  assert.equal(advGzip.shouldProceed, true, "gzip encoding must proceed immediately");
  console.log("  ✓ encoding: gzip procede inmediatamente sin advertencia");

  // 9. Integración directa con tools/files.mjs
  console.log("\n🧪 Probando integración directa en tools/files.mjs...");
  const dummyRuntime = {
    hp: (p) => path.resolve(p),
    shellQuote: (s) => s,
    dirs: { root: process.cwd(), storage: path.join(process.cwd(), "storage") },
    permissions: { currentLevel: () => "admintotaluser" }
  };
  const dummyDomain = (name, desc, actions, perms) => ({ name, desc, actions, perms });
  const helpers = {
    getDirectoryTreeHelper: () => {},
    searchFilesHelper: () => {},
    grepFilesHelper: () => {},
    generateSimpleDiff: () => {},
    splitLines: (s) => s.split("\n")
  };

  const domain = createFilesDomain({
    runtime: dummyRuntime,
    path,
    fs,
    crypto,
    domain: dummyDomain,
    helpers
  });

  const testFile = path.resolve("storage", "token_opt_test.txt");
  await fs.mkdir(path.dirname(testFile), { recursive: true });
  resetAdvisoryCache();

  // Primer write_file con texto plano largo (> 150 chars):
  const rawLongText = "Texto plano largo de prueba para simular archivos de código extensos. ".repeat(10);
  const writeRes1 = await domain.actions.write_file({ path: testFile, content: rawLongText });
  assert.equal(writeRes1.ok, false, "Primer write_file debe advertir con ok: false");
  assert.equal(writeRes1.advisory, "TOKEN_COMPRESSION_NOTICE");
  console.log("  ✓ files.write_file emite advertencia de ahorro de tokens en 1er intento");

  // Segundo write_file idéntico:
  const writeRes2 = await domain.actions.write_file({ path: testFile, content: rawLongText });
  assert.equal(writeRes2.ok, true, "Segundo write_file debe proceder limpiamente");
  const readBack = await fs.readFile(testFile, "utf8");
  assert.equal(readBack, rawLongText, "Contenido escrito debe coincidir");
  console.log("  ✓ files.write_file procede y escribe en 2do intento automático");

  // write_file con gzip:
  const gzContent = zlib.gzipSync(Buffer.from("Contenido super comprimido con GZIP", "utf8")).toString("base64");
  const writeGz = await domain.actions.write_file({ path: testFile, content: gzContent, encoding: "gzip", overwrite: true });
  assert.equal(writeGz.ok, true);
  const readGz = await fs.readFile(testFile, "utf8");
  assert.equal(readGz, "Contenido super comprimido con GZIP");
  console.log("  ✓ files.write_file descomprime gzip y escribe contenido real en disco");

  // 10. Desactivación Permanente y Toggle
  console.log("\n🧪 Probando Toggle y Desactivación Permanente...");
  // a) Desactivar mediante token_advisory({ enabled: false })
  const offRes = await domain.actions.token_advisory({ enabled: false });
  assert.equal(offRes.advisory_disabled, true, "Advisory debe quedar desactivado permanentemente");
  console.log("  ✓ files.token_advisory({ enabled: false }) desactiva el aviso permanentemente");

  // b) Ahora un write_file con texto plano largo en 1er intento debe escribir SIN emitir advertencia
  resetAdvisoryCache();
  const writeNoAdv = await domain.actions.write_file({ path: testFile, content: rawLongText, overwrite: true });
  assert.equal(writeNoAdv.ok, true, "Debe escribir de inmediato sin advertencia al estar desactivado");
  console.log("  ✓ Con aviso desactivado, write_file procede en el primer intento sin interrupciones");

  // c) Toggle para reactivar
  const toggleRes = await domain.actions.token_advisory({ toggle: true });
  assert.equal(toggleRes.advisory_enabled, true, "Toggle debe reactivar el aviso");
  console.log("  ✓ files.token_advisory({ toggle: true }) reactiva el aviso");

  // d) Desactivación in-situ con disable_advisory_permanently: true
  resetAdvisoryCache();
  const writeInSitu = await domain.actions.write_file({
    path: testFile,
    content: rawLongText,
    overwrite: true,
    disable_advisory_permanently: true
  });
  assert.equal(writeInSitu.ok, true, "disable_advisory_permanently debe escribir de inmediato");
  const statusAfter = await domain.actions.token_advisory();
  assert.equal(statusAfter.advisory_disabled, true, "Debe quedar permanentemente desactivado tras disable_advisory_permanently");
  console.log("  ✓ write_file({ disable_advisory_permanently: true }) desactiva avisos futuros");

  // Cleanup
  await fs.unlink(testFile).catch(() => {});

  console.log("\n🎉 TODAS LAS PRUEBAS DE TOKEN OPTIMIZER & FILES INTEGRATION PASARON CON ÉXITO.");
}

runTests().catch(err => {
  console.error("❌ Error en pruebas:", err);
  process.exit(1);
});
