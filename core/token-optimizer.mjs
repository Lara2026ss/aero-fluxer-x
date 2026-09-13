/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚡ FLUXER CORE — core/token-optimizer.mjs (v11.0.8 Hotfix)
 * Motor Autónomo de Expansión de Código Binario/Comprimido y Control de Tokens.
 * Incluye Toggle Global y Desactivación Permanente del Aviso de Tokens.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import zlib from "node:zlib";
import fsSync from "node:fs";
import path from "node:path";

// Caché en memoria para la advertencia rápida de una sola vez
const _advisoryCache = new Map();
const ADVISORY_TTL_MS = 10 * 60 * 1000; // 10 minutos

// Estado global de desactivación permanente (toggle)
let _advisoryGloballyDisabled = false;
let _stateFilePath = null;

export function initAdvisoryState(storageDir) {
  if (storageDir) {
    try {
      _stateFilePath = path.join(storageDir, "token_advisory_state.json");
      if (fsSync.existsSync(_stateFilePath)) {
        const raw = fsSync.readFileSync(_stateFilePath, "utf8");
        const parsed = JSON.parse(raw);
        if (typeof parsed.disabled === "boolean") {
          _advisoryGloballyDisabled = parsed.disabled;
        }
      }
    } catch (_) {}
  }
}

function saveAdvisoryState() {
  if (_stateFilePath) {
    try {
      fsSync.mkdirSync(path.dirname(_stateFilePath), { recursive: true });
      fsSync.writeFileSync(
        _stateFilePath,
        JSON.stringify({ disabled: _advisoryGloballyDisabled, updatedAt: new Date().toISOString() }, null, 2),
        "utf8"
      );
    } catch (_) {}
  }
}

export function setAdvisoryEnabled(enabled) {
  _advisoryGloballyDisabled = !enabled;
  saveAdvisoryState();
  return {
    ok: true,
    advisory_enabled: enabled,
    advisory_disabled: !enabled,
    status: enabled ? "ACTIVE_ONE_TIME_GATE" : "DISABLED_PERMANENTLY",
    message: enabled
      ? "⚡ Aviso de optimización de tokens ACTIVADO."
      : "🔇 Aviso de optimización de tokens DESACTIVADO PERMANENTEMENTE. Ya no aparecerán advertencias en herramientas de escritura.",
    tip: enabled
      ? "Puedes desactivarlo con files.token_advisory({ enabled: false }) o disable_advisory_permanently: true."
      : "Puedes reactivarlo en cualquier momento con files.token_advisory({ enabled: true })."
  };
}

export function toggleAdvisory() {
  return setAdvisoryEnabled(_advisoryGloballyDisabled);
}

export function getAdvisoryStatus() {
  return {
    ok: true,
    advisory_enabled: !_advisoryGloballyDisabled,
    advisory_disabled: _advisoryGloballyDisabled,
    mode: _advisoryGloballyDisabled ? "DISABLED_PERMANENTLY" : "ACTIVE_ONE_TIME_GATE",
    tip: "Usa token_advisory({ enabled: false }) o disable_advisory_permanently: true para desactivar permanentemente."
  };
}

export const TOKEN_COMPRESSION_TYPES = [
  "gzip",
  "gz",
  "deflate",
  "zlib",
  "base64",
  "b64",
  "hex",
  "bin",
  "binary",
  "bits",
  "numbers",
  "bytes",
  "template",
  "macros",
  "repeat",
  "rle",
  "boilerplate"
];

const PREDEFINED_BOILERPLATES = {
  mit_license: (year = new Date().getFullYear(), author = "Fluxer AI") =>
    `MIT License\n\nCopyright (c) ${year} ${author}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n`,

  html5_starter: (title = "Application") =>
    `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${title}</title>\n  <style>\n    body { font-family: system-ui, -apple-system, sans-serif; margin: 2rem; background: #0f172a; color: #f8fafc; }\n    .card { background: #1e293b; padding: 1.5rem; border-radius: 8px; border: 1px solid #334155; }\n  </style>\n</head>\n<body>\n  <div class="card">\n    <h1>${title}</h1>\n    <p>Generated cleanly via Fluxer AI Token Optimizer.</p>\n  </div>\n</body>\n</html>\n`,

  express_server: () =>
    `import express from "express";\nconst app = express();\nconst PORT = process.env.PORT || 3000;\n\napp.use(express.json());\n\napp.get("/health", (req, res) => res.json({ ok: true, status: "healthy", timestamp: new Date().toISOString() }));\n\napp.listen(PORT, () => console.log(\`Server running on http://localhost:\${PORT}\`));\n`,

  skill_template: (name = "example-skill", desc = "Skill description") =>
    `---\nname: ${name}\ndescription: ${desc}\n---\n\n# ${name}\n\n## Overview\n${desc}\n\n## Workflow\n1. Step one.\n2. Step two.\n\n## Rules\n- Maintain clean standards.\n`
};

