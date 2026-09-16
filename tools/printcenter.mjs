/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🖨️ FLUXER CORE MCP — tools/printcenter.mjs
 * Centro Inteligente de Impresión y Gestión de Impresoras para Windows
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Capacidades Principales:
 *  1. list_printers   — Listado exhaustivo de impresoras (estado, driver, puerto, cola).
 *  2. get_printer     — Inspección en vivo de capacidades reales (tamaños de papel, DPIs, color).
 *  3. search_printers — Descubrimiento en red local (WSD, TCP/IP, mDNS).
 *  4. manual          — Base de conocimiento estructurada para HP, Canon, Epson, Brother y Windows.
 *  5. preflight       — Dry-run / validación previa sin imprimir físicamente.
 *  6. configure       — Ajuste controlado de preferencias por defecto (Set-PrintConfiguration).
 *  7. print           — Impresión real de archivos (PDF nativo WinRT, imágenes, texto) con
 *                       selección de páginas (Google-style: "1, 4-6"), copias, resolución y escala.
 *  8. jobs            — Monitoreo de la cola de impresión del spooler de Windows.
 *  9. cancel_job      — Cancelación de trabajo específico por ID.
 * 10. purge_queue     — Purga explícita y segura de la cola de impresión.
 */

import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";

// ── 1. PARSER DEFENSIVO DE RANGOS DE PÁGINAS ──────────────────────────────────
export function parsePageRange(rangeStr, totalPages = null) {
  if (!rangeStr || typeof rangeStr !== "string") {
    if (totalPages !== null && totalPages > 0) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    return [1];
  }

  const raw = rangeStr.trim().toLowerCase();
  if (["all", "todas", "todo", "*"].includes(raw)) {
    if (totalPages !== null && totalPages > 0) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    return null; // Representa todas las páginas disponibles
  }

  // Rechazar separadores vacíos consecutivos ("1,,4") o caracteres ilegales
  if (raw.includes(",,") || /[^0-9,\s\-]/.test(raw)) {
    const err = new Error(`Formato de rango de páginas inválido: '${rangeStr}'. Use formato como '1', '1,4' o '1-3,5'.`);
    err.code = "INVALID_PAGE_RANGE";
    throw err;
  }

  const tokens = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (tokens.length === 0) {
    const err = new Error("El rango de páginas no contiene números válidos.");
    err.code = "INVALID_PAGE_RANGE";
    throw err;
  }

  const pageSet = new Set();

  for (const token of tokens) {
    if (token.includes("-")) {
      const parts = token.split("-").map((s) => s.trim());
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        const err = new Error(`Rango incompleto o inválido: '${token}'.`);
        err.code = "INVALID_PAGE_RANGE";
        throw err;
      }
      const start = parseInt(parts[0], 10);
      const end = parseInt(parts[1], 10);

      if (isNaN(start) || isNaN(end) || start <= 0 || end <= 0) {
        const err = new Error(`Los números de página deben ser enteros positivos: '${token}'.`);
        err.code = "INVALID_PAGE_RANGE";
        throw err;
      }
      if (start > end) {
        const err = new Error(`Rango invertido no permitido ('${token}'). El inicio (${start}) debe ser menor o igual que el fin (${end}).`);
        err.code = "INVALID_PAGE_RANGE";
        throw err;
      }

      for (let p = start; p <= end; p++) {
        pageSet.add(p);
      }
    } else {
      const page = parseInt(token, 10);
      if (isNaN(page) || page <= 0) {
        const err = new Error(`Número de página inválido: '${token}'. Debe ser un entero positivo.`);
        err.code = "INVALID_PAGE_RANGE";
        throw err;
      }
      pageSet.add(page);
    }
  }

  const sortedPages = Array.from(pageSet).sort((a, b) => a - b);

  if (totalPages !== null && totalPages > 0) {
    for (const p of sortedPages) {
      if (p > totalPages) {
        const err = new Error(`Página solicitada (${p}) fuera de rango. El documento sólo contiene ${totalPages} páginas.`);
        err.code = "PAGE_OUT_OF_RANGE";
        err.details = { requested_page: p, total_document_pages: totalPages };
        throw err;
      }
    }
  }

  return sortedPages;
}

