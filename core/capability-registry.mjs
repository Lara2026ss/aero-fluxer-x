/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚡ FLUXER XZ (V4.0 Architecture) — core/capability-registry.mjs
 * Central Capability Registry & Single Source of Truth for the 15 Semantic Capabilities.
 * ══════════════════════════════════════════════════════════════════════════════
 */

export const CAPABILITY_NAMES = [
  "workflow",
  "developer",
  "system",
  "files",
  "terminal",
  "network",
  "security",
  "database",
  "packages",
  "web",
  "media",
  "print",
  "flstudio",
  "upd",
  "guide",
];

export const CAPABILITY_CATEGORIES = {
  AUTOMATION: "automation",
  DEVELOPMENT: "development",
  OS: "os",
  STORAGE: "storage",
  CONNECTIVITY: "connectivity",
  SECURITY: "security",
  DATA: "data",
  PACKAGES: "packages",
  WEB: "web",
  MEDIA: "media",
  HARDWARE: "hardware",
  MUSIC: "music",
  MAINTENANCE: "maintenance",
  DISCOVERY: "discovery",
};

/**
 * 15 Canonical Capabilities Specification
 */
export const CAPABILITY_DEFINITIONS = [
  {
    name: "workflow",
    aliases: ["wf", "dag", "orchestration", "macro"],
    category: CAPABILITY_CATEGORIES.AUTOMATION,
    summary: "High-level DAG workflow orchestration, parallel execution, and step rollbacks.",
    description: "Orchestrates multi-step DAG workflows across all Fluxer XZ capabilities with cycle detection, concurrency limits, dependency resolution, variable templating, and rollback.",
    operations: [
      { name: "run", summary: "Execute a DAG workflow of tasks with dependency resolution and concurrency.", params: ["tasks", "concurrency", "rollbackOnError", "timeoutMs"] },
      { name: "validate", summary: "Validate DAG workflow syntax, cycle detection, and step requirements.", params: ["tasks"] },
      { name: "template", summary: "Run or inspect predefined workflow templates (e.g. clean_build, health_audit).", params: ["templateId", "params"] },
      { name: "status", summary: "Check execution status and receipts of active or past workflows.", params: ["workflowId"] },
    ],
    defaultOperation: "run",
    permissionLevel: "advanced",
  },
  {
    name: "developer",
    aliases: ["dev", "code", "git", "skills"],
    category: CAPABILITY_CATEGORIES.DEVELOPMENT,
    summary: "Code intelligence, project detection, git operations, skills, and dev lifecycle.",
    description: "Software engineering workspace manager: project detection, git status/commit/branch/log, custom skills engine, test/build runner, and connection lifecycle notifications.",
    operations: [
      { name: "detect_project", summary: "Detect project framework, dependencies, package manager, and git root.", params: ["path"] },
      { name: "git", summary: "Run safe git commands (status, commit, branch, diff, log, checkout).", params: ["subaction", "message", "branch", "path"] },
      { name: "run_project_tests", summary: "Discover and run project test suite with parsed output.", params: ["path", "filter"] },
      { name: "run_project_build", summary: "Run project build command with streaming status.", params: ["path"] },
      { name: "skills", summary: "Manage and execute custom agent skills (list, create, edit, delete, run).", params: ["subaction", "name", "content"] },
      { name: "notifications", summary: "Configure agent connection/security notification toasts (connection, security).", params: ["subaction", "enabled"] },
      { name: "inspect_code", summary: "Analyze code file structure, AST symbols, exports, and imports.", params: ["path"] },
    ],
    defaultOperation: "detect_project",
    permissionLevel: "standard",
  },
  {
    name: "system",
    aliases: ["sys", "os", "windows", "hardware"],
    category: CAPABILITY_CATEGORIES.OS,
    summary: "Windows 11 system telemetry, processes, RAM optimization, BCD, and services.",
    description: "Deep Windows operating system control: CPU/RAM telemetry, active processes, RAM optimizer, BCD boot manager, Windows service management, registry access, and display info.",
    operations: [
      { name: "snapshot", summary: "Get complete system snapshot (OS, CPU, memory, uptime, battery, disks).", params: ["compact"] },
      { name: "processes", summary: "List, filter, or inspect running Windows processes.", params: ["filter", "sortBy", "limit"] },
      { name: "kill_process", summary: "Terminate a process gracefully or force kill by PID/name.", params: ["pid", "name", "force"] },
      { name: "optimize_ram", summary: "Free uncommitted memory working sets across processes.", params: [] },
      { name: "services", summary: "List, start, stop, or query status of Windows services.", params: ["subaction", "name"] },
      { name: "disks", summary: "Inspect disk volumes, drive letters, free space, and mount status.", params: [] },
      { name: "bcd", summary: "Inspect or manage Windows Boot Configuration Data safely.", params: ["subaction"] },
      { name: "environment", summary: "Inspect or set environment variables safely.", params: ["subaction", "name", "value"] },
      { name: "toast", summary: "Send native Windows 11 notification toast with custom title/body.", params: ["title", "message"] },
    ],
    defaultOperation: "snapshot",
    permissionLevel: "standard",
  },
  {
    name: "files",
    aliases: ["file", "fs", "storage_files"],
    category: CAPABILITY_CATEGORIES.STORAGE,
    summary: "High-density filesystem operations, search, inspect, write, diff, hash, and recycle bin.",
    description: "Comprehensive Windows filesystem operations: directory tree, fast file read/write, patch/replace, multi-file regex grep, SHA256 checksums, metadata inspection, and Windows Recycle Bin.",
    operations: [
      { name: "read", summary: "Read text or binary file contents with optional range/line limits.", params: ["path", "maxBytes", "startLine", "endLine"] },
      { name: "write", summary: "Create or overwrite file with atomic backup support.", params: ["path", "content", "createDirs"] },
      { name: "edit", summary: "Targeted block replacement or patch in an existing file.", params: ["path", "find", "replace", "allowMultiple"] },
      { name: "list", summary: "List directory contents with recursive depth and type filtering.", params: ["path", "depth", "types"] },
      { name: "search", summary: "Fast filename glob search across directories.", params: ["path", "pattern", "limit"] },
      { name: "grep", summary: "Ripgrep-speed regex pattern search across text files.", params: ["path", "query", "isRegex", "limit"] },
      { name: "delete", summary: "Move file to Windows Recycle Bin (or permanently delete).", params: ["path", "recycleBin"] },
      { name: "hash", summary: "Calculate SHA256/MD5 hash of a file for integrity check.", params: ["path", "algorithm"] },
      { name: "metadata", summary: "Inspect detailed file metadata (stats, permissions, timestamps, MIME).", params: ["path"] },
      { name: "copy_move", summary: "Copy or move files/directories atomically.", params: ["subaction", "source", "target"] },
      { name: "image_to_pdf", summary: "Convert one or multiple images into a multi-page PDF document.", params: ["images", "path", "targetPath", "paper_size"] },
      { name: "merge_pdfs", summary: "Merge and concatenate multiple PDF files into a single unified PDF.", params: ["files", "pdfs", "targetPath"] },
    ],
    defaultOperation: "list",
    permissionLevel: "standard",
  },
  {
    name: "terminal",
    aliases: ["term", "cmd", "powershell", "shell", "console"],
    category: CAPABILITY_CATEGORIES.OS,
    summary: "Local Windows terminal execution, background jobs, process tree, and kill.",
    description: "Executes PowerShell and CMD commands locally with output streaming, timeout controls, background job tracking, process tree inspection, and elevation detection.",
    operations: [
      { name: "exec", summary: "Execute a command in PowerShell/CMD with timeout and output capture.", params: ["command", "cwd", "timeoutMs", "shell"] },
      { name: "background", summary: "Start a long-running process in background and return job ID.", params: ["command", "cwd"] },
      { name: "jobs", summary: "List, inspect, check logs, or poll running background jobs.", params: ["subaction", "jobId"] },
      { name: "kill_job", summary: "Terminate a background job and its child process tree.", params: ["jobId"] },
      { name: "elevated_exec", summary: "Execute command with elevated Administrator privileges (requires prompt/grant).", params: ["command"] },
    ],
    defaultOperation: "exec",
    permissionLevel: "advanced",
  },
  {
    name: "network",
    aliases: ["net", "diagnostics", "diag", "connectivity"],
    category: CAPABILITY_CATEGORIES.CONNECTIVITY,
    summary: "Network diagnostics, ping, DNS lookup, port check, and active sockets.",
    description: "Low-overhead network tools: internet connectivity check, DNS resolution, TCP port probing, socket listening states, and adapter IP configuration.",
    operations: [
      { name: "test_connection", summary: "Check internet connectivity and DNS reachability.", params: ["host"] },
      { name: "ping", summary: "Measure ICMP latency and packet loss to a host.", params: ["host", "count"] },
      { name: "dns_lookup", summary: "Resolve IPv4/IPv6/MX records for a domain.", params: ["host", "recordType"] },
      { name: "port_check", summary: "Probe TCP port availability on local or remote host.", params: ["host", "port", "timeoutMs"] },
      { name: "active_connections", summary: "List active TCP/UDP listening ports and established sockets.", params: ["limit"] },
      { name: "adapter_info", summary: "Inspect local network adapters, IP addresses, and gateways.", params: [] },
      { name: "health_check", summary: "Full network and environment diagnostic report.", params: [] },
    ],
    defaultOperation: "test_connection",
    permissionLevel: "standard",
  },
  {
    name: "security",
    aliases: ["sec", "perms", "permissions", "elevation"],
    category: CAPABILITY_CATEGORIES.SECURITY,
    summary: "Permission engine, elevation, session windows, approval toasts, and audit logs.",
    description: "Fluxer XZ security barrier: role-based capability levels (standard, advanced, admin), interactive confirmation toasts, time-bounded elevation windows, and audit logging.",
    operations: [
      { name: "status", summary: "Inspect current permission level, active windows, and security policies.", params: [] },
      { name: "grant_elevation", summary: "Request or activate a time-bounded elevation window with confirmation.", params: ["level", "durationMinutes", "code"] },
      { name: "approve_request", summary: "Approve a pending confirmation request by ID or code.", params: ["requestId", "confirmationCode"] },
      { name: "revoke_elevation", summary: "Immediately revoke all active elevation windows back to standard.", params: [] },
      { name: "audit_log", summary: "Inspect audit trail of sensitive capability executions.", params: ["limit", "level"] },
      { name: "list_levels", summary: "List available permission levels and their capability rights.", params: [] },
    ],
    defaultOperation: "status",
    permissionLevel: "standard",
  },
  {
    name: "database",
    aliases: ["db", "sqlite", "sql"],
    category: CAPABILITY_CATEGORIES.DATA,
    summary: "SQLite database management, schema inspection, queries, and migrations.",
    description: "Built-in SQLite database engine: query execution (SELECT/INSERT/UPDATE), table schema discovery, index inspection, foreign key checks, and database health.",
    operations: [
      { name: "query", summary: "Execute SQL query on SQLite database with parameter binding.", params: ["database", "query", "params", "readOnly"] },
      { name: "tables", summary: "List tables, views, and row counts in a database.", params: ["database"] },
      { name: "schema", summary: "Inspect table columns, data types, indexes, and primary keys.", params: ["database", "table"] },
      { name: "export", summary: "Export table data to JSON, CSV, or SQL dump.", params: ["database", "table", "format"] },
    ],
    defaultOperation: "tables",
    permissionLevel: "advanced",
  },
  {
    name: "packages",
    aliases: ["pkg", "package_manager", "winget", "npm"],
    category: CAPABILITY_CATEGORIES.PACKAGES,
    summary: "Package management across winget, choco, scoop, npm, pip, and more.",
    description: "Unified package interface detecting and orchestrating Windows package managers (winget, choco, scoop) and language managers (npm, pip, cargo, go).",
    operations: [
      { name: "list_installed", summary: "List installed packages for a specific manager or system-wide.", params: ["manager", "filter"] },
      { name: "search", summary: "Search for packages in winget, npm, or chocolatey repositories.", params: ["query", "manager"] },
      { name: "info", summary: "Inspect detailed package metadata, version, and dependencies.", params: ["name", "manager"] },
      { name: "install", summary: "Install package via detected or specified package manager.", params: ["name", "manager"] },
      { name: "update", summary: "Upgrade package (or all packages) to latest version.", params: ["name", "manager"] },
      { name: "uninstall", summary: "Remove package cleanly.", params: ["name", "manager"] },
    ],
    defaultOperation: "list_installed",
    permissionLevel: "advanced",
  },
  {
    name: "web",
    aliases: ["search", "internet", "browser_data"],
    category: CAPABILITY_CATEGORIES.WEB,
    summary: "Multi-provider web & visual search (>9 fresh images, multi-engine parallel, extract).",
    description: "Intelligent web interface: multi-provider parallel search (DuckDuckGo, Bing, Brave, Wikipedia), visual image search with fresh ranking (>9 verified images, compact by default), and page markdown extraction.",
    operations: [
      { name: "search", summary: "Perform parallel web search returning deduplicated text results.", params: ["query", "limit", "provider"] },
      { name: "images", summary: "Search fresh images with deduplication, dimensions, and previews (>9 items).", params: ["query", "limit", "compact", "freshness"] },
      { name: "multi_search", summary: "Run combined web, images, and knowledge lookup in a single call.", params: ["query", "limit"] },
      { name: "extract", summary: "Fetch URL and extract clean text/markdown content.", params: ["url", "maxBytes"] },
      { name: "download", summary: "Safely download web asset (image, file) to local storage.", params: ["url", "targetPath"] },
    ],
    defaultOperation: "search",
    permissionLevel: "standard",
  },
  {
    name: "media",
    aliases: ["screenshot", "screen", "capture", "display"],
    category: CAPABILITY_CATEGORIES.MEDIA,
    summary: "Screen capture, window capture, app capture, and image inspection.",
    description: "Windows visual media engine: full desktop capture, active window capture, specific application capture, rectangle region capture, and image metadata/resizing.",
    operations: [
      { name: "desktop", summary: "Capture full desktop screenshot saved to user Pictures/FluxerScreenshots.", params: ["displayIndex", "format"] },
      { name: "window", summary: "Capture currently active or named foreground window.", params: ["windowTitle"] },
      { name: "app", summary: "Capture window for a specific application process name.", params: ["processName"] },
      { name: "region", summary: "Capture specific rectangle coordinates (x, y, width, height).", params: ["x", "y", "width", "height"] },
      { name: "inspect", summary: "Read image dimensions, format, file size, and preview thumbnail.", params: ["path"] },
    ],
    defaultOperation: "desktop",
    permissionLevel: "advanced",
  },
  {
    name: "print",
    aliases: ["printcenter", "printer", "spooler"],
    category: CAPABILITY_CATEGORIES.HARDWARE,
    summary: "Windows native printing, spooler monitoring, preflight, and continuous multi-page PDF.",
    description: "Windows print architecture: list printers, inspect queue status, preflight check documents, submit jobs, cancel/purge jobs, and stream continuous multi-page PDFs with exact page ranges.",
    operations: [
      { name: "list_printers", summary: "List installed Windows printers, default printer, and connection states.", params: [] },
      { name: "get_printer", summary: "Inspect detailed printer capabilities (DPI, duplex, paper sizes, queue count).", params: ["printerName"] },
      { name: "preflight", summary: "Analyze document readiness, page count, and dimensions before printing.", params: ["filePath"] },
      { name: "print_file", summary: "Submit document or image to printer with copy count and orientation.", params: ["filePath", "printerName", "copies", "duplex"] },
      { name: "print_pdf", summary: "Print PDF with continuous multi-page support and page range filtering (e.g. 1-5, 8).", params: ["filePath", "printerName", "pages", "copies"] },
      { name: "jobs", summary: "Inspect active print spooler queue jobs for a printer.", params: ["printerName"] },
      { name: "cancel_job", summary: "Cancel a print job in the spooler.", params: ["printerName", "jobId"] },
      { name: "purge_queue", summary: "Purge all pending jobs in a printer spooler queue.", params: ["printerName"] },
    ],
    defaultOperation: "list_printers",
    permissionLevel: "advanced",
  },
  {
    name: "flstudio",
    aliases: ["fl_studio", "fl", "music_creator", "daw"],
    category: CAPABILITY_CATEGORIES.MUSIC,
    summary: "Native FL Studio 2026 bridge, token-efficient music compiler, channels, patterns, and transport.",
    description: "Zero-token-waste native bridge for FL Studio 2026: high-level music compilation (scales, chords, drums, arrangement), transport control (play/stop/tempo), channel rack, piano roll, mixer, and bidirectional hardware bridge.",
    operations: [
      { name: "detect", summary: "Detect physical FL Studio 2026 installation, PID, bridge status, and backup.", params: [] },
      { name: "open", summary: "Launch FL Studio 2026 (or open specific .flp project).", params: ["project_path"] },
      { name: "music_create", summary: "Compile and inject high-level musical structure (style, tempo, key, chords, drums) in 1 shot.", params: ["style", "bpm", "root", "scale", "chords", "drums", "autoPlay"] },
      { name: "transport", summary: "Control playback transport (play, stop, toggle, record, set tempo).", params: ["subaction", "bpm"] },
      { name: "channels", summary: "Inspect channels, select channel, mute, solo, or set volume/pan.", params: ["subaction", "channelIndex", "value"] },
      { name: "patterns", summary: "Navigate patterns, select pattern number, clone, or split.", params: ["subaction", "patternNumber"] },
      { name: "mixer", summary: "Control mixer tracks, volume faders, mute, sidechain, or load presets.", params: ["subaction", "trackIndex", "volume"] },
      { name: "view", summary: "Switch focused FL Studio window (playlist, channel_rack, piano_roll, mixer).", params: ["window"] },
      { name: "plugins", summary: "List installed VST/Fruity plugins, scan database, or recommend free instruments.", params: ["subaction"] },
      { name: "bridge_status", summary: "Check live bidirectional socket/mailbox communication with FL Studio embedded Python.", params: [] },
    ],
    defaultOperation: "detect",
    permissionLevel: "standard",
  },
  {
    name: "upd",
    aliases: ["updater", "update_manager", "fluxer_updater"],
    category: CAPABILITY_CATEGORIES.MAINTENANCE,
    summary: "Manual GitHub updater with atomic staging, health verification, and rollback (strictly manual, never automatic).",
    description: "Official manual updater for FLUXER XZ: checks GitHub releases, performs preflight health, atomic file staging, and verified rollback on failure. Operates strictly under manual user control; automatic updates are completely disabled.",
    operations: [
      { name: "check", summary: "Check GitHub repository and official releases for available updates.", params: ["force", "channel"] },
      { name: "info", summary: "Inspect changelog, migration notes, and version diff for a release.", params: ["version"] },
      { name: "apply", summary: "Download and stage update package, requiring explicit chat confirmation.", params: ["confirm", "targetVersion", "backupPolicy"] },
      { name: "rollback", summary: "Roll back to previous backup snapshot in case of failure.", params: ["snapshotId"] },
      { name: "status", summary: "Inspect disk forensic installation status and updater integrity.", params: [] },
    ],
    defaultOperation: "check",
    permissionLevel: "admin",
  },
  {
    name: "guide",
    aliases: ["help", "docs", "cheat_sheet", "fluxer_guide"],
    category: CAPABILITY_CATEGORIES.DISCOVERY,
    summary: "Central discovery guide, capability categories, cheatsheets, and interactive search.",
    description: "Interactive documentation and capability discovery engine: semantic query lookup across all 15 capabilities, category browsing, cheat sheets, and recommended workflows.",
    operations: [
      { name: "overview", summary: "High-density overview of all 15 capabilities, categories, and quick examples.", params: ["mode"] },
      { name: "search", summary: "Search for actions, capabilities, or parameters by keyword or intent.", params: ["query", "limit"] },
      { name: "category", summary: "List capabilities and operations grouped by category (os, web, media, music, etc.).", params: ["categoryName"] },
      { name: "capability_info", summary: "Detailed cheatsheet and argument specs for a specific capability.", params: ["capability"] },
      { name: "workflows", summary: "View guided workflow recipes combining multiple capabilities.", params: ["topic"] },
    ],
    defaultOperation: "overview",
    permissionLevel: "standard",
  },
];

