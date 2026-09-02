// ============================================================================
// FLUXER MCP — Compact
// Reduce el tamaño de las respuestas para modelos pequeños SIN destruir la
// información real. Antes: strings a 160 chars, arrays de objetos reducidos
// a su primera clave, objetos con arrays anidados reducidos a un conteo.
// Ahora: se preserva la estructura completa (podada por presupuesto de
// caracteres) y solo se resume como último recurso si de verdad es enorme.
// ============================================================================

// Devuelve { value, wasTruncated } para que el contexto padre pueda
// actualizar el campo `truncated` del objeto si ya lo tiene declarado.
function truncateString(text, max) {
  const value = String(text ?? "");
  if (value.length <= max) return { value, wasTruncated: false };
  const remaining = value.length - max;
  return {
    value: `${value.slice(0, max)}\n… [truncado, ${remaining} caracteres más — usa head o tail para paginar]`,
    wasTruncated: true,
  };
}

function countValue(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return null;
}

// Poda recursiva que SIEMPRE conserva la forma (arrays de objetos siguen
// siendo arrays de objetos completos, no se colapsan a la primera clave).
// Para strings devuelve el resultado de truncateString directamente.
// Para objetos: si algún campo string fue truncado Y el objeto tiene un campo
// `truncated` que está en false, lo actualiza a true para evitar la
// contradicción metadata-vs-contenido que reportó el agente.
function pruneValue(value, depth, maxString, maxArrayItems) {
  if (value === null || value === undefined) return value;
  const kind = typeof value;
  if (kind === "string") {
    // Devuelve el string ya procesado (el caller de objeto lo extrae)
    return truncateString(value, maxString).value;
  }
  if (kind === "number" || kind === "boolean") return value;

  if (Array.isArray(value)) {
    if (depth > 6)
      return `[array anidado demasiado profundo: ${value.length} items]`;
    const items = value
      .slice(0, maxArrayItems)
      .map((item) => pruneValue(item, depth + 1, maxString, maxArrayItems));
    if (value.length > maxArrayItems) {
      items.push(
        `… (+${value.length - maxArrayItems} elementos más no mostrados)`,
      );
    }
    return items;
  }

  if (kind === "object") {
    if (depth > 6) return "[objeto anidado demasiado profundo]";
    const entries = Object.entries(value);
    const maxKeys = 80;
    const out = {};
    let anyStringTruncated = false;
    for (const [key, item] of entries.slice(0, maxKeys)) {
      if (typeof item === "string") {
        const { value: truncated, wasTruncated } = truncateString(
          item,
          maxString,
        );
        out[key] = truncated;
        if (wasTruncated) anyStringTruncated = true;
      } else {
        out[key] = pruneValue(item, depth + 1, maxString, maxArrayItems);
      }
    }
    // Si algún string fue cortado y el objeto declara un campo `truncated`,
    // actualizarlo a true para que metadata y contenido sean consistentes.
    if (anyStringTruncated && "truncated" in out && out.truncated === false) {
      out.truncated = true;
      out.truncatedReason = out.truncatedReason ?? "compact_size_limit";
    }
    if (entries.length > maxKeys)
      out.__more_fields__ = entries.length - maxKeys;
    return out;
  }

  return String(value);
}

// Detecta la forma típica de runtime.run(): { ok, stdout, stderr, code? }
function isShellResult(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "ok" in value &&
    ("stdout" in value || "stderr" in value)
  );
}

// Presenta el resultado de un comando de shell de forma útil para la IA en
// vez de aplastarlo a un objeto genérico de 160 caracteres. Explica el caso
// "código 0 sin salida" en vez de dejarlo mudo.
function shapeShellResult(value, maxChars) {
  const stdout = String(value.stdout ?? "").trim();
  const stderr = String(value.stderr ?? "").trim();
  const cap = Math.max(1000, Math.min(50000, Math.floor(maxChars * 0.7)));

  const { value: trunkStdout, wasTruncated: outTrunc } = truncateString(stdout, cap);
  const { value: trunkStderr, wasTruncated: errTrunc } = truncateString(stderr, Math.floor(cap / 2));

  const out = { ...value, ok: Boolean(value.ok) };
  out.stdout = stdout ? trunkStdout : "";
  out.stderr = stderr ? trunkStderr : "";
  if (value.code !== undefined && value.code !== null) {
    out.code = value.code;
    out.exit_code = value.code;
  }
  if (value.truncated !== undefined) {
    out.truncated = Boolean(value.truncated);
  } else if (outTrunc || errTrunc) {
    out.truncated = true;
  }

  if (!stdout && !stderr) {
    out.note = value.ok
      ? "El comando terminó exitosamente (código 0) sin salida de texto estándar."
      : "El comando falló sin texto de salida en stdout/stderr.";
  } else if (!stdout && stderr) {
    out.note = "stdout vacío; información reportada en stderr.";
  }
  return out;
}

export function compactValue(
  rawValue,
  options = {},
) {
  const longTrue = options.longTrue || false;
  const maxChars = options.maxChars || 100000;

  if (
    longTrue ||
    options.full_output ||
    options.raw ||
    process.env.FLUXER_UNLIMITED_OUTPUT === 'true'
  ) {
    return { data: rawValue };
  }

  if (rawValue === null || rawValue === undefined) {
    return { data: null, empty: true };
  }

  if (isShellResult(rawValue)) {
    return { data: shapeShellResult(rawValue, maxChars) };
  }

  const maxString = Math.max(500, Math.min(50000, Math.floor(maxChars * 0.6)));
  const maxArrayItems = 500;
  const pruned = pruneValue(rawValue, 0, maxString, maxArrayItems);
  const originalCount = countValue(rawValue);

  const result = { data: pruned };
  if (originalCount !== null) result.count = originalCount;

  let json = "";
  try {
    json = JSON.stringify(pruned);
  } catch {
    json = "";
  }

  const hardCap = Math.max(maxChars * 1.6, 12000);
  if (json.length > hardCap) {
    if (Array.isArray(pruned)) {
      const keep = Math.max(5, Math.floor(pruned.length / 3));
      result.data = pruned.slice(0, keep);
      result.truncated = true;
      result.summary = `Respuesta muy grande (${originalCount} elementos totales). Se muestran ${keep}; usa parámetros como limit/pattern/depth para acotar la consulta.`;
    } else if (pruned && typeof pruned === "object") {
      result.truncated = true;
      result.summary = `Respuesta grande (~${json.length} caracteres). Los datos están incluidos pero pueden venir recortados por campo; acota la consulta si falta información.`;
    }
  }

  return result;
}
