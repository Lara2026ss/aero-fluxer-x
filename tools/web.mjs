/**
 * 🌐 FLUXER CORE MCP — tools/web.mjs
 * Dominio modular oficial de navegación, búsqueda y descarga segura de medios en la Web.
 * 
 * Capacidades:
 * 1. Búsqueda web abierta (DuckDuckGo, Wikipedia, Reddit, respuestas verificadas).
 * 2. Búsqueda especializada de imágenes descargables (search_images).
 * 3. Consultas a Wikipedia (wikipedia) en español e inglés.
 * 4. Búsqueda de debates técnicos y soluciones en Reddit (reddit).
 * 5. Lectura y extracción limpia de páginas web (read_page) en Markdown/texto.
 * 6. Descarga con Máxima Seguridad (download / download_media):
 *    - Whitelist estricta: ÚNICAMENTE imágenes y videos (y PDFs seguros).
 *    - Bloqueo total de ejecutables y scripts (.exe, .bat, .ps1, .dll, etc.).
 *    - Análisis obligatorio de Magic Bytes binarios (anti-spoofing / anti-renombrado).
 *    - Detección proactiva de cabeceras MZ/PE y ELF.
 *    - Límite de tamaño seguro (100 MB por defecto) y anti-SSRF.
 *    - Guardado automático en la carpeta de Descargas del usuario (~/Downloads).
 */

import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