// ── 2. NEGOCIACIÓN DETERMINISTA DE CAPACIDADES ────────────────────────────────
export function negotiateCapabilities(requested, capabilities) {
  const effective = {};
  const rejections = [];

  // Papel
  if (requested.paper_size) {
    const reqP = String(requested.paper_size).trim().toLowerCase();
    const availablePapers = capabilities.paper_sizes || [];
    const matched = availablePapers.find((p) => {
      const name = String(p.name).toLowerCase();
      if (name === reqP) return true;
      if (reqP === "carta" && (name.includes("letter") || name.includes("carta"))) return true;
      if (reqP === "letter" && (name.includes("letter") || name.includes("carta"))) return true;
      if (reqP === "a4" && name.includes("a4")) return true;
      if (reqP === "oficio" && (name.includes("legal") || name.includes("oficio"))) return true;
      if (reqP === "legal" && (name.includes("legal") || name.includes("oficio"))) return true;
      return false;
    });

    if (matched) {
      effective.paper_size = matched.name;
    } else {
      const supportedNames = availablePapers.map((p) => p.name).slice(0, 8);
      rejections.push({
        setting: "paper_size",
        requested: requested.paper_size,
        code: "UNSUPPORTED_PAPER_SIZE",
        message: `El tamaño de papel '${requested.paper_size}' no está soportado por '${capabilities.printer_name}'.`,
        supported: supportedNames,
      });
    }
  } else if (capabilities.active_config?.paper_size) {
    effective.paper_size = capabilities.active_config.paper_size;
  }

  // Color
  if (requested.color !== undefined) {
    const wantsColor = Boolean(
      requested.color === true ||
      requested.color === "color" ||
      requested.color === "Color"
    );
    if (wantsColor && !capabilities.supports_color) {
      rejections.push({
        setting: "color",
        requested: "Color",
        code: "UNSUPPORTED_COLOR_MODE",
        message: `La impresora '${capabilities.printer_name}' es monocromática y no admite impresión a color.`,
        supported: ["Monochrome"],
      });
    } else {
      effective.color_mode = wantsColor ? "Color" : "Monochrome";
    }
  } else {
    effective.color_mode = capabilities.active_config?.color ? "Color" : "Monochrome";
  }

  // Resolución / Calidad (DPI & Calidades: alta, estandar, basica)
  if (requested.dpi || requested.quality) {
    let reqDpi = 0;
    let qualityMode = null;
    const resolutions = capabilities.resolutions || [];
    const validDpis = resolutions.map((r) => r.x).filter(Boolean);

    if (typeof requested.quality === "string") {
      const q = requested.quality.toLowerCase().trim();
      if (q === "alta" || q === "high" || q === "optima" || q === "foto" || q === "photo") {
        qualityMode = "alta";
        reqDpi = validDpis.length > 0 ? Math.max(...validDpis) : 600;
      } else if (q === "basica" || q === "draft" || q === "borrador" || q === "economica" || q === "low") {
        qualityMode = "basica";
        reqDpi = validDpis.length > 0 ? Math.min(...validDpis) : 300;
      } else if (q === "estandar" || q === "standard" || q === "normal" || q === "media") {
        qualityMode = "estandar";
        if (validDpis.includes(600)) reqDpi = 600;
        else if (validDpis.includes(300)) reqDpi = 300;
        else reqDpi = validDpis[Math.floor(validDpis.length / 2)] || 300;
      } else if (q.includes("600")) {
        reqDpi = 600;
      } else if (q.includes("300")) {
        reqDpi = 300;
      } else if (q.includes("1200")) {
        reqDpi = 1200;
      }
    }

    if (!reqDpi && requested.dpi) {
      if (typeof requested.dpi === "number") reqDpi = requested.dpi;
      else if (typeof requested.dpi === "string") reqDpi = parseInt(requested.dpi, 10) || 0;
    }

    if (reqDpi > 0) {
      const matchedRes = resolutions.find((r) => r.x === reqDpi || (r.x === reqDpi && r.y === reqDpi));
      if (matchedRes) {
        effective.dpi_x = matchedRes.x;
        effective.dpi_y = matchedRes.y;
        effective.quality = qualityMode || (matchedRes.x >= 600 ? "alta" : matchedRes.x <= 300 ? "basica" : "estandar");
      } else {
        const supportedDpis = resolutions.map((r) => r.name);
        rejections.push({
          setting: "dpi",
          requested: reqDpi,
          code: "UNSUPPORTED_PRINTER_RESOLUTION",
          message: `La resolución '${reqDpi} PPP' no está entre las opciones soportadas por el controlador.`,
          supported: supportedDpis,
        });
      }
    }
  } else {
    effective.quality = "estandar";
  }

  // Dúplex
  if (requested.duplex) {
    if (!capabilities.can_duplex && requested.duplex !== "OneSided") {
      rejections.push({
        setting: "duplex",
        requested: requested.duplex,
        code: "UNSUPPORTED_DUPLEX",
        message: `La impresora '${capabilities.printer_name}' no tiene unidad dúplex para imprimir a dos caras automáticamente.`,
        supported: ["OneSided"],
      });
    } else {
      effective.duplex = requested.duplex;
    }
  }

  // Copias
  if (requested.copies) {
    const count = parseInt(requested.copies, 10);
    if (isNaN(count) || count < 1) {
      rejections.push({
        setting: "copies",
        requested: requested.copies,
        code: "INVALID_COPIES_COUNT",
        message: "El número de copias debe ser un entero positivo.",
      });
    } else if (capabilities.maximum_copies && count > capabilities.maximum_copies) {
      rejections.push({
        setting: "copies",
        requested: count,
        code: "EXCEEDS_MAXIMUM_COPIES",
        message: `El número de copias (${count}) supera el límite admitido por el controlador (${capabilities.maximum_copies}).`,
        maximum: capabilities.maximum_copies,
      });
    } else {
      effective.copies = count;
    }
  } else {
    effective.copies = 1;
  }

  return {
    valid: rejections.length === 0,
    rejections,
    effective,
  };
}