/**
 * Single source of truth Capability Registry Class
 */
export class CapabilityRegistry {
  constructor({ runtime = null } = {}) {
    this.runtime = runtime;
    this.capabilities = new Map();
    this.aliasMap = new Map();

    for (const def of CAPABILITY_DEFINITIONS) {
      this.register(def);
    }
  }

  register(def) {
    if (!def.name) throw new Error("Capability definition must have a name");
    this.capabilities.set(def.name.toLowerCase(), def);

    // Register primary name as alias to itself
    this.aliasMap.set(def.name.toLowerCase(), def.name);

    // Register all aliases
    if (Array.isArray(def.aliases)) {
      for (const alias of def.aliases) {
        this.aliasMap.set(alias.toLowerCase(), def.name);
      }
    }
  }

  resolveCapability(nameOrAlias) {
    if (!nameOrAlias || typeof nameOrAlias !== "string") return null;
    const clean = nameOrAlias.trim().toLowerCase();
    const canonical = this.aliasMap.get(clean);
    return canonical ? this.capabilities.get(canonical.toLowerCase()) : null;
  }

  get(nameOrAlias) {
    return this.resolveCapability(nameOrAlias);
  }

  getAll() {
    return Array.from(this.capabilities.values());
  }

  getNames() {
    return Array.from(this.capabilities.keys());
  }

