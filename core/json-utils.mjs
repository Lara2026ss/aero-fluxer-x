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