// ── 3. BASE DE CONOCIMIENTO Y MANUALES ESTRUCTURADOS ──────────────────────────
const PRINTER_KNOWLEDGE_BASE = {
  hp: {
    brand_name: "Hewlett-Packard (HP)",
    families: ["Smart Tank (500, 580, 700)", "DeskJet (2700, 4100)", "LaserJet (M110, MFP M140)", "OfficeJet Pro"],
    connection: {
      wifi_setup: [
        "1. Conexión Wi-Fi mediante botón WPS: Mantén presionado el botón Wi-Fi en la impresora por 3 segundos hasta que titile la luz azul, luego presiona el botón WPS en tu router.",
        "2. Modo Wi-Fi Direct: Presiona el botón de Información (i) + Wi-Fi simultáneamente para imprimir la hoja con el nombre de red Direct-**-HP y la contraseña.",
        "3. Aplicación HP Smart: Descarga HP Smart desde Microsoft Store para vincular la impresora automáticamente a la red Wi-Fi.",
        "4. Asignación de IP fija / EWS: Ingresa la IP de la impresora en tu navegador (ej: http://192.168.1.50) para acceder al Servidor Web Embebido (EWS) y asignar una IP fija estática.",
      ],
      usb: "Conecta el cable USB Tipo A-B. Windows 11/10 instalará automáticamente el controlador nativo 'Microsoft PWG Raster Class Driver' o el paquete de controladores HP.",
      wsd: "En Windows 11, las impresoras en red se auto-descubren mediante el protocolo WSD (Web Services for Devices) con nombre de puerto 'WSD-<UUID>'.",
    },
    paper_and_ink: {
      paper_types: "Soporta Carta (8.5x11 in), A4 (210x297 mm), Sobres y Papel Fotográfico HP (hasta 300 g/m²).",
      ink_tanks: "Rellena los tanques de tinta (Negro GT53XL, Cian/Magenta/Amarillo GT52) con la impresora encendida. Para alinear cabezales, presiona Reanudar + Copia Color.",
    },
    troubleshooting: [
      "Si aparece 'Offline' en Windows: Ve a Servicios de Windows (services.msc) y reinicia el servicio 'Cola de impresión' (Spooler).",
      "Si el puerto WSD pierde conexión: Elimina la impresora en 'Configuración > Bluetooth y dispositivos > Impresoras y escáneres' y dale a 'Agregar dispositivo' para renovar el WSD.",
      "Para purgar atascos de cola: Detén la cola con 'net stop spooler', borra los archivos en C:\\Windows\\System32\\spool\\PRINTERS, y ejecuta 'net start spooler'.",
    ],
  },
  canon: {
    brand_name: "Canon",
    families: ["PIXMA (G3110, G6010 MegaTank, TS3420)", "imageCLASS (LBP, MF Series)", "MAXIFY"],
    connection: {
      wifi_setup: [
        "1. Modo Conexión Fácil (Cableless setup): Mantén presionado el botón Wi-Fi hasta que la luz parpadee. Usa la herramienta Canon IJ Network Tool.",
        "2. Botón WPS: Presiona el botón de antena/Wi-Fi en la impresora, luego presiona el botón WPS en el router.",
        "3. Acceso Web IP: Ingresa a la IP de la impresora en el navegador para configurar la clave de red y DNS.",
      ],
      usb: "Conectar cable USB 2.0. Utiliza el controlador Canon UFR II / IJ Printer Driver.",
      wsd: "Activa 'WSD Print' en el menú de red de la impresora para integración nativa con Windows 11.",
    },
    paper_and_ink: {
      paper_types: "Carta, A4, B5, Papel Glossy fotográfico. Alimentación trasera recomendada para papel grueso.",
      ink_tanks: "Botellas GI-190/GI-11. Purga de tinta y limpieza a fondo disponible desde el menú de mantenimiento.",
    },
    troubleshooting: [
      "Código de error 5100 / P02: Carro de cartuchos atascado. Revisa que no haya restos de papel en la guía.",
      "Impresora no responde: Desactiva 'Usar impresora sin conexión' en la cola de impresión de Windows.",
    ],
  },
  epson: {
    brand_name: "Epson",
    families: ["EcoTank (L3150, L3250, L4260, L8180)", "WorkForce (WF Series)", "SureColor"],
    connection: {
      wifi_setup: [
        "1. Panel frontal: Menú Configuración > Ajustes de Red > Asistente Wi-Fi > Selecciona tu SSID e ingresa la contraseña.",
        "2. Wi-Fi Direct: Activa Wi-Fi Direct desde el panel para conectar dispositivos directamente sin router.",
        "3. EpsonNet Config: Utilidad para asignar IP estática y puerto TCP/IP 9100 estándar.",
      ],
      usb: "Conexión directa USB. Driver oficial Epson ESC/P-R.",
      wsd: "Compatible con WSD y puerto RAW 9100 estándar.",
    },
    paper_and_ink: {
      paper_types: "Carta, A4, Oficio, Foto 10x15 cm. Gramaje máximo recomendado 250 g/m² en bandeja posterior.",
      ink_tanks: "Botellas T544 / T504 con sistema EcoFit con traba de llenado automático por gravedad.",
    },
    troubleshooting: [
      "Líneas en blanco en la impresión: Ejecuta una 'Prueba de inyectores' y luego 'Limpieza de cabezal' desde las propiedades del driver.",
      "Almohadillas de tinta al final de su vida útil: Requiere reseteo de contador mediante software de servicio.",
    ],
  },
  brother: {
    brand_name: "Brother",
    families: ["DCP-T (T420W, T520W, T720W)", "HL (L2320D, L2360DW)", "MFC"],
    connection: {
      wifi_setup: [
        "1. Asistente WLAN desde el panel: Presiona Menú > Red > WLAN > Asistente de configuración.",
        "2. Botón Wi-Fi / WPS: Mantén presionado el botón Wi-Fi durante 2 segundos.",
        "3. Herramienta BRAdmin: Administración de red para entornos corporativos y asignación de IP.",
      ],
      usb: "Controlador Brother GDI o PCL6 según el modelo.",
      wsd: "Soporte completo para puerto TCP/IP estándar (puerto 9100) y WSD.",
    },
    paper_and_ink: {
      paper_types: "Bandeja inferior de 150 hojas para Carta y A4. Ranura de alimentación manual para papel grueso.",
      ink_tanks: "Botellas BTD60BK (negro) y BT5001 (color).",
    },
    troubleshooting: [
      "Error 'Sin papel': Ajusta las guías laterales de la bandeja de papel para evitar desalineación del sensor.",
      "Impresión borrosa: Realiza la calibración de registro desde el menú de calidad de impresión.",
    ],
  },
  generic: {
    brand_name: "Guía General de Impresoras en Windows 11 / 10",
    connection: {
      add_by_ip: [
        "1. Abre 'Configuración' (Win + I) > 'Bluetooth y dispositivos' > 'Impresoras y escáneres'.",
        "2. Haz clic en 'Agregar dispositivo'. Espera 5 segundos y selecciona 'Agregar manualmente'.",
        "3. Selecciona 'Agregar una impresora por medio de una dirección TCP/IP o un nombre de host'.",
        "4. Tipo de dispositivo: 'Dispositivo TCP/IP'. Dirección IP: escribe la IP de la impresora (ej. 192.168.1.150).",
        "5. Desmarca 'Consultar la impresora y seleccionar automáticamente el controlador'.",
        "6. Selecciona el fabricante y modelo, o haz clic en 'Usar disco' para instalar el archivo INF del fabricante.",
      ],
      spooler_maintenance: [
        "Para reiniciar el servicio Spooler desde PowerShell:",
        "Restart-Service -Name Spooler -Force",
      ],
    },
  },
};

