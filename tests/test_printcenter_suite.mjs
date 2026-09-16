/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🧪 FLUXER TEST SUITE — tests/test_printcenter_suite.mjs
 * Validación exhaustiva del Centro de Impresión Nativo de Windows (printcenter)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Regla de Oro: NUNCA imprimir a hardware físico en tests automatizados.
 * Todas las pruebas de impresión real se ejecutan contra 'Microsoft Print to PDF'
 * con verificación determinista del archivo PDF generado en disco.
 */

import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";
import { createRuntime } from "../core/runtime.mjs";
import { parsePageRange, negotiateCapabilities } from "../tools/printcenter.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (!condition) {
    console.error(`  ✗ FALLÓ: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
  passed++;
}

async function runTests() {
  console.log("==================================================");
  console.log("🚀 INICIANDO TEST SUITE: FLUXER X PRINTCENTER");
  console.log("==================================================");

  const runtime = await createRuntime({ root: ROOT });
  const registry = new Registry({ runtime, root: ROOT });
  await registry.load();
  const router = new Router({ registry, runtime });

  // ── TEST 1: Registro en Registry y Metadatos ──────────────────────────────
  console.log("\n[1/10] Verificando registro modular de printcenter...");
  const modules = registry.moduleNames();
  assert(modules.includes("printcenter"), "Dominio 'printcenter' está registrado en el Registry");
  const actions = registry.actionsFor("printcenter");
  assert(actions.includes("list_printers"), "Acción 'list_printers' expuesta");
  assert(actions.includes("get_printer"), "Acción 'get_printer' expuesta");
  assert(actions.includes("search_printers"), "Acción 'search_printers' expuesta");
  assert(actions.includes("manual"), "Acción 'manual' expuesta");
  assert(actions.includes("preflight"), "Acción 'preflight' expuesta");
  assert(actions.includes("print"), "Acción 'print' expuesta");
  assert(actions.includes("jobs"), "Acción 'jobs' expuesta");

  // ── TEST 2: Enrutamiento y Resolución Canónica de Alias ───────────────────
  console.log("\n[2/10] Verificando router y resolución de alias legados...");
  const aliasPrinter = await router.execute({ tool: "printer", action: "list", args: {} });
  assert(aliasPrinter.ok === true, "Alias 'printer { action: list }' resuelve a printcenter.list_printers");

  const aliasImpresora = await router.execute({ tool: "impresora", args: {} });
  assert(aliasImpresora.ok === true, "Alias 'impresora' resuelve a printcenter.list_printers");

  const aliasImprimir = await router.execute({ tool: "imprimir", args: {} });
  assert(aliasImprimir.ok === true, "Alias 'imprimir' resuelve a printcenter");

  // ── TEST 3: Parser Defensivo de Rango de Páginas ──────────────────────────
  console.log("\n[3/10] Verificando parser defensivo de rango de páginas...");
  assert(JSON.stringify(parsePageRange("1")) === "[1]", "Parseo de página única ('1')");
  assert(JSON.stringify(parsePageRange("1, 4, 6")) === "[1,4,6]", "Parseo de páginas separadas ('1, 4, 6')");
  assert(JSON.stringify(parsePageRange("1-3, 5, 8")) === "[1,2,3,5,8]", "Parseo de rangos combinados ('1-3, 5, 8')");
  assert(JSON.stringify(parsePageRange("all", 4)) === "[1,2,3,4]", "Parseo de 'all' con totalPages=4");

  // Validación de rechazos controlados
  let rejected0 = false;
  try { parsePageRange("0"); } catch (e) { rejected0 = e.code === "INVALID_PAGE_RANGE"; }
  assert(rejected0, "Rechazo controlado de página 0");

  let rejectedInv = false;
  try { parsePageRange("5-2"); } catch (e) { rejectedInv = e.code === "INVALID_PAGE_RANGE"; }
  assert(rejectedInv, "Rechazo controlado de rango invertido '5-2'");

  let rejectedDoubleComma = false;
  try { parsePageRange("1,,4"); } catch (e) { rejectedDoubleComma = e.code === "INVALID_PAGE_RANGE"; }
  assert(rejectedDoubleComma, "Rechazo controlado de comas consecutivas '1,,4'");

  let rejectedOutOfRange = false;
  try { parsePageRange("1, 7", 5); } catch (e) { rejectedOutOfRange = e.code === "PAGE_OUT_OF_RANGE"; }
  assert(rejectedOutOfRange, "Rechazo controlado de página fuera de límites (7 > 5)");

  // ── TEST 4: list_printers (Descubrimiento en Vivo) ────────────────────────
  console.log("\n[4/10] Verificando printcenter.list_printers...");
  const listRes = await router.execute({ tool: "printcenter", action: "list_printers", args: {} });
  assert(listRes.ok === true, "list_printers retornó ok: true");
  assert(Array.isArray(listRes.printers) && listRes.printers.length > 0, `Impresoras detectadas: ${listRes.count}`);
  
  const hasPdfPrinter = listRes.printers.some((p) => p.name.includes("PDF"));
  assert(hasPdfPrinter, "Controlador 'Microsoft Print to PDF' detectado en Windows");

  const hpPrinter = listRes.printers.find((p) => p.name.includes("HP Lara Smart Tank") || p.name.includes("Smart Tank"));
  if (hpPrinter) {
    console.log(`     Dispositivo físico detectado: '${hpPrinter.name}' (Estado: ${hpPrinter.status}, Puerto: ${hpPrinter.port_name})`);
  } else {
    console.log("     (HP Lara Smart Tank no está instalada en este equipo; entorno genérico de CI)");
  }

  // ── TEST 5: get_printer (Capacidades Reales de Driver) ─────────────────────
  console.log("\n[5/10] Verificando printcenter.get_printer y capacidades...");
  const targetPrinter = hpPrinter ? hpPrinter.name : "Microsoft Print to PDF";
  const capsRes = await router.execute({ tool: "printcenter", action: "get_printer", args: { printer: targetPrinter } });
  assert(capsRes.ok === true, `get_printer exitoso para '${targetPrinter}'`);
  assert(Array.isArray(capsRes.paper_sizes) && capsRes.paper_sizes.length > 0, `Formatos de papel reportados: ${capsRes.paper_sizes.length}`);
  assert(Array.isArray(capsRes.resolutions) && capsRes.resolutions.length > 0, `Resoluciones DPI reportadas: ${capsRes.resolutions.length}`);
  assert(typeof capsRes.supports_color === "boolean", "Soporte de color booleano explícito");

  // ── TEST 6: Negociación de Capacidades ─────────────────────────────────────
  console.log("\n[6/10] Verificando negociación de capacidades...");
  const validNeg = negotiateCapabilities({
    paper_size: "Carta",
    color: true,
    copies: 2,
  }, capsRes);
  assert(validNeg.valid === true, "Negociación válida aceptó opciones compatibles");
  assert(validNeg.effective.copies === 2, "Copias normalizadas a 2");

  const invalidDpiNeg = negotiateCapabilities({
    dpi: 99999,
  }, capsRes);
  assert(invalidDpiNeg.valid === false, "Negociación rechazó DPI inexistente (99999)");
  assert(invalidDpiNeg.rejections[0]?.code === "UNSUPPORTED_PRINTER_RESOLUTION", "Código de error estructurado UNSUPPORTED_PRINTER_RESOLUTION");

  // ── TEST 7: search_printers (Red Local y WSD) ──────────────────────────────
  console.log("\n[7/10] Verificando printcenter.search_printers...");
  const searchRes = await router.execute({ tool: "printcenter", action: "search_printers", args: {} });
  assert(searchRes.ok === true, "search_printers retornó ok: true");
  assert(Array.isArray(searchRes.discovered_printers), "Lista de impresoras descubiertas retornada");

  // ── TEST 8: manual (Base de Conocimiento HP, Canon, Epson, Brother) ────────
  console.log("\n[8/10] Verificando printcenter.manual...");
  const hpManual = await router.execute({ tool: "printcenter", action: "manual", args: { brand: "hp" } });
  assert(hpManual.ok === true, "Manual HP consultado exitosamente");
  assert(hpManual.guide.brand_name.includes("HP"), "Guía especializada para HP encontrada");
  assert(Array.isArray(hpManual.guide.connection?.wifi_setup), "Instrucciones de Wi-Fi y WPS incluidas");

  const canonManual = await router.execute({ tool: "printcenter", action: "manual", args: { brand: "canon" } });
  assert(canonManual.ok === true, "Manual Canon consultado exitosamente");

  // ── TEST 9: preflight (Dry-Run Sin Imprimir Físicamente) ───────────────────
  console.log("\n[9/10] Verificando printcenter.preflight (dry-run seguro)...");
  const tempTestFile = path.join(os.tmpdir(), "fluxer_preflight_sample.txt");
  await fs.writeFile(tempTestFile, "Línea de prueba para preflight\nSegunda línea\nTercera línea", "utf8");

  const preflightRes = await router.execute({
    tool: "printcenter",
    action: "preflight",
    args: {
      printer: targetPrinter,
      file: tempTestFile,
      pages: "1",
      copies: 1,
    },
  });

  assert(preflightRes.ok === true, "preflight retornó ok: true");
  assert(preflightRes.will_print === false, "preflight garantiza will_print: false (cero gasto físico)");
  assert(preflightRes.valid === true, "Documento y opciones validados");
  assert(preflightRes.printer === targetPrinter, "Impresora destino confirmada en preflight");

  // ── TEST 10: Impresión Real Headless contra Microsoft Print to PDF ─────────
  console.log("\n[10/10] Verificando seguridad y printcenter.print headless contra Microsoft Print to PDF...");
  const targetPdfFile = path.join(os.tmpdir(), `fluxer_test_output_${Date.now()}.pdf`);
  if (existsSync(targetPdfFile)) await fs.unlink(targetPdfFile);

  // 10.A: Validar que una llamada sin autorización avanzada requiere confirmación
  const unconfirmedRes = await router.execute({
    tool: "printcenter",
    action: "print",
    args: {
      printer: "Microsoft Print to PDF",
      file: tempTestFile,
      pages: "1",
      copies: 1,
      output_pdf: targetPdfFile,
    },
  });

  assert(unconfirmedRes.code === "CONFIRMATION_REQUIRED", "Capa de seguridad interceptó printcenter.print sin confirmación/elevación previa");

  // 10.B: Otorgar nivel 'advanced' legítimo para la sesión de trabajo
  runtime.permissions.startWorkflow({ level: "advanced", durationMinutes: 5 });

  const printRes = await router.execute({
    tool: "printcenter",
    action: "print",
    args: {
      printer: "Microsoft Print to PDF",
      file: tempTestFile,
      pages: "1",
      copies: 1,
      output_pdf: targetPdfFile,
    },
  });

  assert(printRes.ok === true, "print retornó ok: true tras autorización avanzada");
  assert(printRes.submitted === true, "print reportó submitted: true");
  assert(existsSync(targetPdfFile), `Archivo PDF de salida generado físicamente: ${targetPdfFile}`);

  const pdfStat = await fs.stat(targetPdfFile);
  assert(pdfStat.size > 1000, `Tamaño de archivo PDF válido: ${pdfStat.size} bytes`);

  // Validar cabecera mágica %PDF-
  const pdfHeaderBuf = Buffer.alloc(5);
  const pdfFd = await fs.open(targetPdfFile, "r");
  await pdfFd.read(pdfHeaderBuf, 0, 5, 0);
  await pdfFd.close();
  const isPdf = pdfHeaderBuf.toString("ascii") === "%PDF-";
  assert(isPdf, "Cabecera binaria mágica %PDF- confirmada en el archivo de salida");

  // Inspección de cola
  const jobsRes = await router.execute({ tool: "printcenter", action: "jobs", args: {} });
  assert(jobsRes.ok === true, "printcenter.jobs consultó la cola del spooler de Windows");

  // Limpieza de archivos de prueba
  await fs.unlink(tempTestFile).catch(() => {});
  await fs.unlink(targetPdfFile).catch(() => {});

  console.log("==================================================");
  console.log(`🎉 TODOS LOS TESTS DE PRINTCENTER PASARON EXITOSAMENTE (${passed}/${total})`);
  console.log("==================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Error crítico en suite de printcenter:", err);
  process.exit(1);
});