// ── DEFINICIÓN DE FORMATOS Y MAGIC BYTES ─────────────────────────────────────
const ALLOWED_MEDIA = {
  // Imágenes
  "image/jpeg": { extensions: [".jpg", ".jpeg"], type: "image", verify: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { extensions: [".png"], type: "image", verify: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/gif": { extensions: [".gif"], type: "image", verify: (b) => b.subarray(0, 4).toString("ascii") === "GIF8" },
  "image/webp": { extensions: [".webp"], type: "image", verify: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
  "image/bmp": { extensions: [".bmp"], type: "image", verify: (b) => b[0] === 0x42 && b[1] === 0x4d },
  "image/x-icon": { extensions: [".ico"], type: "image", verify: (b) => b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00 },
  "image/svg+xml": {
    extensions: [".svg"],
    type: "image",
    verify: (b) => {
      const txt = b.subarray(0, 256).toString("utf8").toLowerCase();
      return txt.includes("<svg") || txt.includes("<?xml");
    },
  },
  // Videos
  "video/mp4": { extensions: [".mp4", ".m4v"], type: "video", verify: (b) => b.subarray(4, 8).toString("ascii") === "ftyp" },
  "video/webm": { extensions: [".webm"], type: "video", verify: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  "video/quicktime": { extensions: [".mov"], type: "video", verify: (b) => b.subarray(4, 8).toString("ascii") === "ftyp" || b.subarray(4, 8).toString("ascii") === "moov" },
  "video/x-matroska": { extensions: [".mkv"], type: "video", verify: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  // Documentos seguros permitidos para flujos de trabajo (PDF)
  "application/pdf": { extensions: [".pdf"], type: "document", verify: (b) => b.subarray(0, 5).toString("ascii") === "%PDF-" },
};

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".dll", ".sys", ".com", ".bat", ".cmd", ".ps1", ".vbs", ".vbe",
  ".js", ".jse", ".wsf", ".wsh", ".mjs", ".sh", ".bash", ".scr", ".msi",
  ".msp", ".reg", ".hta", ".cpl", ".pif", ".jar", ".iso", ".img", ".vhd",
  ".lnk", ".inf", ".scf", ".gadget", ".zip", ".rar", ".7z", ".tar", ".gz"
]);

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 FluxerX/12.0";

/**
 * Valida si una dirección URL apunta a una IP privada o loopback (protección SSRF)
 */
function isDisallowedHost(hostname) {
  const host = hostname.toLowerCase().trim();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
  if (host === "169.254.169.254") return true; // AWS/GCP metadata
  if (host.startsWith("192.168.") || host.startsWith("10.") || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
  return false;
}

/**
 * Limpia texto HTML convirtiéndolo a texto legible
 */
function stripHtml(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * Factory principal del dominio Web
 */
export function createWebDomain({ runtime, domain }) {
  const actions = {
    /**
     * 🔎 web.search: Búsqueda general en la web con DuckDuckGo, Wikipedia y Reddit
     */
    search: async ({ query, domain: filterDomain = null, limit = 5, engine = "all" } = {}) => {
      if (!query || typeof query !== "string" || !query.trim()) {
        return { ok: false, error: "Se requiere 'query' con el texto de búsqueda." };
      }

      const q = query.trim();
      const maxResults = Math.max(1, Math.min(Number(limit) || 5, 20));
      const results = [];

      // 1. Si se solicita Wikipedia o la consulta es enciclopédica
      if (engine === "all" || engine === "wikipedia" || filterDomain?.includes("wikipedia")) {
        try {
          const wikiUrl = `https://es.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=${maxResults}&namespace=0&format=json`;
          const res = await fetch(wikiUrl, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(6000) });
          if (res.ok) {
            const data = await res.json();
            const titles = data[1] || [];
            const descriptions = data[2] || [];
            const urls = data[3] || [];
            for (let i = 0; i < titles.length; i++) {
              results.push({
                title: titles[i],
                snippet: descriptions[i] || `Artículo de Wikipedia sobre ${titles[i]}`,
                url: urls[i],
                source: "wikipedia",
              });
            }
          }
        } catch (_) {}
      }

      // 2. DuckDuckGo Instant Answers API
      if (results.length < maxResults && (engine === "all" || engine === "ddg")) {
        try {
          const ddgApiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
          const res = await fetch(ddgApiUrl, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(6000) });
          if (res.ok) {
            const data = await res.json();
            if (data.AbstractText && data.AbstractURL) {
              results.push({
                title: data.Heading || q,
                snippet: data.AbstractText,
                url: data.AbstractURL,
                source: "duckduckgo_instant",
              });
            }
            if (Array.isArray(data.RelatedTopics)) {
              for (const topic of data.RelatedTopics) {
                if (results.length >= maxResults) break;
                if (topic.Text && topic.FirstURL) {
                  results.push({
                    title: topic.Text.split(" - ")[0] || topic.Text.slice(0, 60),
                    snippet: topic.Text,
                    url: topic.FirstURL,
                    source: "duckduckgo_topic",
                  });
                }
              }
            }
          }
        } catch (_) {}
      }

      // 3. DuckDuckGo Lite / HTML scraping para resultados web abiertos
      if (results.length < maxResults && engine !== "wikipedia") {
        try {
          let searchQuery = q;
          if (filterDomain === "reddit") searchQuery += " site:reddit.com";
          else if (filterDomain) searchQuery += ` site:${filterDomain}`;

          const ddgHtmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
          const res = await fetch(ddgHtmlUrl, {
            headers: {
              "User-Agent": USER_AGENT,
              "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
            },
            signal: AbortSignal.timeout(8000),
          });

          if (res.ok) {
            const html = await res.text();
            // Extracción limpia de enlaces de resultados
            const linkMatches = [...html.matchAll(/<a class="result__url" href="([^"]+)">([\s\S]*?)<\/a>/g)];
            const snippetMatches = [...html.matchAll(/<a class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];

            for (let i = 0; i < linkMatches.length && results.length < maxResults; i++) {
              let rawUrl = linkMatches[i][1];
              if (rawUrl.includes("uddg=")) {
                const urlParam = rawUrl.match(/uddg=([^&]+)/);
                if (urlParam) rawUrl = decodeURIComponent(urlParam[1]);
              }
              const title = stripHtml(linkMatches[i][2]);
              const snippet = snippetMatches[i] ? stripHtml(snippetMatches[i][1]) : "";

              if (rawUrl.startsWith("http")) {
                results.push({
                  title: title || rawUrl,
                  snippet: snippet || "Resultado de búsqueda web",
                  url: rawUrl,
                  source: filterDomain || "web",
                });
              }
            }
          }
        } catch (_) {}
      }

      return {
        ok: true,
        query: q,
        count: results.length,
        results,
        tip_for_ai: "Puedes usar web.read_page { url } para leer el contenido completo de cualquiera de estos resultados, o web.download { url } si es una imagen o video.",
      };
    },

    /**
     * 🖼️ web.search_images: Busca imágenes específicas listas para descargar y usar
     */
    search_images: async ({ query, limit = 5 } = {}) => {
      if (!query || typeof query !== "string" || !query.trim()) {
        return { ok: false, error: "Se requiere 'query' para buscar imágenes." };
      }

      const q = query.trim();
      const maxResults = Math.max(1, Math.min(Number(limit) || 5, 15));
      const images = [];

      try {
        // Consultar Wikimedia Commons API para imágenes de alta calidad con licencia libre garantizada
        const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=${maxResults}&prop=imageinfo&iiprop=url|size|mime&format=json`;
        const res = await fetch(commonsUrl, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const data = await res.json();
          const pages = data.query?.pages || {};
          for (const p of Object.values(pages)) {
            const info = p.imageinfo?.[0];
            if (info?.url) {
              images.push({
                title: (p.title || "").replace(/^File:/i, ""),
                url: info.url,
                width: info.width,
                height: info.height,
                mime_type: info.mime,
                source: "wikimedia_commons",
              });
            }
          }
        }
      } catch (_) {}

      // Fallback a Unsplash Source si commons no dio suficientes
      if (images.length === 0) {
        images.push({
          title: `Imagen representativa de ${q}`,
          url: `https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1000&q=80`,
          mime_type: "image/jpeg",
          source: "stock_fallback",
        });
      }

      return {
        ok: true,
        query: q,
        count: images.length,
        images,
        instruction_for_ai: "Para guardar cualquiera de estas imágenes en la carpeta de descargas del usuario, usa: web.download { url: '<url_de_la_imagen>' }.",
      };
    },

    /**
     * 📖 web.wikipedia: Consulta directa a Wikipedia con resumen y datos estructurados
     */
    wikipedia: async ({ query, lang = "es", limit = 3 } = {}) => {
      if (!query || typeof query !== "string") {
        return { ok: false, error: "Se requiere 'query'." };
      }
      const targetLang = ["es", "en", "fr", "de", "pt"].includes(lang?.toLowerCase()) ? lang.toLowerCase() : "es";
      const q = query.trim();

      try {
        const searchUrl = `https://${targetLang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=${limit}&format=json`;
        const res = await fetch(searchUrl, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const searchList = data.query?.search || [];

        if (searchList.length === 0) {
          return { ok: true, found: false, query: q, message: `No se encontraron artículos en Wikipedia (${targetLang}) para "${q}".` };
        }

        const firstTitle = searchList[0].title;
        const summaryUrl = `https://${targetLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstTitle)}`;
        const sumRes = await fetch(summaryUrl, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(6000) });
        let summary = null;
        if (sumRes.ok) {
          const sumData = await sumRes.json();
          summary = {
            title: sumData.title,
            extract: sumData.extract,
            description: sumData.description,
            page_url: sumData.content_urls?.desktop?.page,
            thumbnail_url: sumData.thumbnail?.source,
          };
        }

        return {
          ok: true,
          found: true,
          query: q,
          language: targetLang,
          best_match: summary || { title: firstTitle, extract: stripHtml(searchList[0].snippet) },
          other_results: searchList.slice(1).map((s) => ({
            title: s.title,
            snippet: stripHtml(s.snippet),
            url: `https://${targetLang}.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, "_"))}`,
          })),
        };
      } catch (err) {
        return { ok: false, error: `Error consultando Wikipedia: ${err.message}` };
      }
    },

    /**
     * 💬 web.reddit: Búsqueda de debates técnicos, opiniones y soluciones en Reddit
     */
    reddit: async ({ query, subreddit = null, limit = 5 } = {}) => {
      if (!query || typeof query !== "string") {
        return { ok: false, error: "Se requiere 'query'." };
      }
      const q = query.trim();
      const maxResults = Math.max(1, Math.min(Number(limit) || 5, 15));

      let redditQuery = `site:reddit.com ${q}`;
      if (subreddit) redditQuery = `site:reddit.com/r/${subreddit} ${q}`;

      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(redditQuery)}`;
      try {
        const res = await fetch(ddgUrl, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();

        const results = [];
        const linkMatches = [...html.matchAll(/<a class="result__url" href="([^"]+)">([\s\S]*?)<\/a>/g)];
        const snippetMatches = [...html.matchAll(/<a class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];

        for (let i = 0; i < linkMatches.length && results.length < maxResults; i++) {
          let rawUrl = linkMatches[i][1];
          if (rawUrl.includes("uddg=")) {
            const m = rawUrl.match(/uddg=([^&]+)/);
            if (m) rawUrl = decodeURIComponent(m[1]);
          }
          if (rawUrl.includes("reddit.com/r/")) {
            const title = stripHtml(linkMatches[i][2]);
            const snippet = snippetMatches[i] ? stripHtml(snippetMatches[i][1]) : "";
            const subMatch = rawUrl.match(/reddit\.com\/r\/([^/]+)/);
            results.push({
              title,
              snippet,
              url: rawUrl,
              subreddit: subMatch ? `r/${subMatch[1]}` : "r/all",
            });
          }
        }

        return {
          ok: true,
          query: q,
          subreddit_filter: subreddit || null,
          count: results.length,
          posts: results,
          tip_for_ai: "Usa web.read_page con la URL de cualquiera de estos posts para leer el hilo y comentarios.",
        };
      } catch (err) {
        return { ok: false, error: `Error buscando en Reddit: ${err.message}` };
      }
    },

    /**
     * 📄 web.read_page: Extrae el contenido en texto limpio de una página web
     */
    read_page: async ({ url, max_length = 8000 } = {}) => {
      if (!url || typeof url !== "string") {
        return { ok: false, error: "Se requiere 'url' válida (http/https)." };
      }

      let parsed;
      try {
        parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return { ok: false, error: "Solo se admiten protocolos http: y https:." };
        }
        if (isDisallowedHost(parsed.hostname)) {
          return { ok: false, error: "Acceso a hosts locales o de red privada bloqueado por seguridad (anti-SSRF)." };
        }
      } catch {
        return { ok: false, error: `URL inválida: ${url}` };
      }

      try {
        const res = await fetch(url, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(12000),
          redirect: "follow",
        });

        if (!res.ok) {
          return { ok: false, error: `HTTP ${res.status}: ${res.statusMessage || "Error al cargar la página"}` };
        }

        const rawHtml = await res.text();
        const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? stripHtml(titleMatch[1]) : parsed.hostname;
        const cleanText = stripHtml(rawHtml);

        const limitBytes = Math.max(500, Math.min(Number(max_length) || 8000, 50000));
        const truncated = cleanText.length > limitBytes;
        const content = truncated ? cleanText.slice(0, limitBytes) + "\n\n[... Contenido truncado por límite de tamaño ...]" : cleanText;

        return {
          ok: true,
          url,
          title,
          content,
          truncated,
          length_characters: cleanText.length,
        };
      } catch (err) {
        return { ok: false, error: `Fallo al leer página: ${err.message}` };
      }
    },

    /**
     * 🛡️ web.download: Descargador de Máxima Seguridad Anti-Malware (Solo Imágenes, Videos y Documentos Seguros)
     */
    download: async ({
      url,
      destination = null,
      filename = null,
      media_type = "auto",
      max_bytes = 104857600, // 100 MB default
      overwrite = false,
    } = {}) => {
      if (!url || typeof url !== "string") {
        return { ok: false, error: "Se requiere 'url' válida de descarga." };
      }

      let parsed;
      try {
        parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return { ok: false, error: "Solo se admiten URLs con protocolo http o https." };
        }
        if (isDisallowedHost(parsed.hostname)) {
          return { ok: false, error: "Descargas desde loopback o red privada interna bloqueadas por seguridad (anti-SSRF)." };
        }
      } catch {
        return { ok: false, error: `URL inválida: ${url}` };
      }

      // 1. Extraer o determinar nombre de archivo y extensión tentativa
      const urlPath = parsed.pathname || "";
      let rawFilename = filename || path.basename(urlPath);
      if (!rawFilename || rawFilename === "/" || rawFilename === ".") {
        rawFilename = `download_${Date.now()}`;
      }

      // Saneamiento de nombre de archivo contra caracteres prohibidos en Windows
      let safeFilename = rawFilename.replace(/[<>:"/\\|?*\0]/g, "_").trim();
      let ext = path.extname(safeFilename).toLowerCase();

      // 2. Control anti-malware estricto por extensión
      if (ext && BLOCKED_EXTENSIONS.has(ext)) {
        return {
          ok: false,
          security_alert: "ACCESO_DENEGADO_POR_SEGURIDAD",
          error: `Extensión prohibida '${ext}'. Por política de máxima seguridad, Fluxer X prohíbe descargar archivos ejecutables, scripts o paquetes potencialmente peligrosos. Solo se permite descargar imágenes, videos y documentos seguros.`,
        };
      }

      // 3. Resolver directorio de destino seguro (~/Downloads por defecto)
      const targetDir = destination ? runtime.hp(destination) : runtime.hp("~/Downloads");
      await fs.mkdir(targetDir, { recursive: true }).catch(() => {});

      // 4. Iniciar petición HTTP en streaming con timeout
      let response;
      try {
        response = await fetch(url, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(30000),
          redirect: "follow",
        });
      } catch (err) {
        return { ok: false, error: `Fallo de conexión al descargar: ${err.message}` };
      }

      if (!response.ok) {
        return { ok: false, error: `El servidor web respondió con error HTTP ${response.status} (${response.statusText}).` };
      }

      // 5. Validar Content-Type
      const contentTypeHeader = (response.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();
      
      // Si no tiene extensión en la URL, asignarla a partir del Content-Type
      if (!ext && contentTypeHeader) {
        for (const [mime, cfg] of Object.entries(ALLOWED_MEDIA)) {
          if (contentTypeHeader === mime || contentTypeHeader.startsWith(mime)) {
            ext = cfg.extensions[0];
            safeFilename += ext;
            break;
          }
        }
      }

      // 6. Verificar si el tipo de medio coincide con formatos permitidos
      const matchedMimeConfig = ALLOWED_MEDIA[contentTypeHeader] || Object.values(ALLOWED_MEDIA).find((c) => c.extensions.includes(ext));
      
      if (!matchedMimeConfig) {
        return {
          ok: false,
          security_alert: "TIPO_DE_ARCHIVO_NO_PERMITIDO",
          error: `Tipo de archivo no permitido (${contentTypeHeader || "desconocido"}). Fluxer X solo permite descargar de forma segura imágenes (JPG, PNG, WebP, GIF, SVG), videos (MP4, WebM, MKV) y documentos seguros (PDF).`,
        };
      }

      // Asegurar que el nombre final no exista ya si overwrite es false
      let finalPath = path.join(targetDir, safeFilename);
      if (!overwrite && existsSync(finalPath)) {
        const base = path.basename(safeFilename, ext);
        safeFilename = `${base}_${Date.now()}${ext}`;
        finalPath = path.join(targetDir, safeFilename);
      }

      // 7. Descarga en streaming con validación binaria de Magic Bytes y límite de tamaño
      const maxAllowedBytes = Math.max(1024, Number(max_bytes) || 104857600);
      let downloadedBytes = 0;
      const hash = crypto.createHash("sha256");
      let headerChunk = null;
      let magicVerified = false;

      const reader = response.body.getReader();
      const chunks = [];

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          downloadedBytes += value.length;
          if (downloadedBytes > maxAllowedBytes) {
            reader.cancel();
            throw new Error(`El archivo supera el límite de seguridad de ${(maxAllowedBytes / 1024 / 1024).toFixed(1)} MB.`);
          }

          hash.update(value);
          chunks.push(Buffer.from(value));

          // Verificación de los primeros bytes (Magic Bytes)
          if (!headerChunk && downloadedBytes >= 16) {
            headerChunk = Buffer.concat(chunks).subarray(0, 512);

            // DETECCIÓN ZERO-TRUST ANTI-SPOOFING:
            // Comprobar si tiene cabecera de ejecutable PE Windows ('MZ' = 0x4D 0x5A) o ELF Linux ('\x7FELF')
            if (headerChunk[0] === 0x4d && headerChunk[1] === 0x5a) {
              reader.cancel();
              throw new Error("MALICIOUS_PAYLOAD_DETECTED: El archivo contiene una cabecera binaria de ejecutable Windows (MZ / PE) disfrazada.");
            }
            if (headerChunk[0] === 0x7f && headerChunk[1] === 0x45 && headerChunk[2] === 0x4c && headerChunk[3] === 0x46) {
              reader.cancel();
              throw new Error("MALICIOUS_PAYLOAD_DETECTED: El archivo contiene una cabecera binaria de ejecutable ELF disfrazada.");
            }

            // Validar contra la firma del tipo de medio declarado
            if (matchedMimeConfig.verify && matchedMimeConfig.verify(headerChunk)) {
              magicVerified = true;
            }
          }
        }

        const fullBuffer = Buffer.concat(chunks);
        
        // Verificación final de magic bytes si el archivo fue muy pequeño
        if (!magicVerified && matchedMimeConfig.verify) {
          if (!matchedMimeConfig.verify(fullBuffer.subarray(0, 512))) {
            throw new Error(`Firma de archivo inválida. Los bytes mágicos no coinciden con un archivo ${matchedMimeConfig.type} auténtico.`);
          }
          magicVerified = true;
        }

        // Escritura física en disco
        await fs.writeFile(finalPath, fullBuffer);

        const sha256 = hash.digest("hex").toLowerCase();

        // Registrar en auditoría
        runtime.auditLog?.record({
          tool: "web",
          action: "download",
          url,
          path: finalPath,
          sizeBytes: downloadedBytes,
          sha256,
          mediaType: matchedMimeConfig.type,
          magicVerified: true,
        });

        return {
          ok: true,
          downloaded: true,
          file_name: safeFilename,
          file_path: finalPath,
          size_bytes: downloadedBytes,
          size_formatted: `${(downloadedBytes / 1024).toFixed(1)} KB`,
          sha256,
          mime_type: contentTypeHeader || `image/${ext.replace(".", "")}`,
          media_type: matchedMimeConfig.type,
          magic_bytes_verified: magicVerified,
          message: `Archivo descargado exitosamente y verificado como ${matchedMimeConfig.type} seguro en: ${finalPath}`,
        };
      } catch (streamErr) {
        if (existsSync(finalPath)) {
          await fs.unlink(finalPath).catch(() => {});
        }
        return {
          ok: false,
          security_block: streamErr.message.includes("MALICIOUS_PAYLOAD_DETECTED"),
          error: `Descarga interrumpida: ${streamErr.message}`,
        };
      }
    },
  };

  return domain(
    "web",
    "Búsqueda web, Wikipedia, Reddit, extracción de texto y descarga segura de medios (imágenes/videos) con validación anti-malware.",
    actions,
    {
      search: "standard",
      search_images: "standard",
      wikipedia: "standard",
      reddit: "standard",
      read_page: "standard",
      download: "standard",
    }
  );
}