  /**
   * Normalizes any input payload (canonical, legacy, flat, or nested) into:
   * { capability: string, operation: string, target: any, options: object, legacyMode: boolean }
   */
  normalizeCall(rawInput = {}) {
    let {
      capability,
      tool,
      name,
      operation,
      action,
      subaction,
      target,
      options,
      args,
      ...rest
    } = rawInput;

    // 1. Identify raw capability name
    let rawCap = capability || tool || name;
    if (typeof rawCap === "string") {
      rawCap = rawCap
        .replace(/^aeron[_\s-]?fluxer[_\s-]?x[:_\s-]*/i, "")
        .replace(/^(fluxer|mcp)[:_\s-]*/i, "")
        .trim();
    }

    const resolved = this.resolveCapability(rawCap);
    const canonicalName = resolved ? resolved.name : String(rawCap || "").toLowerCase();

    // 2. Identify operation
    let canonicalOp = operation || action || subaction;
    let legacyMode = Boolean(action && !operation);

    // Merge options / args / rest
    let combinedOptions = {};
    if (typeof options === "object" && options !== null && !Array.isArray(options)) {
      combinedOptions = { ...options };
    }
    if (typeof args === "object" && args !== null && !Array.isArray(args)) {
      combinedOptions = { ...combinedOptions, ...args };
    }
    combinedOptions = { ...combinedOptions, ...rest };

    // If operation was inside options/args
    if (!canonicalOp) {
      if (combinedOptions.operation) {
        canonicalOp = combinedOptions.operation;
        delete combinedOptions.operation;
      } else if (combinedOptions.action) {
        canonicalOp = combinedOptions.action;
        delete combinedOptions.action;
        legacyMode = true;
      } else if (combinedOptions.subaction) {
        canonicalOp = combinedOptions.subaction;
        delete combinedOptions.subaction;
      }
    }

    // Default operation if none specified
    if (!canonicalOp && resolved) {
      canonicalOp = resolved.defaultOperation || resolved.operations?.[0]?.name || "default";
    }

    return {
      capability: canonicalName,
      operation: String(canonicalOp || "").toLowerCase(),
      target: target || combinedOptions.target || combinedOptions.path || combinedOptions.query || combinedOptions.command || null,
      options: combinedOptions,
      legacyMode,
    };
  }