// ── 4. DOMINIO PRINCIPAL PRINTCENTER ──────────────────────────────────────────
export function createPrintCenterDomain({ runtime, domain, fs }) {
  const enginePath = path.resolve(runtime.root || process.cwd(), "platform", "print_engine.ps1");

  function runPrintEngine(operation, args = {}) {
    if (!existsSync(enginePath)) {
      throw new Error(`Motor de impresión no encontrado en: ${enginePath}`);
    }

    const cmdArgs = [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-File", enginePath,
      "-Operation", operation,
    ];

    if (args.PrinterName) cmdArgs.push("-PrinterName", String(args.PrinterName));
    if (args.SourceFile) cmdArgs.push("-SourceFile", String(args.SourceFile));
    if (args.PageIndicesJson) cmdArgs.push("-PageIndicesJson", String(args.PageIndicesJson));
    if (args.Copies) cmdArgs.push("-Copies", String(args.Copies));
    if (args.ColorMode) cmdArgs.push("-ColorMode", String(args.ColorMode));
    if (args.PaperSize) cmdArgs.push("-PaperSize", String(args.PaperSize));
    if (args.DpiX) cmdArgs.push("-DpiX", String(args.DpiX));
    if (args.DpiY) cmdArgs.push("-DpiY", String(args.DpiY));
    if (args.PagesPerSheet) cmdArgs.push("-PagesPerSheet", String(args.PagesPerSheet));
    if (args.ScaleMode) cmdArgs.push("-ScaleMode", String(args.ScaleMode));
    if (args.Orientation) cmdArgs.push("-Orientation", String(args.Orientation));
    if (args.Duplex) cmdArgs.push("-Duplex", String(args.Duplex));
    if (args.Collate !== undefined) cmdArgs.push("-Collate", String(args.Collate));
    if (args.PaperSource) cmdArgs.push("-PaperSource", String(args.PaperSource));
    if (args.JobId) cmdArgs.push("-JobId", String(args.JobId));
    if (args.OutPdfPath) cmdArgs.push("-OutPdfPath", String(args.OutPdfPath));

    const res = spawnSync("powershell.exe", cmdArgs, {
      encoding: "utf8",
      timeout: 35000,
      windowsHide: true,
    });

    if (res.error) throw res.error;

    const stdout = (res.stdout || "").trim();
    const stderr = (res.stderr || "").trim();

    if (res.status !== 0 && !stdout.startsWith("{")) {
      throw new Error(stderr || stdout || `El motor de impresión finalizó con código ${res.status}`);
    }

    try {
      return JSON.parse(stdout);
    } catch {
      throw new Error(stdout || stderr || "Respuesta JSON inválida del motor de impresión");
    }
  }

  // Caché de capacidades con TTL de 30 segundos
  const _capsCache = new Map();
  function getCachedCapabilities(printerName, forceRefresh = false) {
    const key = printerName.toLowerCase();
    const now = Date.now();
    if (!forceRefresh && _capsCache.has(key)) {
      const entry = _capsCache.get(key);
      if (now - entry.cachedAt < 30000) {
        return entry.data;
      }
    }
    const data = runPrintEngine("get_capabilities", { PrinterName: printerName });
    if (data.ok) {
      _capsCache.set(key, { data, cachedAt: now });
    }
    return data;
  }

  const actions = {
    // ── 1. Listado de Impresoras (list_printers) ─────────────────────────────
    list_printers: async () => {
      const res = runPrintEngine("list_printers");
      return res;
    },

    // ── 2. Obtener Capacidades Reales (get_printer) ──────────────────────────
    get_printer: async ({ printer = null, printer_name = null, refresh = false } = {}) => {
      const target = (printer || printer_name || "").trim();
      const res = getCachedCapabilities(target, Boolean(refresh));
      return res;
    },

    // ── 3. Búsqueda y Descubrimiento en Red (search_printers) ────────────────
    search_printers: async () => {
      const res = runPrintEngine("search_printers");
      return res;
    },

    // ── 4. Manuales y Guías de Configuración (manual) ────────────────────────
    manual: async ({ brand = null, model = null, topic = null } = {}) => {
      const bKey = (brand || "generic").toLowerCase().trim();
      const guide = PRINTER_KNOWLEDGE_BASE[bKey] || PRINTER_KNOWLEDGE_BASE.generic;

      let section = guide;
      if (topic && guide[topic]) {
        section = { brand: guide.brand_name, [topic]: guide[topic] };
      }

      return {
        ok: true,
        brand: bKey,
        supported_brands: Object.keys(PRINTER_KNOWLEDGE_BASE),
        guide: section,
      };
    },

    // ── 5. Preflight / Dry-Run de Impresión (preflight) ───────────────────────
    preflight: async (args = {}) => {
      const printerName = (args.printer || args.printer_name || "").trim();
      const sourceFile = (args.file || args.file_path || args.source || "").trim();

      if (!sourceFile) {
        return { ok: false, error: "MISSING_ARGUMENT", message: "Especifica 'file' o 'file_path' del archivo a validar." };
      }
      if (!existsSync(sourceFile)) {
        return { ok: false, error: "SOURCE_NOT_FOUND", message: `El archivo a imprimir no existe: '${sourceFile}'.` };
      }

      const ext = path.extname(sourceFile).toLowerCase();
      const allowedExts = [".pdf", ".png", ".jpg", ".jpeg", ".bmp", ".txt", ".log", ".md", ".json", ".csv"];
      if (!allowedExts.includes(ext)) {
        return { ok: false, error: "UNSUPPORTED_FILE_TYPE", message: `El tipo de archivo '${ext}' no es compatible para impresión directa. Soportados: ${allowedExts.join(", ")}` };
      }

      // 1. Obtener lista de impresoras para determinar destino
      const printersList = runPrintEngine("list_printers");
      let resolvedPrinter = printerName;
      if (!resolvedPrinter) {
        const def = printersList.printers?.find((p) => p.default);
        resolvedPrinter = def ? def.name : (printersList.printers?.[0]?.name || "Microsoft Print to PDF");
      }

      // 2. Obtener capacidades de la impresora
      const caps = getCachedCapabilities(resolvedPrinter);
      if (!caps.ok) {
        return { ok: false, error: "PRINTER_NOT_FOUND", message: `La impresora destino '${resolvedPrinter}' no está accesible.` };
      }

      // 3. Inspeccionar páginas del documento
      let totalDocPages = 1;
      if (ext === ".pdf") {
        const pdfInfo = runPrintEngine("get_pdf_info", { SourceFile: path.resolve(sourceFile) });
        if (pdfInfo.ok) {
          totalDocPages = pdfInfo.page_count;
        }
      }

      // 4. Parsear y validar el rango de páginas solicitado
      let selectedPages = [1];
      try {
        selectedPages = parsePageRange(args.pages || args.page_range, totalDocPages);
      } catch (err) {
        return { ok: false, error: err.code || "INVALID_PAGE_RANGE", message: err.message, details: err.details };
      }

      // 5. Negociar opciones contra el hardware
      const negotiation = negotiateCapabilities({
        paper_size: args.paper_size || args.paper,
        color: args.color,
        dpi: args.dpi || args.resolution,
        quality: args.quality,
        duplex: args.duplex,
        copies: args.copies,
      }, caps);

      if (!negotiation.valid) {
        return {
          ok: false,
          error: negotiation.rejections[0]?.code || "CAPABILITY_NEGOTIATION_FAILED",
          message: negotiation.rejections.map((r) => r.message).join(" "),
          rejections: negotiation.rejections,
        };
      }

      return {
        ok: true,
        will_print: false,
        valid: true,
        printer: resolvedPrinter,
        source_file: path.resolve(sourceFile),
        file_type: ext,
        total_document_pages: totalDocPages,
        selected_pages: selectedPages,
        pages_count: selectedPages ? selectedPages.length : totalDocPages,
        copies: negotiation.effective.copies || 1,
        color_mode: negotiation.effective.color_mode || "Color",
        paper_size: negotiation.effective.paper_size || "Default",
        resolution_dpi: negotiation.effective.dpi_x ? `${negotiation.effective.dpi_x}x${negotiation.effective.dpi_y}` : "Default",
        scale: args.scale || "fit_to_page",
        orientation: args.orientation || "Portrait",
        estimated_sheets: Math.ceil((selectedPages ? selectedPages.length : totalDocPages) / (args.pages_per_sheet || 1)) * (negotiation.effective.copies || 1),
        message: "Validación preflight exitosa. Todos los parámetros son compatibles con la impresora.",
      };
    },

    // ── 6. Configurar Preferencias (configure) ───────────────────────────────
    configure: async ({ printer = null, printer_name = null, paper_size = null, color = null, duplex = null, collate = null } = {}) => {
      const pName = (printer || printer_name || "").trim();
      if (!pName) {
        return { ok: false, error: "MISSING_ARGUMENT", message: "Especifica 'printer' o 'printer_name' a configurar." };
      }

      const res = runPrintEngine("configure", {
        PrinterName: pName,
        PaperSize: paper_size || "",
        ColorMode: color !== null ? (color ? "Color" : "Monochrome") : "",
        Duplex: duplex || "",
        Collate: collate !== null ? collate : "",
      });

      // Invalidar caché tras reconfiguración
      _capsCache.delete(pName.toLowerCase());
      return res;
    },

    // ── 7. Ejecutar Impresión Real (print) ────────────────────────────────────
    print: async (args = {}) => {
      const startTime = Date.now();
      const operationId = runtime.operations?.generateOperationId?.() || `op_prn_${crypto.randomBytes(4).toString("hex")}`;
      const sourceFile = (args.file || args.file_path || args.source || "").trim();

      if (!sourceFile) {
        return { ok: false, error: "MISSING_ARGUMENT", message: "Especifica 'file' o 'file_path' del archivo a imprimir." };
      }
      if (!existsSync(sourceFile)) {
        return { ok: false, error: "SOURCE_NOT_FOUND", message: `El archivo a imprimir no existe: '${sourceFile}'.` };
      }

      const resolvedFile = path.resolve(sourceFile);
      const ext = path.extname(resolvedFile).toLowerCase();

      // Resolver impresora destino
      let resolvedPrinter = (args.printer || args.printer_name || "").trim();
      if (!resolvedPrinter) {
        const printersList = runPrintEngine("list_printers");
        const def = printersList.printers?.find((p) => p.default);
        resolvedPrinter = def ? def.name : (printersList.printers?.[0]?.name || "Microsoft Print to PDF");
      }

      // Capacidades y validación
      const caps = getCachedCapabilities(resolvedPrinter);
      if (!caps.ok) {
        return { ok: false, error: "PRINTER_NOT_FOUND", message: `La impresora destino '${resolvedPrinter}' no es válida o no está accesible.` };
      }

      let totalDocPages = 1;
      if (ext === ".pdf") {
        const pdfInfo = runPrintEngine("get_pdf_info", { SourceFile: resolvedFile });
        if (pdfInfo.ok) {
          totalDocPages = pdfInfo.page_count;
        }
      }

      let selectedPages = [1];
      try {
        selectedPages = parsePageRange(args.pages || args.page_range, totalDocPages);
      } catch (err) {
        return { ok: false, error: err.code || "INVALID_PAGE_RANGE", message: err.message };
      }

      const negotiation = negotiateCapabilities({
        paper_size: args.paper_size || args.paper,
        color: args.color,
        dpi: args.dpi || args.resolution,
        quality: args.quality,
        duplex: args.duplex,
        copies: args.copies,
      }, caps);

      if (!negotiation.valid) {
        return {
          ok: false,
          error: negotiation.rejections[0]?.code || "CAPABILITY_NEGOTIATION_FAILED",
          message: negotiation.rejections.map((r) => r.message).join(" "),
          rejections: negotiation.rejections,
        };
      }

      const copies = negotiation.effective.copies || 1;
      const colorMode = negotiation.effective.color_mode || "Color";
      const paperSize = negotiation.effective.paper_size || "";
      const dpiX = negotiation.effective.dpi_x || 0;
      const dpiY = negotiation.effective.dpi_y || 0;
      const scaleMode = args.scale || args.scale_mode || "fit_to_page";
      const orientation = args.orientation || "Portrait";
      const pagesPerSheet = parseInt(args.pages_per_sheet || 1, 10);
      const outPdfTarget = args.output_pdf || args.pdf_output || "";

      // Ejecutar impresión
      const res = runPrintEngine("print", {
        PrinterName: resolvedPrinter,
        SourceFile: resolvedFile,
        PageIndicesJson: JSON.stringify(selectedPages || [1]),
        Copies: copies,
        ColorMode: colorMode,
        PaperSize: paperSize,
        DpiX: dpiX,
        DpiY: dpiY,
        PagesPerSheet: pagesPerSheet,
        ScaleMode: scaleMode,
        Orientation: orientation,
        OutPdfPath: outPdfTarget ? path.resolve(outPdfTarget) : "",
      });

      const durationMs = Date.now() - startTime;
      runtime.auditLog?.record({
        agent: runtime.client?.name || "mcp_client",
        tool: "printcenter",
        action: "print",
        args: {
          printer: resolvedPrinter,
          file: path.basename(resolvedFile),
          pages: selectedPages,
          copies,
          color: colorMode,
          paper_size: paperSize,
        },
        permission: "advanced",
        result: res.ok ? "ok" : "error",
        durationMs,
      });

      return {
        ...res,
        operation_id: operationId,
        duration_ms: durationMs,
      };
    },

    // ── 8. Inspección de Cola de Impresión (jobs) ────────────────────────────
    jobs: async ({ printer = null, printer_name = null } = {}) => {
      const pName = (printer || printer_name || "").trim();
      const res = runPrintEngine("jobs", { PrinterName: pName });
      return res;
    },

    // ── 9. Cancelar Trabajo Específico (cancel_job) ──────────────────────────
    cancel_job: async ({ printer = null, printer_name = null, job_id = null, id = null } = {}) => {
      const pName = (printer || printer_name || "").trim();
      const jId = parseInt(job_id || id, 10);
      if (!pName || isNaN(jId) || jId <= 0) {
        return { ok: false, error: "INVALID_ARGUMENT", message: "Se requiere 'printer' y 'job_id' numérico positivo." };
      }

      const res = runPrintEngine("cancel_job", { PrinterName: pName, JobId: jId });
      return res;
    },

    // ── 10. Purga Explícita de Cola (purge_queue) ────────────────────────────
    purge_queue: async ({ printer = null, printer_name = null } = {}) => {
      const pName = (printer || printer_name || "").trim();
      if (!pName) {
        return { ok: false, error: "INVALID_ARGUMENT", message: "Se requiere 'printer' o 'printer_name' para purgar la cola." };
      }

      const res = runPrintEngine("purge_queue", { PrinterName: pName });
      return res;
    },
  };

  // Alias para compatibilidad total con LLMs
  actions.list = actions.list_printers;
  actions.printers = actions.list_printers;
  actions.status = actions.get_printer;
  actions.info = actions.get_printer;
  actions.capabilities = actions.get_printer;
  actions.search = actions.search_printers;
  actions.discover = actions.search_printers;
  actions.dry_run = actions.preflight;
  actions.queue = actions.jobs;
  actions.cancel = actions.cancel_job;

  const permissions = {
    list_printers: "standard",
    get_printer: "standard",
    search_printers: "standard",
    manual: "standard",
    preflight: "standard",
    jobs: "standard",
    configure: "advanced",
    print: "advanced",
    cancel_job: "advanced",
    purge_queue: "maintainer",
  };

  return domain(
    "printcenter",
    "Centro Integral de Impresión y Gestión de Impresoras (HP, Canon, Epson, Brother y Windows). Soporta selección de páginas, copias, color/B&N, calidad PPP, tamaño de papel, dry-run (preflight), inspección de colas y cancelación.",
    actions,
    permissions
  );
}
