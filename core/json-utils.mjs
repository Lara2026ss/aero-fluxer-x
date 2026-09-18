/**
 * Utilidades para parsear y normalizar argumentos de herramientas MCP
 * de forma tolerante a fallos, diseñada específicamente para mitigar
 * discrepancias sintácticas y formateos peculiares de clientes LLM (como Claude Desktop).
 */

export function parseResilientJson(str) {
  if (typeof str !== "string") return str;
  const trimmed = str.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // 1. Recortar caracteres de cierre sobrantes (ej: }} o }}} generados accidentalmente por LLMs)
    let s = trimmed;
    while (s.length > 2 && (s.endsWith("}") || s.endsWith("]"))) {
      s = s.slice(0, -1).trim();
      try {
        const res = JSON.parse(s);
        if (res && typeof res === "object") return res;
      } catch {}
    }
    // 2. Extraer subcadena balanceada entre el primer { y cualquier } hacia atrás
    let first = trimmed.indexOf("{");
    if (first !== -1) {
      for (let last = trimmed.length - 1; last > first; last--) {
        if (trimmed[last] === "}") {
          try {
            const candidate = trimmed.slice(first, last + 1);
            const res = JSON.parse(candidate);
            if (res && typeof res === "object") return res;
          } catch {}
        }
      }
    }
  }
  return null;
}

/**
 * Desempaqueta argumentos recursivamente eliminando envolturas comunes
 * tales como 'args', 'data', 'payload', 'params', 'arguments', 'feedback'.
 */
export function unwrapArgs(obj) {
  if (!obj) return {};
  if (typeof obj === "string") {
    const parsed = parseResilientJson(obj);
    if (parsed && typeof parsed === "object") {
      return unwrapArgs(parsed);
    }
    return {};
  }
  if (typeof obj !== "object" || Array.isArray(obj)) return obj;

  let res = { ...obj };
  const wrapperKeys = ["args", "data", "payload", "params", "arguments", "feedback"];
  for (const key of wrapperKeys) {
    if (res[key] !== undefined) {
      if (typeof res[key] === "string") {
        const parsed = parseResilientJson(res[key]);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          delete res[key];
          res = unwrapArgs({ ...res, ...parsed });
        }
      } else if (typeof res[key] === "object" && res[key] !== null && !Array.isArray(res[key])) {
        const nested = res[key];
        delete res[key];
        res = unwrapArgs({ ...res, ...nested });
      }
    }
  }
  return res;
}

const CRITICAL_KEYS = new Set([
  "error", "errors", "message", "err", "stack",
  "timestamp", "created_at", "trace_id", "traceId", "operation_id", "operationId",
  "permission", "level", "ok", "status", "exit_code", "exitCode", "code", "verdict"
]);

/**
 * Poda selectiva e inteligente de payloads JSON para reducir consumo de tokens
 * sin romper la estructura de debug ni eliminar información crítica.
 */
export function sanitizeAndPrune(obj, options = {}) {
  if (obj === null || typeof obj !== "object") return obj;

  const rawJson = JSON.stringify(obj);
  const dataSize = rawJson.length;
  const isOk = obj.ok !== false && !obj.error;

  // Solo activar si options.compact === true OR response.ok && dataSize > 50KB
  const shouldPrune = options.compact === true || (isOk && dataSize > 50 * 1024);
  if (!shouldPrune) return obj;

  function pruneInternal(val, parentKey = "") {
    if (val === null || val === undefined) return undefined;
    if (typeof val !== "object") return val;

    if (Array.isArray(val)) {
      const cleanedArr = val
        .map((item) => pruneInternal(item, parentKey))
        .filter((item) => item !== undefined);
      return cleanedArr.length > 0 ? cleanedArr : (CRITICAL_KEYS.has(parentKey) ? [] : undefined);
    }

    const res = {};
    for (const [key, v] of Object.entries(val)) {
      // Preservar SIEMPRE campos críticos sin alteración
      if (CRITICAL_KEYS.has(key)) {
        res[key] = v;
        continue;
      }
      const cleaned = pruneInternal(v, key);
      if (
        cleaned !== undefined &&
        cleaned !== "" &&
        !(typeof cleaned === "object" && Object.keys(cleaned).length === 0)
      ) {
        res[key] = cleaned;
      }
    }
    return Object.keys(res).length > 0 ? res : undefined;
  }

  const pruned = pruneInternal(obj) || {};
  const prunedJson = JSON.stringify(pruned);

  // Fallback: si la poda reduce <15% y no se pidió compact: true explícito, devolver original
  if (!options.compact) {
    const savings = (dataSize - prunedJson.length) / dataSize;
    if (savings < 0.15) {
      return obj;
    }
  }

  return pruned;
}

/**
 * Formateador compacto denso multi-formato (json, jsonl, table).
 */
export function compactFormatter(data, format = "json") {
  if (!data) return "";
  // NUNCA truncar errores: preservar stack trace y estructura completa
  if (data.ok === false || data.error) {
    return typeof data === "string" ? data : JSON.stringify(data, null, 2);
  }

  if (format === "jsonl") {
    const list = Array.isArray(data)
      ? data
      : Array.isArray(data.items)
      ? data.items
      : [data];
    return list.map((item) => JSON.stringify(item)).join("\n");
  }

  if (format === "table") {
    const list = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : null;
    if (list && list.length > 0 && typeof list[0] === "object" && list[0] !== null) {
      const headers = Object.keys(list[0]).slice(0, 8); // Máximo 8 columnas para no desbordar
      const headerRow = `| ${headers.join(" | ")} |`;
      const sepRow = `| ${headers.map(() => "---").join(" | ")} |`;
      const rows = list.map((item) => {
        const cols = headers.map((h) => {
          const val = item[h];
          if (val === null || val === undefined) return "";
          if (typeof val === "object") return JSON.stringify(val).slice(0, 20);
          return String(val).replace(/\|/g, "\\|").slice(0, 40);
        });
        return `| ${cols.join(" | ")} |`;
      });
      return [headerRow, sepRow, ...rows].join("\n");
    }
  }

  return typeof data === "string" ? data : JSON.stringify(data);
}

/**
 * Truncado inteligente Head & Tail manteniendo legibilidad y preservando conclusiones finales.
 */
export function smartTruncate(text, maxChars = 16000, prefer = "tail") {
  if (typeof text !== "string") text = String(text || "");
  if (text.length <= maxChars) return text;

  const safeMax = Math.max(200, maxChars);
  let headChars;
  let tailChars;

  if (prefer === "head") {
    headChars = Math.floor(safeMax * 0.75);
    tailChars = Math.floor(safeMax * 0.25);
  } else if (prefer === "middle") {
    headChars = Math.floor(safeMax * 0.5);
    tailChars = Math.floor(safeMax * 0.5);
  } else {
    // default: tail (las conclusiones y errores finales nunca se pierden)
    headChars = Math.floor(safeMax * 0.25);
    tailChars = Math.floor(safeMax * 0.75);
  }

  const head = text.slice(0, headChars);
  const tail = text.slice(text.length - tailChars);
  const omitted = text.length - (head.length + tail.length);

  return `${head}\n\n[... ${omitted} chars omitted ...]\n\n${tail}`;
}