/**
 * Expande contenido enviado en formatos binarios, numéricos, comprimidos o macros
 * a texto real y completo en UTF-8.
 */
export function expandContent({
  content = "",
  encoding = "utf8",
  macros = null,
  repeat = null,
  template = null,
  boilerplate = null,
  numbers = null
} = {}) {
  const normEnc = String(encoding || "utf8").toLowerCase().trim();

  // 1. Boilerplates predefinidos
  if (boilerplate && PREDEFINED_BOILERPLATES[boilerplate]) {
    const fn = PREDEFINED_BOILERPLATES[boilerplate];
    return typeof fn === "function" ? fn() : String(fn);
  }

  // 2. Repeticiones de patrones (repeat)
  if (repeat && typeof repeat === "object") {
    const pattern = repeat.pattern || repeat.text || content || "";
    const times = Math.max(1, Math.min(Number(repeat.times || repeat.count) || 1, 50000));
    return String(pattern).repeat(times);
  }

  // 3. Array de números / bytes directos
  if (numbers && Array.isArray(numbers)) {
    return Buffer.from(numbers).toString("utf8");
  }

  // 4. Formatos por codificación (encoding)
  if (normEnc === "gzip" || normEnc === "gz") {
    try {
      const cleanB64 = String(content).replace(/\s+/g, "");
      const compressedBuf = Buffer.from(cleanB64, "base64");
      return zlib.gunzipSync(compressedBuf).toString("utf8");
    } catch (err) {
      throw new Error(`Fallo al descomprimir contenido gzip (base64 inválido o corrupto): ${err.message}`);
    }
  }

  if (normEnc === "deflate" || normEnc === "zlib") {
    try {
      const cleanB64 = String(content).replace(/\s+/g, "");
      const compressedBuf = Buffer.from(cleanB64, "base64");
      return zlib.inflateSync(compressedBuf).toString("utf8");
    } catch (err) {
      throw new Error(`Fallo al descomprimir contenido deflate (base64 inválido o corrupto): ${err.message}`);
    }
  }

  if (normEnc === "hex") {
    try {
      const hexClean = String(content).replace(/[^0-9a-fA-F]/g, "");
      return Buffer.from(hexClean, "hex").toString("utf8");
    } catch (err) {
      throw new Error(`Fallo al decodificar cadena hexadecimal: ${err.message}`);
    }
  }

  if (normEnc === "bin" || normEnc === "binary" || normEnc === "bits") {
    try {
      const bits = String(content).replace(/[^01]/g, "");
      const bytes = [];
      for (let i = 0; i < bits.length; i += 8) {
        const chunk = bits.slice(i, i + 8);
        if (chunk.length === 8) {
          bytes.push(parseInt(chunk, 2));
        }
      }
      return Buffer.from(bytes).toString("utf8");
    } catch (err) {
      throw new Error(`Fallo al decodificar secuencia binaria de bits: ${err.message}`);
    }
  }

  if (normEnc === "numbers" || normEnc === "bytes") {
    try {
      let nums = [];
      if (Array.isArray(content)) {
        nums = content;
      } else {
        nums = String(content)
          .split(/[,\s]+/)
          .map((n) => parseInt(n.trim(), 10))
          .filter((n) => !isNaN(n) && n >= 0 && n <= 255);
      }
      return Buffer.from(nums).toString("utf8");
    } catch (err) {
      throw new Error(`Fallo al decodificar array de bytes numéricos: ${err.message}`);
    }
  }

  if (normEnc === "base64" || normEnc === "b64") {
    try {
      const cleanB64 = String(content).replace(/\s+/g, "");
      return Buffer.from(cleanB64, "base64").toString("utf8");
    } catch (err) {
      throw new Error(`Fallo al decodificar base64: ${err.message}`);
    }
  }

  if (normEnc === "rle") {
    const regex = /(\d+)#([^#]+)/g;
    let match;
    let result = "";
    while ((match = regex.exec(String(content))) !== null) {
      const count = parseInt(match[1], 10);
      const text = match[2];
      result += text.repeat(count);
    }
    return result || String(content);
  }

  // 5. Plantillas y Expansión de Macros
  let finalStr = template !== null && template !== undefined ? String(template) : (typeof content === "string" ? content : JSON.stringify(content, null, 2));

  if (macros && typeof macros === "object") {
    for (const [key, val] of Object.entries(macros)) {
      finalStr = finalStr.split(key).join(String(val));
    }
  }

  return finalStr;
}