  /**
   * Generates the 15 MCP Tool Schemas conforming to MCP specs
   */
  toMcpTools({ compact = true } = {}) {
    return this.getAll().map((def) => {
      const opNames = def.operations.map((o) => o.name);
      const opSummaryList = def.operations.map((o) => `${o.name}(${o.params.join(", ")})`).join(" | ");

      const description = compact
        ? `${def.summary}\nOperations: ${opSummaryList}\nAccepts: { operation, target, options } or direct args.`
        : `${def.description}\n\nAvailable operations:\n${def.operations.map((o) => `  - ${o.name}: ${o.summary} [${o.params.join(", ")}]`).join("\n")}\n\nUsage: Pass { operation: '${opNames[0]}', target: '...', options: { ... } } or flattened parameters.`;

      return {
        name: def.name,
        description,
        inputSchema: {
          type: "object",
          properties: {
            operation: {
              type: "string",
              enum: opNames,
              description: `Operation to execute in '${def.name}'. Valid: ${opNames.join(", ")}`,
            },
            target: {
              type: "string",
              description: "Primary target for the operation (file path, query, URL, command, or identifier).",
            },
            options: {
              type: "object",
              description: "Configuration options and specific arguments for the operation.",
            },
            // Compatibility fields for legacy callers
            action: {
              type: "string",
              description: "Legacy alias for 'operation'.",
            },
            args: {
              type: "object",
              description: "Legacy alias for 'options'.",
            },
            path: {
              type: "string",
              description: "Direct path argument (mapped to target or options.path).",
            },
            query: {
              type: "string",
              description: "Direct search or SQL query argument.",
            },
            command: {
              type: "string",
              description: "Direct terminal command argument.",
            },
            content: {
              type: "string",
              description: "Direct text/content argument.",
            },
            compact: {
              type: "boolean",
              description: "Whether to return high-density compact response (default: true).",
            },
          },
          required: ["operation"],
          additionalProperties: true,
        },
      };
    });
  }

