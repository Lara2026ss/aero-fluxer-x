/**
 * FLUXER — tools/files.mjs
 * Dominio: filesystem, lectura/escritura avanzada, documentos, archivos comprimidos, inspección.
 * Capacidad superior con operaciones atómicas, backups de seguridad, edición quirúrgica por líneas,
 * gestor JSON con dot-notation, procesamiento CSV, operaciones por lotes y soporte Office/PDF.
 *
 * @version 8.1.0
 * @param {object} ctx — { runtime, path, fs, crypto, domain, helpers }
 */
export function createFilesDomain({ runtime, path, fs, crypto, domain, helpers }) {
  const { getDirectoryTreeHelper, searchFilesHelper, grepFilesHelper, generateSimpleDiff, splitLines } = helpers;

  // ── Funciones auxiliares internas ──────────────────────────────────────────

  function getNestedProp(obj, propPath) {
    if (!propPath || obj == null) return obj;
    const cleanPath = String(propPath).replace(/\[(\w+)\]/g, ".$1").replace(/^\./, "");
    const parts = cleanPath.split(".");
    let curr = obj;
    for (const part of parts) {
      if (curr == null) return undefined;
      curr = curr[part];
    }
    return curr;
  }

  function setNestedProp(obj, propPath, value, createPath = true) {
    if (!propPath) return false;
    const cleanPath = String(propPath).replace(/\[(\w+)\]/g, ".$1").replace(/^\./, "");
    const parts = cleanPath.split(".");
    let curr = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (curr[part] == null) {
        if (!createPath) return false;
        const nextPart = parts[i + 1];
        curr[part] = /^\d+$/.test(nextPart) ? [] : {};
      }
      curr = curr[part];
    }
    curr[parts[parts.length - 1]] = value;
    return true;
  }

  function deleteNestedProp(obj, propPath) {
    if (!propPath || obj == null) return false;
    const cleanPath = String(propPath).replace(/\[(\w+)\]/g, ".$1").replace(/^\./, "");
    const parts = cleanPath.split(".");
    let curr = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (curr[parts[i]] == null) return false;
      curr = curr[parts[i]];
    }
    const lastPart = parts[parts.length - 1];
    if (Array.isArray(curr) && /^\d+$/.test(lastPart)) {
      curr.splice(Number(lastPart), 1);
      return true;
    }
    if (curr && typeof curr === "object" && lastPart in curr) {
      delete curr[lastPart];
      return true;
    }
    return false;
  }

  function decodeTextBuffer(buffer, requestedEncoding = "utf8") {
    if (!buffer || buffer.length === 0) {
      return { text: "", encoding: "utf8" };
    }

    // 1. Detectar BOM
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
      return {
        text: buffer.subarray(2).toString("utf16le"),
        encoding: "utf-16le",
        hadBom: true,
        autoDecoded: true,
      };
    }

    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
      const swapped = Buffer.from(buffer.subarray(2));
      swapped.swap16();
      return {
        text: swapped.toString("utf16le"),
        encoding: "utf-16be",
        hadBom: true,
        autoDecoded: true,
      };
    }

    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      return {
        text: buffer.subarray(3).toString("utf8"),
        encoding: "utf-8",
        hadBom: true,
      };
    }

    // 2. Si el llamante solicitó explícitamente un encoding no estándar (ej: utf16le)
    const normReq = String(requestedEncoding).toLowerCase().replace(/[-_]/g, "");
    if (normReq === "utf16le" || normReq === "utf16") {
      return { text: buffer.toString("utf16le"), encoding: "utf-16le" };
    }

    // 3. Intento estándar con UTF-8
    const utf8Text = buffer.toString(requestedEncoding || "utf8");
    if (!utf8Text.includes("\0")) {
      return { text: utf8Text, encoding: requestedEncoding || "utf8" };
    }

    // 4. Si UTF-8 contiene bytes nulos pero parece UTF-16LE sin BOM (muy típico de Windows PowerShell 5.1):
    try {
      const utf16Text = buffer.toString("utf16le");
      if (!utf16Text.includes("\0") && utf16Text.trim().length > 0) {
        return {
          text: utf16Text,
          encoding: "utf-16le",
          autoDecoded: true,
          notice: "Archivo sin BOM detectado y decodificado automáticamente como UTF-16LE.",
        };
      }
    } catch {}

    // 5. Es verdaderamente binario
    return { isBinary: true };
  }

  function categorizeExtension(ext) {
    const e = ext.toLowerCase().replace(/^\./, "");
    const map = {
      code: ["js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "rs", "go", "c", "cpp", "h", "cs", "java", "php", "rb", "lua", "sh", "ps1", "bat", "cmd", "html", "css", "scss", "vue", "svelte"],
      document: ["docx", "doc", "xlsx", "xls", "pptx", "ppt", "pdf", "odt", "ods", "odp", "rtf", "txt", "md"],
      data: ["json", "yaml", "yml", "xml", "csv", "tsv", "toml", "ini", "env", "sql", "sqlite", "db"],
      image: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "tiff"],
      audio: ["mp3", "wav", "ogg", "flac", "m4a", "aac"],
      video: ["mp4", "webm", "mkv", "avi", "mov", "wmv"],
      archive: ["zip", "tar", "gz", "tgz", "7z", "rar", "bz2", "xz"],
    };
    for (const [cat, exts] of Object.entries(map)) {
      if (exts.includes(e)) return cat;
    }
    return "binary";
  }

  async function createSafeBackup(filePath) {
    try {
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      if (!exists) return null;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = `${filePath}.${timestamp}.bak`;
      await fs.copyFile(filePath, backupPath);
      return backupPath;
    } catch {
      return null;
    }
  }

  async function performEditFile({ path: p, oldText, find, search, targetContent, newText, replace, replacement, replacementContent, replaceAll = false, isRegex = false, backup = false } = {}) {
    const searchStr = oldText !== undefined ? oldText : (find !== undefined ? find : (search !== undefined ? search : targetContent));
    const replaceStr = newText !== undefined ? newText : (replace !== undefined ? replace : (replacement !== undefined ? replacement : replacementContent));

    if (!p || searchStr === undefined || replaceStr === undefined) {
      return { ok: false, error: "Los parámetros 'path', 'oldText' (o 'find') y 'newText' (o 'replace') son requeridos." };
    }
    const target = runtime.hp(p);
    try {
      const current = await fs.readFile(target, "utf8");
      let updated = current;
      let occurrences = 0;

      if (isRegex) {
        const reg = new RegExp(String(searchStr), replaceAll ? "g" : "");
        occurrences = (current.match(reg) || []).length;
        if (occurrences === 0) return { ok: false, error: "El patrón regex no tuvo coincidencias." };
        updated = current.replace(reg, String(replaceStr));
      } else {
        const targetSearch = String(searchStr);
        const targetReplace = String(replaceStr);

        // 1. Coincidencia directa
        if (current.includes(targetSearch)) {
          if (replaceAll) {
            occurrences = current.split(targetSearch).length - 1;
            updated = current.replaceAll(targetSearch, targetReplace);
          } else {
            occurrences = 1;
            updated = current.replace(targetSearch, targetReplace);
          }
        } else {
          // 2. Normalización de saltos de línea (CRLF <-> LF) para Windows
          const usesCRLF = current.includes("\r\n");
          const normalizedSearch = usesCRLF
            ? targetSearch.replace(/(?<!\r)\n/g, "\r\n")
            : targetSearch.replace(/\r\n/g, "\n");

          if (current.includes(normalizedSearch)) {
            const normalizedReplace = usesCRLF
              ? targetReplace.replace(/(?<!\r)\n/g, "\r\n")
              : targetReplace.replace(/\r\n/g, "\n");

            if (replaceAll) {
              occurrences = current.split(normalizedSearch).length - 1;
              updated = current.replaceAll(normalizedSearch, normalizedReplace);
            } else {
              occurrences = 1;
              updated = current.replace(normalizedSearch, normalizedReplace);
            }
          } else {
            return {
              ok: false,
              error: "El texto especificado en 'oldText' no fue encontrado en el archivo.",
              hint: "Verifica que el fragmento a reemplazar coincida con el contenido actual.",
            };
          }
        }
      }

      let backupPath = null;
      if (backup) backupPath = await createSafeBackup(target);

      await fs.writeFile(target, updated, "utf8");
      return { ok: true, path: target, edited: true, replacementsCount: occurrences, ...(backupPath ? { backupPath } : {}) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  return domain(
    "files",
    "Operaciones superiores de archivos: lectura paginada, escritura atómica con backups, edición quirúrgica por líneas, gestor JSON dot-notation, CSV, documentos Office/PDF y compresión universal.",
    {
      // ── 1. Navegación & Búsqueda ───────────────────────────────────────────
      list_directory: async ({ path: p = ".", limit = 100, sortBy = "name", recursive = false } = {}) => {
        const target = runtime.hp(p);
        try {
          const entries = await fs.readdir(target, { withFileTypes: true, recursive: Boolean(recursive) });
          const n = Math.min(Number(limit) || 100, 2000);
          let mapped = entries.map((e) => ({
            name: e.name,
            isDirectory: e.isDirectory(),
            isFile: e.isFile(),
            isSymbolicLink: e.isSymbolicLink(),
            extension: path.extname(e.name),
          }));

          if (sortBy === "name") mapped.sort((a, b) => a.name.localeCompare(b.name));
          else if (sortBy === "type") mapped.sort((a, b) => (b.isDirectory ? 1 : 0) - (a.isDirectory ? 1 : 0));

          return { ok: true, path: target, total: entries.length, count: Math.min(mapped.length, n), entries: mapped.slice(0, n) };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      list_directory_with_sizes: async ({ path: p = ".", limit = 100, sortBy = "size" } = {}) => {
        const target = runtime.hp(p);
        try {
          const entries = await fs.readdir(target, { withFileTypes: true });
          const n = Math.min(Number(limit) || 100, 1000);
          const mapped = [];
          for (const e of entries) {
            let sizeBytes = 0;
            let modifiedAt = null;
            const fullPath = path.join(target, e.name);
            try {
              const s = await fs.stat(fullPath);
              sizeBytes = s.size;
              modifiedAt = s.mtime.toISOString();
            } catch {}
            mapped.push({
              name: e.name,
              isDirectory: e.isDirectory(),
              isFile: e.isFile(),
              sizeBytes,
              sizeFormatted: sizeBytes > 1048576 ? `${(sizeBytes / 1048576).toFixed(2)} MB` : (sizeBytes > 1024 ? `${(sizeBytes / 1024).toFixed(1)} KB` : `${sizeBytes} B`),
              category: categorizeExtension(path.extname(e.name)),
              modifiedAt,
            });
          }

          if (sortBy === "size") mapped.sort((a, b) => b.sizeBytes - a.sizeBytes);
          else if (sortBy === "date") mapped.sort((a, b) => (b.modifiedAt || "").localeCompare(a.modifiedAt || ""));
          else mapped.sort((a, b) => a.name.localeCompare(b.name));

          return { ok: true, path: target, total: entries.length, count: Math.min(mapped.length, n), entries: mapped.slice(0, n) };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      list_allowed_directories: async () => {
        // Se excluye el home completo (~) para no exponer el directorio raíz del usuario.
        // Solo se listan las ubicaciones semánticas seguras que el MCP realmente usa.
        const dirs = [
          { path: runtime.dirs.root, label: "mcp_root", note: "Directorio de instalación del MCP" },
          { path: runtime.dirs.documents, label: "documents", note: "Documentos del usuario" },
          { path: runtime.dirs.downloads, label: "downloads", note: "Descargas del usuario" },
          { path: runtime.dirs.storage, label: "storage", note: "Datos locales del MCP (AppData)" },
        ].filter(d => d.path);
        return { ok: true, count: dirs.length, directories: dirs };
      },

      directory_tree: async ({ path: p = ".", depth = 2, maxEntries = 500 } = {}) => {
        const target = runtime.hp(p);
        try {
          const maxDepth = Math.min(Number(depth) || 2, 6);
          const tree = await getDirectoryTreeHelper(target, maxDepth, 0);
          return { ok: true, path: target, depth: maxDepth, tree };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      search_files: async ({ path: p = ".", pattern = "*", excludePatterns = ["node_modules", ".git", "dist", "build"], limit = 100 } = {}) => {
        const target = runtime.hp(p);
        try {
          const maxLimit = Math.min(Number(limit) || 100, 1000);
          const matches = await searchFilesHelper(target, pattern, excludePatterns, maxLimit);
          return { ok: true, path: target, pattern, count: matches.length, matches };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      grep_files: async ({ path: p = ".", query, isRegex = false, caseInsensitive = true, include, includePattern, limit = 50, maxFileSize } = {}) => {
        if (!query) return { ok: false, error: "El parámetro 'query' es requerido." };
        const target = runtime.hp(p);
        try {
          const exists = await fs.access(target).then(() => true).catch(() => false);
          if (!exists) {
            return { ok: false, error: `El archivo o directorio '${target}' no existe.` };
          }
          const maxLimit = Math.min(Number(limit) || 50, 1000);
          const incPat = includePattern || include || null;
          const matches = await grepFilesHelper(target, query, maxLimit, {
            isRegex: Boolean(isRegex),
            caseInsensitive: Boolean(caseInsensitive),
            includePattern: incPat,
            ...(maxFileSize ? { maxFileSize: Number(maxFileSize) } : {}),
          });
          return {
            ok: true,
            path: target,
            query,
            isRegex: Boolean(isRegex),
            caseInsensitive: Boolean(caseInsensitive),
            count: matches.length,
            matches,
          };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      // ── 2. Inspección & Comparación ────────────────────────────────────────
      file_exists: async ({ path: p } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        try {
          const s = await fs.stat(target);
          return {
            ok: true,
            path: target,
            exists: true,
            isFile: s.isFile(),
            isDirectory: s.isDirectory(),
            sizeBytes: s.size,
          };
        } catch {
          return { ok: true, path: target, exists: false };
        }
      },

      get_file_info: async ({ path: p } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        try {
          const s = await fs.stat(target);
          const ext = path.extname(target);
          let hashSha256 = null;
          if (s.isFile() && s.size < 50 * 1024 * 1024) {
            try {
              const buf = await fs.readFile(target);
              hashSha256 = crypto.createHash("sha256").update(buf).digest("hex");
            } catch {}
          }
          return {
            ok: true,
            path: target,
            name: path.basename(target),
            extension: ext,
            category: categorizeExtension(ext),
            sizeBytes: s.size,
            sizeFormatted: s.size > 1048576 ? `${(s.size / 1048576).toFixed(2)} MB` : (s.size > 1024 ? `${(s.size / 1024).toFixed(1)} KB` : `${s.size} B`),
            isFile: s.isFile(),
            isDirectory: s.isDirectory(),
            isSymbolicLink: s.isSymbolicLink(),
            permissions: (s.mode & 0o777).toString(8),
            createdAt: s.birthtime.toISOString(),
            modifiedAt: s.mtime.toISOString(),
            accessedAt: s.atime.toISOString(),
            ...(hashSha256 ? { checksumSha256: hashSha256 } : {}),
          };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      get_detailed_metadata: async ({ path: p } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        try {
          const s = await fs.stat(target);
          const isWin = process.platform === "win32";
          let windowsAttributes = null;
          if (isWin) {
            try {
              const res = await runtime.run(`attrib ${runtime.shellQuote(target)}`);
              if (res.ok) {
                const attrs = res.stdout.slice(0, 12);
                windowsAttributes = {
                  raw: attrs.trim(),
                  readOnly: attrs.includes("R"),
                  hidden: attrs.includes("H"),
                  system: attrs.includes("S"),
                  archive: attrs.includes("A"),
                };
              }
            } catch {}
          }
          return {
            ok: true,
            path: target,
            stat: {
              sizeBytes: s.size,
              blocks: s.blocks,
              blockSize: s.blksize,
              mode: (s.mode & 0o777).toString(8),
              uid: s.uid,
              gid: s.gid,
              birthtime: s.birthtime,
              mtime: s.mtime,
              atime: s.atime,
              ctime: s.ctime,
            },
            ...(windowsAttributes ? { windowsAttributes } : {}),
          };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      calculate_checksum: async ({ path: p, algorithm = "sha256" } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        const algo = (algorithm || "sha256").toLowerCase();
        try {
          const buf = await fs.readFile(target);
          const hash = crypto.createHash(algo).update(buf).digest("hex");
          return { ok: true, path: target, algorithm: algo, hash, checksum: hash, sizeBytes: buf.length };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      file_diff: async ({ left, right } = {}) => {
        if (!left || !right) return { ok: false, error: "Los parámetros 'left' y 'right' son requeridos." };
        const leftTarget = runtime.hp(left);
        const rightTarget = runtime.hp(right);
        try {
          const [leftContent, rightContent] = await Promise.all([
            fs.readFile(leftTarget, "utf8"),
            fs.readFile(rightTarget, "utf8"),
          ]);
          const identical = leftContent === rightContent;
          const diff = identical ? "Archivos idénticos." : generateSimpleDiff(leftContent, rightContent, left, right);
          return { ok: true, left: leftTarget, right: rightTarget, identical, diff };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      compare_files: async ({ left, right } = {}) => {
        if (!left || !right) return { ok: false, error: "Los parámetros 'left' y 'right' son requeridos." };
        const leftTarget = runtime.hp(left);
        const rightTarget = runtime.hp(right);
        try {
          const [bufA, bufB] = await Promise.all([fs.readFile(leftTarget), fs.readFile(rightTarget)]);
          const identical = bufA.equals(bufB);
          const hashA = crypto.createHash("sha256").update(bufA).digest("hex");
          const hashB = crypto.createHash("sha256").update(bufB).digest("hex");
          return {
            ok: true,
            left: leftTarget,
            right: rightTarget,
            identical,
            leftSize: bufA.length,
            rightSize: bufB.length,
            leftSha256: hashA,
            rightSha256: hashB,
          };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      // ── 3. Lectura Paginada & Multi-Formato ──────────────────────────────────
      read_text_file: async ({ path: p, head, tail, maxLines, page, linesPerPage = 100, startLine, endLine, range, encoding = "utf8", includeLineNumbers = false } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        const ext = path.extname(target).toLowerCase();

        if ([".docx", ".xlsx", ".xls", ".pptx", ".pdf"].includes(ext)) {
          return {
            ok: false,
            isOfficeDocument: true,
            error: `El archivo '${path.basename(target)}' es un documento ${ext.toUpperCase()}. Usa 'files.read_document' para procesarlo.`,
            recommendedTool: "files.read_document",
          };
        }

        const binaryExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".exe", ".dll", ".so", ".dylib", ".bin", ".zip", ".tar", ".gz", ".7z", ".mp3", ".mp4", ".wav", ".sqlite", ".db"];
        if (binaryExts.includes(ext)) {
          return {
            ok: false,
            isBinary: true,
            error: `El archivo '${path.basename(target)}' es un archivo binario (${ext.toUpperCase()}). Usa 'files.read_binary_file' en su lugar.`,
            recommendedTool: "files.read_binary_file",
          };
        }

        try {
          const stat = await fs.stat(target);
          const rawBuffer = await fs.readFile(target);
          const decoded = decodeTextBuffer(rawBuffer, encoding);
          if (decoded.isBinary) {
            return {
              ok: false,
              isBinary: true,
              error: `El archivo '${path.basename(target)}' contiene datos binarios no decodificables como texto (UTF-8/UTF-16). Usa 'files.read_binary_file' en su lugar.`,
              recommendedTool: "files.read_binary_file",
            };
          }
          const content = decoded.text;
          let lines = content.split(/\r?\n/);
          const totalLines = lines.length;
          let truncated = false;
          let warning = decoded.notice || undefined;

          // 1. Soporte explícito de rango (startLine / endLine o range: [start, end])
          let reqStart = startLine !== undefined ? Number(startLine) : (Array.isArray(range) ? Number(range[0]) : undefined);
          let reqEnd = endLine !== undefined ? Number(endLine) : (Array.isArray(range) ? Number(range[1]) : undefined);

          if (reqStart !== undefined || reqEnd !== undefined) {
            const raw1 = reqStart !== undefined ? Math.max(1, reqStart) : 1;
            const raw2 = reqEnd !== undefined ? Math.max(1, reqEnd) : raw1 + 99;
            const start = Math.max(1, Math.min(raw1, raw2));
            const end = Math.min(totalLines, Math.max(raw1, raw2));
            const sliced = lines.slice(start - 1, end);
            return {
              ok: true,
              path: target,
              startLine: start,
              endLine: end,
              totalLines,
              linesReturned: sliced.length,
              content: includeLineNumbers ? sliced.map((l, i) => `${start + i}: ${l}`).join("\n") : sliced.join("\n"),
              encoding,
            };
          }

          // 2. Paginación
          if (page !== undefined) {
            const lpp = Math.max(1, Number(linesPerPage) || 100);
            const pg = Math.max(1, Number(page) || 1);
            const totalPages = Math.max(1, Math.ceil(totalLines / lpp));
            const start = (pg - 1) * lpp;
            const sliced = lines.slice(start, start + lpp);
            return {
              ok: true,
              path: target,
              page: pg,
              linesPerPage: lpp,
              totalPages,
              totalLines,
              linesReturned: sliced.length,
              hasMore: pg < totalPages,
              nextPage: pg < totalPages ? pg + 1 : null,
              prevPage: pg > 1 ? pg - 1 : null,
              content: includeLineNumbers ? sliced.map((l, i) => `${start + i + 1}: ${l}`).join("\n") : sliced.join("\n"),
            };
          }

          // 3. Head / Tail / MaxLines
          if (head !== undefined) {
            const n = Math.max(0, Number(head));
            lines = lines.slice(0, n);
          } else if (tail !== undefined) {
            const n = Math.max(0, Number(tail));
            lines = lines.slice(-n);
          } else if (maxLines !== undefined) {
            const n = Math.max(0, Number(maxLines));
            lines = lines.slice(0, n);
          } else if (stat.size > 300 * 1024 && totalLines > 500) {
            lines = lines.slice(0, 500);
            truncated = true;
            warning = `Archivo grande (${(stat.size / 1024).toFixed(1)} KB, ${totalLines} líneas). Se retornaron las primeras 500 líneas. Usa 'files.read_file_range' o los parámetros 'startLine'/'endLine' o 'page' con 'linesPerPage' para explorar el resto.`;
          }

          return {
            ok: true,
            path: target,
            content: includeLineNumbers ? lines.map((l, i) => `${i + 1}: ${l}`).join("\n") : lines.join("\n"),
            totalLines,
            linesReturned: lines.length,
            encoding,
            ...(truncated ? { truncated, warning } : {}),
          };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      read_file_range: async ({ path: p, startLine = 1, endLine = 100, range, encoding = "utf8", includeLineNumbers = false } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        try {
          const rawBuffer = await fs.readFile(target);
          const decoded = decodeTextBuffer(rawBuffer, encoding);
          if (decoded.isBinary) {
            return { ok: false, error: `El archivo '${path.basename(target)}' contiene datos binarios no decodificables como texto.` };
          }
          const content = decoded.text;
          const lines = content.split(/\r?\n/);
          const totalLines = lines.length;

          let sLine = startLine !== undefined ? Number(startLine) : (Array.isArray(range) ? Number(range[0]) : 1);
          let eLine = endLine !== undefined ? Number(endLine) : (Array.isArray(range) ? Number(range[1]) : 100);

          const raw1 = Math.max(1, sLine);
          const raw2 = Math.max(1, eLine);
          const start = Math.min(raw1, raw2);
          const end = Math.min(totalLines, Math.max(raw1, raw2));
          const sliced = lines.slice(start - 1, end);
          const formatted = includeLineNumbers
            ? sliced.map((l, i) => `${start + i}: ${l}`).join("\n")
            : sliced.join("\n");
          return {
            ok: true,
            path: target,
            startLine: start,
            endLine: end,
            totalLines,
            linesCount: sliced.length,
            linesReturned: sliced.length,
            content: formatted,
            encoding,
          };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },


      read_multiple_files: async ({ paths = [], path: singlePath, maxFiles = 50 } = {}) => {
        const raw = paths || singlePath;
        const pathList = Array.isArray(raw) ? raw : (raw ? [raw] : (singlePath ? [singlePath] : []));
        if (pathList.length === 0) {
          return { ok: false, error: "El parámetro 'paths' (array o string) es requerido." };
        }
        const limit = Math.min(Number(maxFiles) || 50, 100);
        const results = [];
        for (const item of pathList.slice(0, limit)) {
          const target = runtime.hp(item);
          try {
            const content = await fs.readFile(target, "utf8");
            const s = await fs.stat(target);
            results.push({ path: target, sizeBytes: s.size, totalLines: content.split(/\r?\n/).length, content, ok: true });
          } catch (e) {
            results.push({ path: target, error: e.message, ok: false });
          }
        }
        return { ok: true, count: results.length, files: results };
      },

      read_binary_file: async ({ path: p, format = "base64", limitBytes = 10485760 } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        try {
          const s = await fs.stat(target);
          if (s.size > Number(limitBytes)) {
            return { ok: false, error: `El archivo (${(s.size / 1048576).toFixed(2)} MB) supera el límite configurado de ${(Number(limitBytes) / 1048576).toFixed(2)} MB.` };
          }
          const buf = await fs.readFile(target);
          let data;
          if (format === "hex") data = buf.toString("hex");
          else if (format === "datauri") {
            const mime = categorizeExtension(path.extname(target));
            data = `data:${mime};base64,${buf.toString("base64")}`;
          } else {
            data = buf.toString("base64");
          }
          return { ok: true, path: target, format, sizeBytes: buf.length, data };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      read_json: async ({ path: p, key, defaultValue } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        try {
          const content = await fs.readFile(target, "utf8");
          const parsed = JSON.parse(content);
          const data = key ? getNestedProp(parsed, key) : parsed;
          return { ok: true, path: target, key, data: data !== undefined ? data : defaultValue };
        } catch (e) {
          return { ok: false, error: `Error leyendo/parsing JSON: ${e.message}` };
        }
      },

      read_csv: async ({ path: p, delimiter = ",", hasHeader = true, maxRows = 500 } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        try {
          const content = await fs.readFile(target, "utf8");
          const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
          if (lines.length === 0) return { ok: true, path: target, headers: [], rows: [], count: 0 };

          const parseLine = (line) => {
            const result = [];
            let cur = "";
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"' || char === "'") {
                inQuotes = !inQuotes;
              } else if (char === delimiter && !inQuotes) {
                result.push(cur.trim());
                cur = "";
              } else {
                cur += char;
              }
            }
            result.push(cur.trim());
            return result;
          };

          const rawRows = lines.slice(0, Number(maxRows) || 500).map(parseLine);
          if (hasHeader && rawRows.length > 0) {
            const headers = rawRows[0];
            const dataRows = rawRows.slice(1).map((r) => {
              const obj = {};
              headers.forEach((h, idx) => { obj[h || `col_${idx}`] = r[idx] ?? ""; });
              return obj;
            });
            return { ok: true, path: target, totalLines: lines.length, count: dataRows.length, headers, records: dataRows };
          }
          return { ok: true, path: target, totalLines: lines.length, count: rawRows.length, rows: rawRows };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      // ── 4. Escritura Atómica, Backups & Modificación Quirúrgica ────────────
      write_file: async ({ path: p, content = "", overwrite = true, backup = false, encoding = "utf8" } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        try {
          await fs.mkdir(path.dirname(target), { recursive: true });

          const exists = await fs.access(target).then(() => true).catch(() => false);
          if (exists && !overwrite) {
            return { ok: false, error: `El archivo ya existe y overwrite=false: ${target}` };
          }

          let backupPath = null;
          if (exists && backup) {
            backupPath = await createSafeBackup(target);
          }

          let buf;
          if (Buffer.isBuffer(content)) {
            buf = content;
          } else if (encoding === "base64") {
            buf = Buffer.from(String(content), "base64");
          } else if (encoding === "hex") {
            buf = Buffer.from(String(content), "hex");
          } else {
            const str = typeof content === "string" ? content : JSON.stringify(content, null, 2);
            buf = Buffer.from(str, encoding);
          }

          await fs.writeFile(target, buf);
          const hash = crypto.createHash("sha256").update(buf).digest("hex");
          const lineCount = buf.toString("utf8").split(/\r?\n/).length;

          return {
            ok: true,
            path: target,
            bytesWritten: buf.length,
            linesCount: lineCount,
            checksumSha256: hash,
            ...(backupPath ? { backupPath } : {}),
          };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      write_json: async ({ path: p, data = {}, indent = 2, backup = false } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        try {
          await fs.mkdir(path.dirname(target), { recursive: true });
          let backupPath = null;
          if (backup) backupPath = await createSafeBackup(target);

          const jsonStr = JSON.stringify(data, null, Number(indent) || 2);
          await fs.writeFile(target, jsonStr, "utf8");
          return { ok: true, path: target, bytesWritten: Buffer.byteLength(jsonStr, "utf8"), ...(backupPath ? { backupPath } : {}) };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      json_manager: async ({ path: p, op = "get", key, value, createPath = true, backup = false } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        try {
          let current = {};
          const exists = await fs.access(target).then(() => true).catch(() => false);
          if (exists) {
            const raw = await fs.readFile(target, "utf8");
            current = JSON.parse(raw);
          } else if (op === "get" || op === "delete") {
            return { ok: false, error: `Archivo JSON no encontrado: ${target}` };
          }

          let backupPath = null;
          if (["set", "delete", "merge", "push", "pop", "increment"].includes(op) && backup && exists) {
            backupPath = await createSafeBackup(target);
          }

          if (op === "get") {
            const res = key ? getNestedProp(current, key) : current;
            return { ok: true, path: target, key, value: res };
          }

          if (op === "set") {
            if (!key) return { ok: false, error: "El parámetro 'key' es requerido para op='set'." };
            setNestedProp(current, key, value, createPath);
          } else if (op === "delete") {
            if (!key) return { ok: false, error: "El parámetro 'key' es requerido para op='delete'." };
            deleteNestedProp(current, key);
          } else if (op === "merge") {
            if (typeof value !== "object" || value === null) return { ok: false, error: "'value' debe ser un objeto para merge." };
            if (key) {
              const targetObj = getNestedProp(current, key) || {};
              setNestedProp(current, key, { ...targetObj, ...value }, createPath);
            } else {
              current = { ...current, ...value };
            }
          } else if (op === "push") {
            if (!key) return { ok: false, error: "El parámetro 'key' es requerido para op='push'." };
            let arr = getNestedProp(current, key);
            if (!Array.isArray(arr)) {
              arr = [];
              setNestedProp(current, key, arr, createPath);
            }
            arr.push(value);
          } else if (op === "increment") {
            if (!key) return { ok: false, error: "El parámetro 'key' es requerido para op='increment'." };
            const currVal = Number(getNestedProp(current, key) || 0);
            const delta = Number(value || 1);
            setNestedProp(current, key, currVal + delta, createPath);
          }

          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, JSON.stringify(current, null, 2), "utf8");
          return { ok: true, path: target, operation: op, key, ...(backupPath ? { backupPath } : {}) };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      append_to_file: async ({ path: p, content = "", addNewline = true } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        try {
          await fs.mkdir(path.dirname(target), { recursive: true });
          let strContent = typeof content === "string" ? content : JSON.stringify(content, null, 2);
          if (addNewline && !strContent.endsWith("\n")) strContent += "\n";
          await fs.appendFile(target, strContent, "utf8");
          return { ok: true, path: target, bytesAppended: Buffer.byteLength(strContent, "utf8") };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      edit_file: performEditFile,
      str_replace: performEditFile,
      replace_in_file: performEditFile,
      replace_file_content: performEditFile,

      insert_lines: async ({ path: p, atLine, afterLine, afterPattern, lines, backup = false } = {}) => {
        if (!p || lines === undefined) return { ok: false, error: "Los parámetros 'path' y 'lines' son requeridos." };
        const target = runtime.hp(p);
        try {
          const current = await fs.readFile(target, "utf8");
          const fileLines = current.split(/\r?\n/);
          const toInsert = Array.isArray(lines) ? lines : String(lines).split(/\r?\n/);
          let targetIndex = -1;

          if (atLine !== undefined) {
            targetIndex = Math.max(0, Number(atLine) - 1);
          } else if (afterLine !== undefined) {
            targetIndex = Math.min(fileLines.length, Number(afterLine));
          } else if (afterPattern) {
            const idx = fileLines.findIndex((l) => l.includes(afterPattern));
            if (idx === -1) return { ok: false, error: `Patrón '${afterPattern}' no encontrado.` };
            targetIndex = idx + 1;
          } else {
            targetIndex = fileLines.length;
          }

          fileLines.splice(targetIndex, 0, ...toInsert);
          let backupPath = null;
          if (backup) backupPath = await createSafeBackup(target);

          await fs.writeFile(target, fileLines.join("\n"), "utf8");
          return { ok: true, path: target, insertedAt: targetIndex + 1, linesInserted: toInsert.length, totalLines: fileLines.length, ...(backupPath ? { backupPath } : {}) };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      delete_lines: async ({ path: p, startLine, endLine, lineNumbers, backup = false } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        try {
          const current = await fs.readFile(target, "utf8");
          let fileLines = current.split(/\r?\n/);
          const originalTotal = fileLines.length;

          if (Array.isArray(lineNumbers) && lineNumbers.length > 0) {
            const numSet = new Set(lineNumbers.map(Number));
            fileLines = fileLines.filter((_, idx) => !numSet.has(idx + 1));
          } else if (startLine !== undefined) {
            const start = Math.max(1, Number(startLine)) - 1;
            const end = endLine !== undefined ? Math.min(fileLines.length, Number(endLine)) : start + 1;
            fileLines.splice(start, end - start);
          } else {
            return { ok: false, error: "Se requiere 'startLine' o 'lineNumbers' (array)." };
          }

          let backupPath = null;
          if (backup) backupPath = await createSafeBackup(target);

          await fs.writeFile(target, fileLines.join("\n"), "utf8");
          return { ok: true, path: target, linesDeleted: originalTotal - fileLines.length, remainingLines: fileLines.length, ...(backupPath ? { backupPath } : {}) };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      replace_lines: async ({ path: p, startLine, endLine, lines, backup = false } = {}) => {
        if (!p || startLine === undefined || lines === undefined) {
          return { ok: false, error: "Los parámetros 'path', 'startLine' y 'lines' son requeridos." };
        }
        const target = runtime.hp(p);
        try {
          const current = await fs.readFile(target, "utf8");
          const fileLines = current.split(/\r?\n/);
          const start = Math.max(1, Number(startLine)) - 1;
          const end = endLine !== undefined ? Math.min(fileLines.length, Number(endLine)) : start + 1;
          const toInsert = Array.isArray(lines) ? lines : String(lines).split(/\r?\n/);

          fileLines.splice(start, end - start, ...toInsert);
          let backupPath = null;
          if (backup) backupPath = await createSafeBackup(target);

          await fs.writeFile(target, fileLines.join("\n"), "utf8");
          return { ok: true, path: target, startLine, endLine: end, linesInserted: toInsert.length, totalLines: fileLines.length, ...(backupPath ? { backupPath } : {}) };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      patch_file: async ({ path: p, searchBlock, replaceBlock, backup = false } = {}) => {
        if (!p || !searchBlock || replaceBlock === undefined) {
          return { ok: false, error: "Los parámetros 'path', 'searchBlock' y 'replaceBlock' son requeridos." };
        }
        const target = runtime.hp(p);
        try {
          const current = await fs.readFile(target, "utf8");
          const normCurrent = current.replace(/\r\n/g, "\n");
          const normSearch = searchBlock.replace(/\r\n/g, "\n");
          const normReplace = replaceBlock.replace(/\r\n/g, "\n");

          if (!normCurrent.includes(normSearch)) {
            return { ok: false, error: "El bloque de búsqueda 'searchBlock' no coincide exactamente en el archivo." };
          }

          let backupPath = null;
          if (backup) backupPath = await createSafeBackup(target);

          const updated = normCurrent.replace(normSearch, normReplace);
          await fs.writeFile(target, updated, "utf8");
          return { ok: true, path: target, patched: true, ...(backupPath ? { backupPath } : {}) };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      write_csv: async ({ path: p, headers = [], rows = [], delimiter = ",", append = false } = {}) => {
        if (!p || !Array.isArray(rows)) return { ok: false, error: "Los parámetros 'path' y 'rows' (array) son requeridos." };
        const target = runtime.hp(p);
        try {
          await fs.mkdir(path.dirname(target), { recursive: true });
          const escapeCell = (val) => {
            const s = String(val ?? "");
            if (s.includes(delimiter) || s.includes('"') || s.includes("\n")) {
              return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
          };

          const lines = [];
          if (!append && headers.length > 0) {
            lines.push(headers.map(escapeCell).join(delimiter));
          }

          for (const row of rows) {
            if (Array.isArray(row)) {
              lines.push(row.map(escapeCell).join(delimiter));
            } else if (typeof row === "object" && row !== null) {
              const h = headers.length > 0 ? headers : Object.keys(row);
              lines.push(h.map((key) => escapeCell(row[key])).join(delimiter));
            }
          }

          const outContent = lines.join("\n") + "\n";
          if (append) {
            await fs.appendFile(target, outContent, "utf8");
          } else {
            await fs.writeFile(target, outContent, "utf8");
          }
          return { ok: true, path: target, rowsWritten: rows.length };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      // ── 5. Operaciones de Sistema de Archivos & Por Lotes ───────────────────
      copy_file: async ({ source, destination, overwrite = true } = {}) => {
        if (!source || !destination) return { ok: false, error: "Los parámetros 'source' y 'destination' son requeridos." };
        const src = runtime.hp(source);
        const dst = runtime.hp(destination);
        try {
          await fs.mkdir(path.dirname(dst), { recursive: true });
          await fs.copyFile(src, dst, overwrite ? 0 : fs.constants.COPYFILE_EXCL);
          return { ok: true, source: src, destination: dst };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      move_file: async ({ source, destination, overwrite = true } = {}) => {
        if (!source || !destination) return { ok: false, error: "Los parámetros 'source' y 'destination' son requeridos." };
        const src = runtime.hp(source);
        const dst = runtime.hp(destination);
        try {
          await fs.mkdir(path.dirname(dst), { recursive: true });
          await fs.rename(src, dst);
          return { ok: true, source: src, destination: dst };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      delete_path: async ({ path: p, recursive = true, force = true } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        try {
          await fs.rm(target, { recursive: Boolean(recursive), force: Boolean(force) });
          return { ok: true, path: target, deleted: true };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      create_directory: async ({ path: p } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        try {
          await fs.mkdir(target, { recursive: true });
          return { ok: true, path: target, created: true };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      touch_file: async ({ path: p } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        try {
          await fs.mkdir(path.dirname(target), { recursive: true });
          const now = new Date();
          try {
            await fs.utimes(target, now, now);
          } catch {
            await fs.writeFile(target, "", { flag: "a" });
          }
          return { ok: true, path: target, touched: true };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      batch_rename: async ({ directory = ".", pattern, replacement } = {}) => {
        if (!pattern || replacement === undefined) return { ok: false, error: "Los parámetros 'pattern' y 'replacement' son requeridos." };
        const targetDir = runtime.hp(directory);
        try {
          const entries = await fs.readdir(targetDir);
          let testReg;
          let replaceReg;
          try {
            testReg = new RegExp(pattern);
            replaceReg = new RegExp(pattern, "g");
          } catch (regErr) {
            return { ok: false, error: `Patrón regex inválido: ${regErr.message}` };
          }
          const renamed = [];
          for (const file of entries) {
            if (testReg.test(file)) {
              const newName = file.replace(replaceReg, replacement);
              await fs.rename(path.join(targetDir, file), path.join(targetDir, newName));
              renamed.push({ oldName: file, newName });
            }
          }
          return { ok: true, directory: targetDir, count: renamed.length, renamed };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      batch_copy: async ({ files = [], overwrite = true, stopOnError = false } = {}) => {
        if (!Array.isArray(files) || files.length === 0) return { ok: false, error: "Se requiere un array 'files' con objetos { source, destination }." };
        const results = [];
        let successCount = 0;
        for (const item of files) {
          const src = runtime.hp(item.source);
          const dst = runtime.hp(item.destination);
          try {
            await fs.mkdir(path.dirname(dst), { recursive: true });
            await fs.copyFile(src, dst, overwrite ? 0 : fs.constants.COPYFILE_EXCL);
            results.push({ source: src, destination: dst, ok: true });
            successCount++;
          } catch (e) {
            results.push({ source: src, destination: dst, ok: false, error: e.message });
            if (stopOnError) break;
          }
        }
        return { ok: successCount === files.length, total: files.length, succeeded: successCount, failed: files.length - successCount, results };
      },

      batch_move: async ({ files = [], stopOnError = false } = {}) => {
        if (!Array.isArray(files) || files.length === 0) return { ok: false, error: "Se requiere un array 'files' con objetos { source, destination }." };
        const results = [];
        let successCount = 0;
        for (const item of files) {
          const src = runtime.hp(item.source);
          const dst = runtime.hp(item.destination);
          try {
            await fs.mkdir(path.dirname(dst), { recursive: true });
            await fs.rename(src, dst);
            results.push({ source: src, destination: dst, ok: true });
            successCount++;
          } catch (e) {
            results.push({ source: src, destination: dst, ok: false, error: e.message });
            if (stopOnError) break;
          }
        }
        return { ok: successCount === files.length, total: files.length, succeeded: successCount, failed: files.length - successCount, results };
      },

      batch_delete: async ({ paths = [], stopOnError = false } = {}) => {
        if (!Array.isArray(paths) || paths.length === 0) return { ok: false, error: "Se requiere un array 'paths' con las rutas a eliminar." };
        const results = [];
        let successCount = 0;
        for (const item of paths) {
          const target = runtime.hp(item);
          try {
            await fs.rm(target, { recursive: true, force: true });
            results.push({ path: target, ok: true });
            successCount++;
          } catch (e) {
            results.push({ path: target, ok: false, error: e.message });
            if (stopOnError) break;
          }
        }
        return { ok: successCount === paths.length, total: paths.length, succeeded: successCount, failed: paths.length - successCount, results };
      },

      find_and_replace_in_files: async ({ directory = ".", filePattern = "*", pattern, searchText, replaceText, find, replace, search, oldText, newText, excludePatterns = ["node_modules", ".git", "dist", "build"] } = {}) => {
        const searchStr = searchText !== undefined ? searchText : (find !== undefined ? find : (search !== undefined ? search : oldText));
        const replaceStr = replaceText !== undefined ? replaceText : (replace !== undefined ? replace : newText);
        const fPattern = filePattern !== "*" ? filePattern : (pattern || "*");

        if (searchStr === undefined || replaceStr === undefined) {
          return { ok: false, error: "Los parámetros 'searchText' (o 'find') y 'replaceText' (o 'replace') son requeridos." };
        }
        const targetDir = runtime.hp(directory);
        try {
          const files = await searchFilesHelper(targetDir, fPattern, excludePatterns, 500);
          const modified = [];
          const targetSearch = String(searchStr);
          const targetReplace = String(replaceStr);

          for (const f of files) {
            if (f.isDirectory) continue;
            try {
              const content = await fs.readFile(f.path, "utf8");
              let updated = null;
              let count = 0;

              if (content.includes(targetSearch)) {
                count = content.split(targetSearch).length - 1;
                updated = content.replaceAll(targetSearch, targetReplace);
              } else {
                const usesCRLF = content.includes("\r\n");
                const normalizedSearch = usesCRLF
                  ? targetSearch.replace(/(?<!\r)\n/g, "\r\n")
                  : targetSearch.replace(/\r\n/g, "\n");

                if (content.includes(normalizedSearch)) {
                  const normalizedReplace = usesCRLF
                    ? targetReplace.replace(/(?<!\r)\n/g, "\r\n")
                    : targetReplace.replace(/\r\n/g, "\n");

                  count = content.split(normalizedSearch).length - 1;
                  updated = content.replaceAll(normalizedSearch, normalizedReplace);
                }
              }

              if (updated !== null && count > 0) {
                await fs.writeFile(f.path, updated, "utf8");
                modified.push({ file: f.path, occurrencesReplaced: count });
              }
            } catch {}
          }
          return { ok: true, directory: targetDir, modifiedFilesCount: modified.length, modified };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },


      set_attributes: async ({ path: p, readonly, hidden, mode } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        try {
          if (mode !== undefined) {
            const parsedMode = typeof mode === "string" ? parseInt(mode, 8) : Number(mode);
            await fs.chmod(target, parsedMode);
          }
          if (process.platform === "win32" && (readonly !== undefined || hidden !== undefined)) {
            const args = [];
            if (readonly === true) args.push("+R");
            else if (readonly === false) args.push("-R");
            if (hidden === true) args.push("+H");
            else if (hidden === false) args.push("-H");
            if (args.length > 0) {
              await runtime.run(`attrib ${args.join(" ")} ${runtime.shellQuote(target)}`);
            }
          }
          return { ok: true, path: target, updated: true };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      // ── 6. Compresión & Archivos Comprimidos ────────────────────────────────
      compress_path: async ({ source, destination } = {}) => {
        if (!source) return { ok: false, error: "El parámetro 'source' es requerido." };
        const src = runtime.hp(source);
        const dst = runtime.hp(destination || `${src}.zip`);
        try {
          await fs.mkdir(path.dirname(dst), { recursive: true });
          const isWin = process.platform === "win32";
          const cmd = isWin
            ? `Compress-Archive -Path ${runtime.shellQuote(src)} -DestinationPath ${runtime.shellQuote(dst)} -Force`
            : `tar -czf ${runtime.shellQuote(dst)} -C ${runtime.shellQuote(path.dirname(src))} ${runtime.shellQuote(path.basename(src))}`;
          const res = await runtime.run(cmd);
          return { ok: res.ok, source: src, destination: dst, error: res.ok ? undefined : res.stderr };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      extract_archive: async ({ source, destination } = {}) => {
        if (!source) return { ok: false, error: "El parámetro 'source' es requerido." };
        const src = runtime.hp(source);
        const dst = runtime.hp(destination || path.dirname(src));
        try {
          await fs.mkdir(dst, { recursive: true });
          const isWin = process.platform === "win32";
          const cmd = isWin
            ? `Expand-Archive -Path ${runtime.shellQuote(src)} -DestinationPath ${runtime.shellQuote(dst)} -Force`
            : `tar -xzf ${runtime.shellQuote(src)} -C ${runtime.shellQuote(dst)}`;
          const res = await runtime.run(cmd);
          return { ok: res.ok, source: src, destination: dst, error: res.ok ? undefined : res.stderr };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      list_archive_contents: async ({ path: p } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        const isWin = process.platform === "win32";
        const cmd = isWin
          ? `try { tar.exe -tf ${runtime.shellQuote(target)} } catch { Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::OpenRead(${runtime.shellQuote(target)}).Entries | Select-Object -ExpandProperty FullName }`
          : `tar -tf ${runtime.shellQuote(target)} 2>/dev/null || unzip -l ${runtime.shellQuote(target)}`;
        try {
          const res = await runtime.run(cmd);
          return {
            ok: res.ok,
            path: target,
            contents: splitLines(res.stdout),
            ...(res.ok ? {} : { error: res.stderr || "Error leyendo contenido del archivo comprimido o formato no soportado." })
          };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      read_document: async ({ path: p } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        const ext = path.extname(target).toLowerCase();
        try {
          if (ext === ".md" || ext === ".markdown") {
            const raw = await fs.readFile(target, "utf8");
            let frontmatter = null;
            let body = raw;
            const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
            if (fmMatch) {
              const fmRaw = fmMatch[1];
              body = fmMatch[2];
              frontmatter = {};
              for (const line of fmRaw.split(/\r?\n/)) {
                const colonIdx = line.indexOf(":");
                if (colonIdx > 0) {
                  const k = line.slice(0, colonIdx).trim();
                  let v = line.slice(colonIdx + 1).trim();
                  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                    v = v.slice(1, -1);
                  }
                  frontmatter[k] = v;
                }
              }
            }
            return {
              ok: true,
              path: target,
              format: "md",
              content: body.trim(),
              raw,
              frontmatter,
              totalLines: raw.split(/\r?\n/).length,
            };
          }
          if (ext === ".txt") {
            const content = await fs.readFile(target, "utf8");
            return { ok: true, path: target, format: "txt", content, totalLines: content.split(/\r?\n/).length };
          }
          if (ext === ".docx") {
            const mammothModule = await import("mammoth");
            const mammoth = mammothModule.default || mammothModule;
            const { value, messages } = await mammoth.extractRawText({ path: target });
            return { ok: true, path: target, format: "docx", content: value, warnings: messages };
          }
          if (ext === ".xlsx" || ext === ".xls") {
            const ExcelJS = (await import("exceljs")).default;
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.readFile(target);
            const sheets = [];
            wb.eachSheet((ws) => {
              const rows = [];
              ws.eachRow({ includeEmpty: false }, (row) => {
                rows.push(row.values.slice(1).map((v) => (v == null ? "" : String(v))));
              });
              sheets.push({ name: ws.name, rowCount: ws.rowCount, rows: rows.slice(0, 500) });
            });
            return { ok: true, path: target, format: "xlsx", sheetCount: sheets.length, sheets };
          }
          if (ext === ".pdf") {
            const { extractText } = await import("unpdf");
            const buffer = await fs.readFile(target);
            const res = await extractText(new Uint8Array(buffer));
            const text = Array.isArray(res.text) ? res.text.join("\n") : String(res.text || "");
            return { ok: true, path: target, format: "pdf", totalPages: res.totalPages, content: text.slice(0, 200000) };
          }
          return { ok: false, error: `Formato no soportado: ${ext}. Soportados: .md, .markdown, .txt, .docx, .xlsx, .xls, .pdf` };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      create_document: async ({ path: p, title = "", content = "", paragraphs, format, frontmatter, metadata } = {}) => {
        if (!p) return { ok: false, error: "El parámetro 'path' es requerido." };
        const target = runtime.hp(p);
        const ext = (format ? (format.startsWith(".") ? format : `.${format}`) : path.extname(target) || ".docx").toLowerCase();
        try {
          await fs.mkdir(path.dirname(target), { recursive: true });

          if (ext === ".md" || ext === ".markdown") {
            let mdOutput = "";
            const fm = frontmatter || metadata;
            if (fm && typeof fm === "object") {
              mdOutput += "---\n";
              for (const [k, v] of Object.entries(fm)) {
                if (v === undefined || v === null) continue;
                if (typeof v === "object") {
                  mdOutput += `${k}:\n`;
                  if (Array.isArray(v)) {
                    for (const item of v) mdOutput += `  - ${item}\n`;
                  } else {
                    for (const [subK, subV] of Object.entries(v)) mdOutput += `  ${subK}: ${subV}\n`;
                  }
                } else if (typeof v === "string" && (v.includes(":") || v.includes("#") || v.includes('"') || v.includes("'"))) {
                  mdOutput += `${k}: "${v.replace(/"/g, '\\"')}"\n`;
                } else {
                  mdOutput += `${k}: ${v}\n`;
                }
              }
              mdOutput += "---\n\n";
            } else if (typeof fm === "string" && fm.trim()) {
              const cleanFm = fm.replace(/^---\r?\n?/, "").replace(/\r?\n?---$/, "").trim();
              mdOutput += `---\n${cleanFm}\n---\n\n`;
            }

            if (title) {
              mdOutput += `# ${title}\n\n`;
            }

            if (content) {
              mdOutput += typeof content === "string" ? content : JSON.stringify(content, null, 2);
              if (!mdOutput.endsWith("\n")) mdOutput += "\n";
            } else if (Array.isArray(paragraphs)) {
              for (const para of paragraphs) {
                if (typeof para === "object" && para !== null) {
                  const hLevel = Math.min(Math.max(Number(para.level || para.headingLevel || 2), 1), 6);
                  if (para.heading || para.title) {
                    mdOutput += `${"#".repeat(hLevel)} ${para.heading || para.title}\n\n`;
                  }
                  if (para.content || para.text || para.body) {
                    mdOutput += `${para.content || para.text || para.body}\n\n`;
                  }
                } else {
                  mdOutput += `${String(para)}\n\n`;
                }
              }
            }

            const finalContent = mdOutput.trimEnd() + "\n";
            const buf = Buffer.from(finalContent, "utf8");
            await fs.writeFile(target, buf);
            const lineCount = finalContent.split(/\r?\n/).length;
            return { ok: true, path: target, format: "md", sizeBytes: buf.length, linesCount: lineCount };
          }

          if (ext === ".txt") {
            let txtOutput = "";
            if (title) txtOutput += `${title}\n${"=".repeat(title.length)}\n\n`;
            if (content) {
              txtOutput += typeof content === "string" ? content : String(content);
            } else if (Array.isArray(paragraphs)) {
              txtOutput += paragraphs.join("\n\n");
            }
            const finalTxt = txtOutput.trimEnd() + "\n";
            const buf = Buffer.from(finalTxt, "utf8");
            await fs.writeFile(target, buf);
            return { ok: true, path: target, format: "txt", sizeBytes: buf.length };
          }

          if (ext === ".docx") {
            const { Document, Packer, Paragraph: DocParagraph, TextRun, HeadingLevel } = await import("docx");
            const children = [];
            if (title) children.push(new DocParagraph({ text: title, heading: HeadingLevel.HEADING_1 }));
            const paras = paragraphs || (content ? content.split(/\r?\n/) : []);
            for (const para of paras) {
              children.push(new DocParagraph({ children: [new TextRun({ text: String(para) })] }));
            }
            const doc = new Document({ sections: [{ properties: {}, children }] });
            const buf = await Packer.toBuffer(doc);
            await fs.writeFile(target, buf);
            return { ok: true, path: target, format: "docx", sizeBytes: buf.length };
          }

          if (ext === ".xlsx") {
            const ExcelJS = (await import("exceljs")).default;
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet(title || "Sheet1");
            const rows = paragraphs || (content ? content.split(/\r?\n/).map((l) => l.split(",")) : [[]]);
            for (const row of rows) ws.addRow(Array.isArray(row) ? row : [row]);
            await wb.xlsx.writeFile(target);
            return { ok: true, path: target, format: "xlsx" };
          }

          if (ext === ".pdf") {
            const { PDFDocument: PDFLibDoc, StandardFonts, rgb } = await import("pdf-lib");
            const pdfDoc = await PDFLibDoc.create();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const page = pdfDoc.addPage([595, 842]);
            const lines = [title, ...(paragraphs || (content ? content.split(/\r?\n/) : []))].filter(Boolean);
            let y = 800;
            for (const line of lines.slice(0, 50)) {
              page.drawText(line.slice(0, 100), { x: 40, y, size: 11, font, color: rgb(0, 0, 0) });
              y -= 16;
              if (y < 40) break;
            }
            const bytes = await pdfDoc.save();
            await fs.writeFile(target, bytes);
            return { ok: true, path: target, format: "pdf", sizeBytes: bytes.length };
          }

          return { ok: false, error: `Formato no soportado: ${ext}. Soportados: .md, .markdown, .txt, .docx, .xlsx, .pdf` };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      validate_workspace: async ({ path: targetPath = "." } = {}) => {
        const { existsSync } = await import("node:fs");
        const resolved = runtime.hp(targetPath);
        const exists = existsSync(resolved);
        if (!exists) {
          return { ok: false, exists: false, path: resolved, error: `La ruta del workspace no existe: '${resolved}'` };
        }
        const stat = await fs.stat(resolved);
        const isDirectory = stat.isDirectory();
        const rootPath = runtime.root;
        const isInsideRoot = resolved.toLowerCase().startsWith(rootPath.toLowerCase()) || resolved.toLowerCase() === rootPath.toLowerCase();

        return {
          ok: true,
          exists: true,
          isDirectory,
          path: resolved,
          workspaceRoot: rootPath,
          isInsideRoot,
          platform: "win32",
          accessible: true,
        };
      },
    },
    {
      delete_path: "poweruser",
      write_file: "user",
      write_json: "user",
      json_manager: "user",
      append_to_file: "user",
      edit_file: "user",
      str_replace: "user",
      replace_in_file: "user",
      replace_file_content: "user",
      insert_lines: "user",
      delete_lines: "user",
      replace_lines: "user",
      patch_file: "user",
      write_csv: "user",
      move_file: "user",
      copy_file: "user",
      batch_copy: "user",
      batch_move: "user",
      batch_delete: "poweruser",
      compress_path: "user",
      extract_archive: "user",
      batch_rename: "poweruser",
      find_and_replace_in_files: "poweruser",
      set_attributes: "poweruser",
      create_document: "user",
    }
  );
}