/**
 * Comprueba si debe mostrarse la advertencia rápida de una sola vez antes de procesar
 * contenido extenso en texto plano sin comprimir.
 */
export function checkTokenAdvisory({
  action = "write",
  target = "default",
  content = "",
  encoding = "utf8",
  skip_advisory = false,
  bypass_advisory = false,
  force = false,
  confirm = false,
  confirmed = false,
  disable_advisory_permanently = false,
  advisory = null,
  macros = null,
  repeat = null,
  boilerplate = null,
  numbers = null
} = {}) {
  // 0. Si el usuario o la IA desactiva permanentemente en esta llamada
  if (disable_advisory_permanently === true || advisory === false) {
    _advisoryGloballyDisabled = true;
    saveAdvisoryState();
    return { shouldProceed: true, disabled_permanently: true };
  }

  // 1. Si está desactivado globalmente / permanentemente (toggle OFF)
  if (_advisoryGloballyDisabled) {
    return { shouldProceed: true };
  }

  // 2. Si se solicita expresamente omitir la advertencia en este llamado
  if (skip_advisory || bypass_advisory || force || confirm || confirmed) {
    return { shouldProceed: true };
  }

  // 3. Si ya se especificó un método de compresión, macro o binario
  if (macros || repeat || boilerplate || numbers) {
    return { shouldProceed: true };
  }

  const normEnc = String(encoding || "utf8").toLowerCase().trim();
  if (TOKEN_COMPRESSION_TYPES.includes(normEnc) && normEnc !== "utf8" && normEnc !== "utf-8") {
    return { shouldProceed: true };
  }

  // Para textos cortos (< 150 caracteres), no interrumpir
  const textLen = typeof content === "string" ? content.length : JSON.stringify(content || "").length;
  if (textLen < 150) {
    return { shouldProceed: true };
  }

  const key = `${action}:${target}`;
  const now = Date.now();
  const cached = _advisoryCache.get(key);

  // Si ya se mostró la advertencia en el intento anterior dentro de la ventana TTL:
  if (cached && (now - cached) < ADVISORY_TTL_MS) {
    _advisoryCache.delete(key); // Consumir el pase
    return { shouldProceed: true, wasRetry: true };
  }

  // Primera vez: registrar en caché y devolver la advertencia
  _advisoryCache.set(key, now);

  return {
    shouldProceed: false,
    response: {
      ok: false,
      advisory: "TOKEN_COMPRESSION_NOTICE",
      warning: "⚡ AVISO DE AHORRO DE TOKENS (Herramienta de alto contenido):",
      message: "Has enviado un texto plano extenso (`" + textLen + " caracteres`). Para no agotar tus tokens en peticiones extensas, puedes codificar el contenido en formatos ultra-cortos que se expanden a texto real y completo en disco:",
      modos_de_escritura_cortos: {
        gzip: "encoding: 'gzip' — Envía el texto comprimido en Base64 gzippeado (ahorro del 70% al 95% de tokens).",
        deflate: "encoding: 'deflate' — Base64 zlib/deflate.",
        binary: "encoding: 'bin' o 'binary' — Secuencia de bits 0 y 1.",
        numbers: "encoding: 'numbers' o numbers: [72, 101, ...] — Array de bytes numéricos.",
        hex: "encoding: 'hex' — Cadena en formato hexadecimal.",
        template: "encoding: 'template', template: '...', macros: { '$1': 'bloque largo' } — Expansión de macros.",
        repeat: "repeat: { pattern: '...', times: N } — Repetición de bloques.",
        boilerplate: "boilerplate: 'mit_license' | 'html5_starter' | 'express_server' | 'skill_template' — Plantillas nativas."
      },
      instrucciones_para_continuar: "▶️ Si deseas escribir en texto plano normal, simplemente VUELVE A EJECUTAR esta misma llamada (o agrega 'skip_advisory: true') y se procesará de inmediato.\n" +
                                     "🔇 PARA DESACTIVAR ESTE AVISO PERMANENTEMENTE: Añade 'disable_advisory_permanently: true' en esta llamada, o ejecuta files.token_advisory({ enabled: false }).",
      can_proceed_on_retry: true,
      advisory_bypassed_for_next_call: true
    }
  };
}

export function resetAdvisoryCache() {
  _advisoryCache.clear();
}