  /**
   * Constructs the unified V4.0 Generation envelope
   */
  envelope(capability, operation, result = {}) {
    const isOk = result.ok !== undefined ? Boolean(result.ok) : (result.error ? false : true);
    const durationMs = result.durationMs || 0;
    const summary = result.summary || (isOk ? `Operation '${capability}.${operation}' executed successfully.` : `Operation '${capability}.${operation}' failed: ${result.error || result.message || "Unknown error"}`);

    if (isOk) {
      return {
        ok: true,
        capability,
        operation,
        summary,
        data: result.data !== undefined ? result.data : result,
        next: result.next || undefined,
        durationMs,
        ...(result.receipt ? { receipt: result.receipt } : {}),
      };
    } else {
      return {
        ok: false,
        capability,
        operation,
        summary,
        code: result.code || "OPERATION_FAILED",
        error: result.error || result.message || "Unknown execution error",
        recoverable: result.recoverable !== undefined ? result.recoverable : true,
        suggestion: result.suggestion || `Check required parameters for ${capability}.${operation}.`,
        durationMs,
      };
    }
  }

  /**
   * Fast keyword & semantic search across capabilities
   */
  search(query, { limit = 10 } = {}) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return [];

    const results = [];
    for (const cap of this.getAll()) {
      let score = 0;
      if (cap.name.toLowerCase() === q) score += 100;
      else if (cap.name.toLowerCase().includes(q)) score += 50;

      if (cap.aliases.some((a) => a.toLowerCase() === q)) score += 80;
      else if (cap.aliases.some((a) => a.toLowerCase().includes(q))) score += 40;

      if (cap.summary.toLowerCase().includes(q)) score += 30;

      for (const op of cap.operations) {
        let opScore = 0;
        if (op.name.toLowerCase() === q) opScore += 70;
        else if (op.name.toLowerCase().includes(q)) opScore += 35;
        if (op.summary.toLowerCase().includes(q)) opScore += 20;

        if (opScore > 0 || score > 0) {
          results.push({
            capability: cap.name,
            operation: op.name,
            summary: op.summary,
            params: op.params,
            score: score + opScore,
            example: `{ "capability": "${cap.name}", "operation": "${op.name}" }`,
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}
