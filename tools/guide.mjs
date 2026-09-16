/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚡ FLUXER XZ (V4.0 Architecture) — tools/guide.mjs
 * Rebuilt Dynamic Discovery Guide & Documentation Engine.
 * Dynamically bound to CapabilityRegistry with 15 Capabilities, Categories,
 * Workflows, Semantic Search, and Compact Cheatsheets.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { CURRENT_VERSION, BRAND_NAME, GENERATION } from "../core/version.mjs";
import { CapabilityRegistry, CAPABILITY_DEFINITIONS, CAPABILITY_CATEGORIES } from "../core/capability-registry.mjs";

export function createGuideDomain({ runtime, domain }) {
  const registry = runtime?.capabilityRegistry || new CapabilityRegistry({ runtime });

  const actions = {
    // ── 1. High-Density Overview (Default) ───────────────────────────────────
    overview: async (params = {}) => {
      const mode = String(params.mode || "compact").toLowerCase();
      const capabilities = registry.getAll();

      if (mode === "compact") {
        const compactList = capabilities.map((c) => ({
          capability: c.name,
          category: c.category,
          summary: c.summary,
          topOperations: c.operations.slice(0, 4).map((o) => o.name),
        }));

        return {
          ok: true,
          brand: BRAND_NAME,
          version: CURRENT_VERSION,
          generation: GENERATION,
          totalCapabilities: capabilities.length,
          capabilities: compactList,
          summary: `FLUXER XZ v${CURRENT_VERSION} (Gen ${GENERATION}) offers ${capabilities.length} unified capabilities. Call guide { operation: 'capability_info', capability: '...' } for details.`,
        };
      }

      return {
        ok: true,
        brand: BRAND_NAME,
        version: CURRENT_VERSION,
        generation: GENERATION,
        capabilities: capabilities.map((c) => ({
          name: c.name,
          category: c.category,
          aliases: c.aliases,
          summary: c.summary,
          operations: c.operations,
        })),
      };
    },

    // ── 2. Interactive Semantic Search ───────────────────────────────────────
    search: async (params = {}) => {
      const query = params.query || params.q || "";
      const limit = Number(params.limit) || 10;
      const results = registry.search(query, { limit });

      return {
        ok: true,
        query,
        count: results.length,
        matches: results,
        summary: results.length > 0
          ? `Found ${results.length} matching operations for '${query}'.`
          : `No direct matches for '${query}'. Try searching by intent (e.g. 'print', 'flstudio', 'screenshot').`,
      };
    },

    // ── 3. Category Browser ──────────────────────────────────────────────────
    category: async (params = {}) => {
      const targetCategory = String(params.categoryName || params.category || "").toLowerCase();
      const capabilities = registry.getAll();

      if (!targetCategory) {
        // Return summary of all categories
        const grouped = {};
        for (const [key, val] of Object.entries(CAPABILITY_CATEGORIES)) {
          grouped[val] = capabilities
            .filter((c) => c.category === val)
            .map((c) => ({ name: c.name, summary: c.summary }));
        }

        return {
          ok: true,
          categories: Object.values(CAPABILITY_CATEGORIES),
          grouped,
          summary: "Pass categoryName to inspect capabilities in a specific domain category.",
        };
      }

      const filtered = capabilities.filter((c) => c.category.toLowerCase() === targetCategory);
      return {
        ok: true,
        category: targetCategory,
        count: filtered.length,
        capabilities: filtered,
      };
    },

    // ── 4. Capability Deep-Dive Cheatsheet ────────────────────────────────────
    capability_info: async (params = {}) => {
      const capName = params.capability || params.name || params.tool;
      if (!capName) {
        return {
          ok: false,
          error: "Specify 'capability' (e.g. 'flstudio', 'workflow', 'print', 'web', 'files').",
        };
      }

      const cap = registry.get(capName);
      if (!cap) {
        return {
          ok: false,
          error: `Capability '${capName}' not found. Valid: ${registry.getNames().join(", ")}`,
        };
      }

      return {
        ok: true,
        capability: cap.name,
        category: cap.category,
        aliases: cap.aliases,
        summary: cap.summary,
        description: cap.description,
        operations: cap.operations.map((o) => ({
          operation: o.name,
          summary: o.summary,
          params: o.params,
          example: `{ "operation": "${o.name}", "target": "...", "options": { ... } }`,
        })),
      };
    },

    // ── 5. Multi-Capability Guided Workflows ──────────────────────────────────
    workflows: async (params = {}) => {
      const topic = String(params.topic || "all").toLowerCase();

      const recipes = [
        {
          id: "web_search_to_print",
          title: "Visual Web Search to Multi-Page PDF Print",
          description: "Search high-res images, convert to PDF document, preflight, and send to printer spooler.",
          steps: [
            { step: 1, capability: "web", operation: "images", example: '{ query: "sunset landscape", limit: 12, compact: true }' },
            { step: 2, capability: "files", operation: "image_to_pdf", example: '{ images: ["img1.jpg", "img2.jpg"], outPath: "album.pdf", paper_size: "letter" }' },
            { step: 3, capability: "print", operation: "preflight", example: '{ filePath: "album.pdf" }' },
            { step: 4, capability: "print", operation: "print_pdf", example: '{ filePath: "album.pdf", pages: "1-2", copies: 1 }' },
          ],
        },
        {
          id: "flstudio_one_shot_beat",
          title: "Zero-Token FL Studio Music Composition",
          description: "Detect FL Studio 2026, launch DAW if offline, compile a 140 BPM Trap beat with chords and 808s, and start live playback.",
          steps: [
            { step: 1, capability: "flstudio", operation: "detect", example: "{}" },
            { step: 2, capability: "flstudio", operation: "open", example: "{}" },
            { step: 3, capability: "flstudio", operation: "music_create", example: '{ style: "trap", bpm: 140, root: "C#", chords: ["C#m", "A", "F#m", "G#"], autoPlay: true }' },
            { step: 4, capability: "flstudio", operation: "view", example: '{ window: "channel_rack" }' },
          ],
        },
        {
          id: "dag_workflow_execution",
          title: "Parallel DAG Execution with Concurrency and Rollback",
          description: "Execute interdependent tasks in parallel using the workflow DAG engine.",
          steps: [
            {
              step: 1,
              capability: "workflow",
              operation: "run",
              example: '{ tasks: [{ id: "t1", capability: "system", operation: "snapshot" }, { id: "t2", capability: "network", operation: "test_connection", dependsOn: ["t1"] }], concurrency: 4 }',
            },
          ],
        },
        {
          id: "desktop_security_elevation",
          title: "Interactive Security Elevation with Toast Approval",
          description: "Request a 10-minute administrative elevation window with Windows 11 notification toast.",
          steps: [
            { step: 1, capability: "security", operation: "grant_elevation", example: '{ level: "advanced", durationMinutes: 10 }' },
            { step: 2, capability: "terminal", operation: "exec", example: '{ command: "Get-Service" }' },
          ],
        },
      ];

      if (topic !== "all") {
        const matched = recipes.filter((r) => r.id.includes(topic) || r.title.toLowerCase().includes(topic));
        return { ok: true, topic, workflows: matched };
      }

      return {
        ok: true,
        totalWorkflows: recipes.length,
        workflows: recipes,
        tip: "You can execute complete multi-step workflows directly with the 'workflow' capability.",
      };
    },

    // ── 6. Backwards-Compatible Legacy Guide Sections ────────────────────────
    index: async () => actions.overview({ mode: "compact" }),
    tools: async () => actions.overview({ mode: "full" }),
    tool_usage: async (p) => actions.capability_info(p),

    image_to_pdf_guide: async () => ({
      ok: true,
      title: "Guía Maestra: Conversión de Imágenes a PDF (files.image_to_pdf)",
      capability: "files",
      operation: "image_to_pdf",
      summary: "Convierte imágenes individuales o álbumes multi-imagen a documentos PDF vectoriales optimizados.",
      recipes: [
        { title: "Fit a imagen", code: "files { operation: 'image_to_pdf', path: 'grafico.png', paper_size: 'fit' }" },
        { title: "Álbum multi-página", code: "files { operation: 'image_to_pdf', images: ['pag1.jpg', 'pag2.jpg'], outPath: 'doc.pdf', paper_size: 'a4' }" },
      ],
    }),

    print_guide: async () => ({
      ok: true,
      title: "Guía Maestra: Impresión en Windows (print / printcenter)",
      capability: "print",
      summary: "print admite PDF, Word, imágenes y texto plano con preflight, dúplex, escala de grises y soporte multi-página continuo.",
      steps: [
        { step: 1, command: "print { operation: 'list_printers' }" },
        { step: 2, command: "print { operation: 'preflight', filePath: 'doc.pdf' }" },
        { step: 3, command: "print { operation: 'print_pdf', filePath: 'doc.pdf', pages: '1-5', copies: 1 }" },
      ],
    }),

    web_search_guide: async () => ({
      ok: true,
      title: "Guía Maestra: Búsqueda Web y Visual (>9 Imágenes Frescas)",
      capability: "web",
      summary: "Búsqueda multi-proveedor paralela con deduplicación y visual search con más de 9 opciones frescas y modo compacto por defecto.",
      examples: [
        { title: "Búsqueda web", code: "web { operation: 'search', query: 'FL Studio Python API' }" },
        { title: "Búsqueda de imágenes fresca", code: "web { operation: 'images', query: 'jardín nocturno con flores azules', limit: 12, compact: true }" },
      ],
    }),

    notifications_guide: async () => ({
      ok: true,
      title: "Guía Maestra: Notificaciones Windows 11",
      capability: "developer / security",
      summary: "Control de notificaciones de conexión, desconexión y toasts de seguridad.",
      controls: [
        { control: "Desactivar notificaciones de conexión", code: "developer { operation: 'notifications', subaction: 'connection', enabled: false }" },
        { control: "Activar notificaciones de seguridad", code: "developer { operation: 'notifications', subaction: 'security', enabled: true }" },
      ],
    }),

    quick_start: async () => ({
      ok: true,
      brand: BRAND_NAME,
      version: CURRENT_VERSION,
      generation: GENERATION,
      steps: [
        { step: 1, title: "Diagnóstico inicial", command: "network { operation: 'health_check' }" },
        { step: 2, title: "Comprobar actualizaciones", command: "upd { operation: 'check' }" },
        { step: 3, title: "Explorar capacidades", command: "guide { operation: 'overview' }" },
      ],
    }),
  };

  const permissions = {
    overview: "standard",
    search: "standard",
    category: "standard",
    capability_info: "standard",
    workflows: "standard",
    index: "standard",
    tools: "standard",
    tool_usage: "standard",
    image_to_pdf_guide: "standard",
    print_guide: "standard",
    web_search_guide: "standard",
    notifications_guide: "standard",
    quick_start: "standard",
  };

  if (typeof domain === "function") {
    return domain(
      "guide",
      `FLUXER XZ Documentation & Capability Discovery Engine (Gen ${GENERATION}). Operaciones: overview | search | category | capability_info | workflows`,
      actions,
      permissions
    );
  }

  return {
    name: "guide",
    description: `FLUXER XZ Documentation & Capability Discovery Engine (Gen ${GENERATION}). Operaciones: overview | search | category | capability_info | workflows`,
    actions,
    permissions,
  };
}
