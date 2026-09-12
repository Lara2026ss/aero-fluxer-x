import { CURRENT_VERSION } from "../core/version.mjs";

export function createGuideDomain({ runtime, domain }) {
  const actions = {

    // Table of contents / index
    index: async () => ({
      ok: true,
      version: CURRENT_VERSION,
      title: `Fluxer Core MCP v${CURRENT_VERSION} -- Guide Index`,
      sections: [
        { action: "quick_start", summary: "Get started in 5 minutes -- new user setup" },
        { action: "tools", summary: "All tool domains overview (files, system, packages, terminal, flstudio, etc.)" },
        { action: "tool_usage", params: ["tool_name"], summary: "Detailed usage for a specific tool domain" },
        { action: "compact_mode", summary: "How compact mode works and when to enable/disable it" },
        { action: "best_practices", summary: "AI usage best practices and golden rules" },
        { action: "examples", params: ["domain"], summary: "Real usage examples per domain" },
        { action: "troubleshoot", params: ["issue?"], summary: "Common issues and how to fix them" },
        { action: "permissions", summary: "Security, permission levels, and workflow system" },
        { action: "changelog", summary: "Latest version changes and update history" },
        { action: "faq", summary: "Frequently asked questions" },
        { action: "search", params: ["query"], summary: "Search across all guide content" },
      ],
      tip: "Call guide { action: 'quick_start' } to get started, or guide { action: 'search', query: '...' } to find specific info.",
    }),

    quick_start: async () => ({
      ok: true,
      title: `Fluxer Core MCP v${CURRENT_VERSION} -- Quick Start`,
      steps: [
        { step: 1, title: "Verify installation", command: "diagnostics { action: 'health_check' }", note: "All checks should be PASS. If not, run diagnostics { action: 'report' } for details." },
        { step: 2, title: "Check for updates", command: "upd { action: 'check' }", note: "Always-fresh check from GitHub. If update available, confirm with upd { action: 'apply', confirm: true }." },
        { step: 3, title: "Run doctor", command: "upd { action: 'doctor' }", note: "20-point self-diagnostic. All invariants should PASS on a healthy install." },
        { step: 4, title: "Install on new client", command: "upd { action: 'install', mode: 'wizard' }", note: "Auto-detects Claude Desktop, Cursor, Windsurf, etc. and configures MCP automatically." },
        { step: 5, title: "Enable compact mode for bulk work", command: "diagnostics { action: 'set_compact', enabled: true }", note: "Reduces token usage during multi-step workflows. Disable before showing results to user." },
        { step: 6, title: "Read this guide", command: "guide { action: 'tools' }", note: "Get an overview of all tool domains." },
      ],
      github: "https://github.com/Lara2026ss/aero-fluxer-x",
      version: CURRENT_VERSION,
    }),

    tools: async () => ({
      ok: true,
      title: "Fluxer Core MCP -- All Tool Domains",
      domains: [
        { name: "files", description: "File system operations: read, write, edit, find, manage, image, json, sandbox", key_actions: ["read", "write", "edit", "find", "manage", "search_files", "directory_tree"] },
        { name: "system", description: "OS, hardware, memory, processes, power, registry, clipboard, scheduled tasks", key_actions: ["get_system_info", "get_processes", "manage_services", "get_performance_stats", "ping", "screenshot"] },
        { name: "packages", description: "Universal package manager: winget, choco, scoop, npm, pip, cargo, etc.", key_actions: ["install", "list", "remove", "update", "search", "audit", "info", "repo"] },
        { name: "terminal", description: "Command execution, sessions, background tasks, scripts", key_actions: ["exec", "run_script", "create_session", "run_background", "run_as_admin"] },
        { name: "database", description: "SQLite, PostgreSQL, MySQL -- query, export, backup, notes", key_actions: ["query", "execute_query", "list_tables", "export_table", "remember_note", "search_notes"] },
        { name: "security", description: "Permissions, encryption, hashing, audit log, elevation workflows", key_actions: ["start_workflow", "approve_request", "encrypt_text", "hash_text", "audit_log", "scan_file"] },
        { name: "network", description: "Network diagnostics, port scanning, DNS, interfaces", key_actions: ["diagnose_network", "scan_ports", "dns_query", "test_connection", "get_interfaces"] },
        { name: "shortcuts", description: "Save and run multi-step macros with variable substitution", key_actions: ["create", "execute", "list", "get", "export", "import"] },
        { name: "developer", description: "Git, skills management, feedback, project inspection, upd tool", key_actions: ["inspect_project", "git_status_structured", "list_skills", "upd", "upd_check", "upd_doctor", "submit_feedback"] },
        { name: "diagnostics", description: "System health, compact mode toggle, network/storage tests, full report", key_actions: ["health_check", "set_compact", "get_compact", "network_test", "storage_test", "mcp_test", "report", "telemetry"] },
        { name: "guide", description: "This documentation system -- quick start, examples, troubleshooting", key_actions: ["index", "quick_start", "tool_usage", "examples", "troubleshoot", "faq", "search"] },
        { name: "flstudio", description: "Real-time FL Studio Suite v11.0.5: Native menus (file, edit, view, patterns, options, tools, plugins), live session, tone change, styles, mixer & security elevation gate", key_actions: ["detect", "open", "file", "edit", "view", "patterns", "options", "tools", "plugins", "live_session", "change_tone", "music_theory", "mixer_settings", "sound_design", "style_presets"] },
      ],
    }),

    tool_usage: async ({ tool_name = "all" } = {}) => {
      const usage = {
        files: {
          description: "Advanced file system operations.",
          tips: [
            "Use read_file with compact:true to skip metadata and save tokens.",
            "Use surgical_edit or str_replace for precise targeted edits.",
            "Use find_and_replace_in_files for bulk changes across multiple files.",
            "Use directory_tree with compact:true for large directories.",
            "Use json_manager for safe JSON dot-notation editing without overwriting.",
          ],
          example: "files { action: 'read_file', path: 'config.json' }",
        },
        packages: {
          description: "Universal package manager supporting winget, choco, npm, pip, cargo, etc.",
          tips: [
            "Always specify 'manager' to avoid ambiguity (winget, choco, scoop, npm, pip, cargo).",
            "Use 'mode: dry-run' on install to preview without installing.",
            "Use 'audit' to check for vulnerabilities before installing in prod.",
            "winget is the recommended manager on Windows for system software.",
          ],
          example: "packages { action: 'install', manager: 'winget', name: 'Git.Git', mode: 'verbose' }",
        },
        diagnostics: {
          description: "System health, compact mode, network and storage tests.",
          tips: [
            "Use set_compact { enabled: true } before multi-step workflows (5+ tool calls).",
            "Always set_compact { enabled: false } before returning results to the user.",
            "Use report { format: 'json' } for structured machine-readable diagnostics.",
            "Use network_test to verify GitHub connectivity before calling upd.",
            "Use storage_test to verify R/W performance if experiencing slowdowns.",
          ],
          example: "diagnostics { action: 'set_compact', enabled: true, reason: 'Starting bulk file scan' }",
        },
        developer: {
          description: "Git analysis, skill management, feedback, and the upd update system.",
          tips: [
            "Always use upd { action: 'doctor' } first on a new install -- it runs 20 invariant checks.",
            "Use upd { action: 'repair' } if doctor reports failures.",
            "Use compact:true in create_skill, edit_skill, get_skill, list_skills to save tokens.",
            "Use git_status_structured with revealPath:true when you need the real path.",
          ],
          example: "developer { action: 'upd_check', checkRepo: true }",
        },
        upd: {
          description: "Update, autonomous installer & system maintenance.",
          tips: [
            "Use upd { action: 'install', mode: 'wizard' } for first-time AI client onboarding (Claude, Cursor, Windsurf, Cline).",
            "Use upd { action: 'install', mode: 'detect_clients' } to see which AI clients are installed.",
            "Use upd { action: 'doctor' } to run a 20-point self-diagnostic with remediation.",
            "Use upd { action: 'repair' } to auto-fix common issues (stale locks, storage, npm deps).",
            "Use upd { action: 'check' } for a fresh check from GitHub releases/repo.",
            "Use upd { action: 'apply', confirm: true } after asking user confirmation in chat.",
          ],
          example: "upd { action: 'install', mode: 'wizard' }",
        },
        security: {
          description: "Permissions, encryption, hashing and audit.",
          tips: [
            "Use start_workflow { level: 'advanced', durationMinutes: 10 } for extended access.",
            "Only 1 workflow active at a time. Starting a new one replaces the old.",
            "Always explain to the user what you need elevated access for before requesting.",
            "Use audit_log to review recent sensitive operations.",
          ],
          example: "security { action: 'start_workflow', level: 'advanced', durationMinutes: 5, reason: 'Installing system package' }",
        },
        terminal: {
          description: "Command execution and session management.",
          tips: [
            "Use run_as_admin for commands requiring elevation.",
            "Use create_session + run_session_command for multi-step terminal workflows.",
            "Use run_background for long-running tasks; check with get_background_output.",
            "Use run_inline_script { language: 'powershell' } for quick PS scripts.",
          ],
          example: "terminal { action: 'exec', command: 'dir /s', cwd: 'C:\\\\Users\\\\mauri' }",
        },
        system: {
          description: "OS, hardware, processes, power and registry.",
          tips: [
            "Use get_performance_summary for a quick system health snapshot.",
            "Use get_processes with compact:true to avoid overwhelming output.",
            "Use manage_services { service: 'name', action: 'restart' } for service control.",
            "Use screenshot for visual debugging of UI issues.",
          ],
          example: "system { action: 'get_performance_summary' }",
        },
        flstudio: {
          description: "Music production, theory, MIDI generation, tone shifting, free VST plugins and FL Studio scripts.",
          tips: [
            "Use generate_midi { progression: ['Cm7', 'Fm7', 'Bb7', 'Ebmaj7'], bpm: 80, style: 'lofi' } to generate drag-and-drop .mid files.",
            "Use music_theory { mode: 'scale', scale: 'harmonic_minor', root: 'C' } for instant note mapping and scale highlighting.",
            "Use change_tone { notes: ['C4', 'E4', 'G4'], semitones: 2 } to transpose progressions to any key or adjust 432Hz tuning.",
            "Use free_plugins { category: 'all' } to get curated download links and install guides for Vital, LABS, Surge XT, OTT.",
            "Use fl_scripting { type: 'piano_roll' } to generate algorithmic humanizer/arpeggiator scripts for FL Studio 21+.",
            "Use mixer_settings { track_type: 'master' } for commercial loudness limiter specs, stereo separation, and EQ curves.",
          ],
          example: "flstudio { action: 'generate_midi', progression: ['Am', 'F', 'C', 'G'], bpm: 120, style: 'synthwave' }",
        },
      };
      if (tool_name !== "all" && usage[tool_name]) return { ok: true, tool: tool_name, ...usage[tool_name] };
      return { ok: true, usage };
    },

    compact_mode: async () => ({
      ok: true,
      title: "Compact Mode -- AI Token Optimization",
      description: "Compact mode is a session-level toggle that reduces response verbosity to save tokens during heavy workflows.",
      how_to_use: {
        enable: "diagnostics { action: 'set_compact', enabled: true, reason: 'Starting bulk workflow' }",
        disable: "diagnostics { action: 'set_compact', enabled: false }",
        check: "diagnostics { action: 'get_compact' }",
      },
      when_to_enable: [
        "Before processing large directory listings (files.find, files.directory_tree)",
        "Before multi-step automation workflows (5+ sequential tool calls)",
        "When scanning many files for patterns",
        "When running health_check just to verify pass/fail",
        "During package listing (packages.list with many results)",
      ],
      when_to_disable: [
        "Before returning detailed results to the user",
        "When debugging errors (need full error details)",
        "During first-time setup/install (user needs to see output)",
        "When the user asks for detailed information",
      ],
      golden_rule: "Always disable compact mode before your final response to the user. Never leave it ON at the end of a turn.",
      effect_on_responses: {
        health_check: "Shows only status counts and warnings list instead of full check objects",
        packages_list: "Shows package names only instead of full metadata objects",
        system_info: "Shows key metrics only instead of full nested hardware objects",
        terminal_exec: "Shows stdout only (stderr on error) instead of full result object",
      },
    }),

    best_practices: async () => ({
      ok: true,
      guidelines: [
        { rule: "read_before_write", priority: "HIGH", detail: "Always read a file before overwriting it. Use read_file or read_file_range first." },
        { rule: "compact_mode_lifecycle", priority: "HIGH", detail: "Enable compact mode at the start of bulk workflows, disable before showing results to user." },
        { rule: "verify_results", priority: "HIGH", detail: "Don't assume ok:true means success. Verify changes on disk when they matter." },
        { rule: "path_privacy", priority: "MEDIUM", detail: "User paths are obfuscated by default. Use revealPath:true only when the user authorizes it." },
        { rule: "handle_errors", priority: "HIGH", detail: "Read the structured error and adapt your strategy. Never retry the same failed command blindly." },
        { rule: "upd_doctor_first", priority: "MEDIUM", detail: "On a new install or after issues, run upd { action: 'doctor' } before anything else." },
        { rule: "ask_before_destructive", priority: "HIGH", detail: "Always ask the user in the chat before applying updates, deleting files, or elevated operations." },
        { rule: "step_by_step", priority: "MEDIUM", detail: "Work in phases. Don't attempt massive refactors in a single tool call." },
        { rule: "use_install_wizard", priority: "MEDIUM", detail: "For new users, always start with install { action: 'wizard' } for guided setup." },
        { rule: "use_guide_search", priority: "LOW", detail: "When unsure about a tool, use guide { action: 'search', query: '...' } to find relevant docs." },
      ],
    }),

    examples: async ({ domain = "all" } = {}) => {
      const examples = {
        diagnostics: [
          { title: "Enable compact mode", call: "diagnostics { action: 'set_compact', enabled: true }", when: "Before starting a multi-step bulk workflow" },
          { title: "Full system report", call: "diagnostics { action: 'report', format: 'text' }", when: "When user asks for system status" },
          { title: "Test network connectivity", call: "diagnostics { action: 'network_test' }", when: "Before calling upd to verify GitHub is reachable" },
          { title: "MCP health check", call: "diagnostics { action: 'health_check' }", when: "After installing or updating Fluxer" },
        ],
        packages: [
          { title: "Install a package (dry run)", call: "packages { action: 'install', manager: 'winget', name: 'Git.Git', mode: 'dry-run' }", when: "Preview before actually installing" },
          { title: "List installed npm packages", call: "packages { action: 'list', manager: 'npm', mode: 'installed' }", when: "Auditing Node.js dependencies" },
          { title: "Update all winget packages", call: "packages { action: 'update', manager: 'winget', mode: 'all' }", when: "System maintenance" },
          { title: "Security audit", call: "packages { action: 'audit', path: '.', manager: 'npm', mode: 'deep' }", when: "Before shipping a project" },
        ],
        upd: [
          { title: "Check for updates", call: "upd { action: 'check' }", when: "Always first before considering an update" },
          { title: "Run doctor", call: "upd { action: 'doctor' }", when: "After install or when things seem broken" },
          { title: "Full install wizard", call: "upd { action: 'install', mode: 'wizard' }", when: "First time on a new machine" },
          { title: "Detect AI clients", call: "upd { action: 'install', mode: 'detect_clients' }", when: "Check which AI clients are installed" },
          { title: "Configure for Claude Desktop", call: "upd { action: 'install', mode: 'configure', client: 'claude_desktop', confirm: true }", when: "Inject MCP config into Claude Desktop" },
          { title: "Apply update", call: "upd { action: 'apply', confirm: true }", when: "After user confirms in chat" },
          { title: "Rollback", call: "upd { action: 'rollback', confirm: true }", when: "If update caused issues" },
        ],
        flstudio: [
          { title: "Generate MIDI Chords", call: "flstudio { action: 'generate_midi', progression: ['Cm7', 'Fm7', 'Bb7', 'Ebmaj7'], bpm: 80, style: 'lofi' }", when: "Create drag-and-drop .mid file for FL Studio" },
          { title: "Music Theory Scale", call: "flstudio { action: 'music_theory', mode: 'scale', scale: 'harmonic_minor', root: 'C' }", when: "Look up notes and scale highlighting" },
          { title: "Transpose Notes", call: "flstudio { action: 'change_tone', notes: ['C4', 'E4', 'G4'], semitones: 2 }", when: "Shift key up/down or adjust tuning" },
          { title: "Free Plugins Catalog", call: "flstudio { action: 'free_plugins', category: 'all' }", when: "Find safe direct download links for Vital, LABS, OTT" },
          { title: "Sound Design Recipe", call: "flstudio { action: 'sound_design', type: 'bass_808' }", when: "Synth formula for heavy saturated 808" },
        ],
        files: [
          { title: "Read a file", call: "files { action: 'read_file', path: 'config.json' }", when: "Before any edit" },
          { title: "Surgical edit", call: "files { action: 'surgical_edit', path: 'app.js', target: 'old_code', replacement: 'new_code' }", when: "Precise targeted code changes" },
          { title: "Find files by pattern", call: "files { action: 'search_files', path: '.', query: '*.mjs' }", when: "Finding all JS module files" },
          { title: "Directory tree", call: "files { action: 'directory_tree', path: '.', compact: true }", when: "Overview of project structure" },
        ],
      };
      if (domain !== "all" && examples[domain]) return { ok: true, domain, examples: examples[domain] };
      return { ok: true, examples };
    },

    troubleshoot: async ({ issue = "" } = {}) => {
      const issues = {
        update_fails: {
          title: "Update not applying",
          steps: ["Run: upd { action: 'check', force: true }", "Run: diagnostics { action: 'network_test' } to verify GitHub is reachable", "Run: upd { action: 'doctor' } to check 20 invariants", "Run: upd { action: 'repair' } to auto-fix common issues", "If still failing: check updater.log in storage/logs/"],
        },
        mcp_not_appearing: {
          title: "MCP not showing in Claude Desktop / Cursor",
          steps: ["Run: upd { action: 'install', mode: 'status' } to verify config", "Run: upd { action: 'install', mode: 'detect_clients' } to see what's detected", "Run: upd { action: 'install', mode: 'repair' } to re-inject config", "Manually check the config file (e.g. claude_desktop_config.json)", "Restart Claude Desktop after config changes"],
        },
        permission_denied: {
          title: "PERMISSION_DENIED error",
          steps: ["Tell the user what operation you need to perform", "Run: security { action: 'start_workflow', level: 'advanced', durationMinutes: 10, reason: '...' } after user confirms", "Or: security { action: 'approve_request', requestId: '...', confirmationCode: '...' }"],
        },
        high_memory: {
          title: "High memory / slow responses",
          steps: ["Enable compact mode: diagnostics { action: 'set_compact', enabled: true }", "Run: system { action: 'clean_memory' }", "Run: diagnostics { action: 'system_diagnose' } to check memory pressure", "Check which processes are using RAM: system { action: 'get_processes', compact: true }"],
        },
        node_not_found: {
          title: "Node.js not found / install fails",
          steps: ["Run: upd { action: 'install', mode: 'node_check' }", "Minimum version required: Node.js v18+", "Download from: https://nodejs.org/en/download/ or run: winget install OpenJS.NodeJS.LTS"],
        },
      };
      if (issue && issues[issue]) return { ok: true, issue, ...issues[issue] };
      return { ok: true, available_issues: Object.keys(issues), all_issues: issues, tip: "Call troubleshoot { issue: '<key>' } for specific guidance." };
    },

    permissions: async () => ({
      ok: true,
      levels: [
        { name: "visitor", aliases: ["guest"], description: "Minimal read-only exploratory access." },
        { name: "standard", aliases: ["user"], description: "Default level. Safe read/write operations, package inspection, status." },
        { name: "advanced", aliases: ["poweruser"], description: "Advanced operations, package installation, controlled terminal execution." },
        { name: "maintainer", aliases: ["admin"], description: "Network management, processes, maintenance scripts, advanced config." },
        { name: "developer", aliases: [], description: "MCP core modifications, deep diagnostics, engine debugging." },
        { name: "system_root", aliases: ["admintotaluser"], description: "Maximum authority with explicit user authorization." },
      ],
      how_to_elevate: "Tell the user what you need to do, get their confirmation in chat, then: security { action: 'start_workflow', level: 'advanced', durationMinutes: 10, reason: 'your reason here' }",
      golden_rule: "CONSENT RULE: Always ask the user in chat before requesting elevated permissions or executing any system-impacting action.",
      path_privacy: "User paths are obfuscated by default (~ or <user>). Use revealPath: true when the user authorizes you to see the full path.",
      update_consent: "Always ask the user before applying updates. Include: confirm: true in the call only after they say yes.",
    }),

    changelog: async () => ({
      ok: true,
      current: CURRENT_VERSION,
      latest_changes: {
        version: "11.0.5",
        codename: "FL Studio Autonomous Suite",
        date: "2026-09-12",
        highlights: [
          "HOTFIX v11.0.5: Real-time FL Studio autonomous control directly matching native top menus (file, edit, view, patterns, options, tools, plugins)",
          "NEW: flstudio.file -- headless export, live project save/open, intelligent backup recovery from registry & Backup folder",
          "NEW: flstudio.edit -- instant keystroke macros (undo, redo, quantize, copy/paste, duplicate)",
          "NEW: flstudio.view -- fast window navigation (playlist F5, rack F6, piano roll F7, mixer F9, browser, plugin picker)",
          "NEW: flstudio.patterns -- next/prev pattern selection, cloning, split by channel",
          "NEW: flstudio.options & security gate -- elevated security verification for ASIO driver/buffer and registry modifications",
          "NEW: flstudio.tools -- macros (purge audio, smart disable CPU saver) and dump score log MIDI recovery",
          "NEW: flstudio.plugins -- live inspection of installed Presets/Plugin database and free VST catalog",
          "NEW: flstudio.live_session -- persistent single-workspace state and MIDI file (no spamming separate files)",
          "OPTIMIZED: Token reduction with consolidated options and compact mode compatibility across all tools",
        ],
      },
      github: "https://github.com/Lara2026ss/aero-fluxer-x",
    }),

    faq: async () => ({
      ok: true,
      questions: [
        { q: "Does Fluxer require Git to be installed?", a: "No. The updater (upd) works without git.exe in the system PATH. It reads the .git folder directly using Node.js native file APIs." },
        { q: "How do I update Fluxer?", a: "Run: developer { action: 'upd_check' } first, then ask the user if they want to update, then: developer { action: 'upd', confirm: true } only after they confirm." },
        { q: "What is compact mode and should I always enable it?", a: "Compact mode reduces response size to save AI tokens. Enable it during bulk workflows (5+ sequential calls). Disable it before showing results to the user." },
        { q: "Why does health_check show 'N/A' for npm or Python?", a: "v11.0.0+ runs real version checks. If you still see N/A, those tools are not installed (Python is not required; npm is needed for npm package management)." },
        { q: "How do I install on a new PC for a new user?", a: "Run: install { action: 'wizard' } -- it auto-detects Node.js, AI clients, and configures everything. Requires Node.js v18+ to be installed first." },
        { q: "Can I roll back an update?", a: "Yes. Run: developer { action: 'upd_rollback', confirm: true } to revert to the previous version backup." },
        { q: "What AI clients does the install wizard support?", a: "Claude Desktop, Cursor, Windsurf, VS Code + Cline extension, and any client using the standard MCP config format." },
        { q: "How many tools does Fluxer have?", a: `v${CURRENT_VERSION} has 12 tool domains with 349+ actions.` },
      ],
    }),

    search: async ({ query = "" } = {}) => {
      if (!query) return { ok: false, error: "Provide a search query: guide { action: 'search', query: 'your question' }" };
      const q = query.toLowerCase();
      const results = [];
      if (q.includes("compact") || q.includes("token")) results.push({ action: "compact_mode", relevance: "HIGH", summary: "Compact mode toggle guide -- how to enable/disable and when" });
      if (q.includes("update") || q.includes("upd") || q.includes("upgrade")) results.push({ action: "examples", domain: "upd", relevance: "HIGH", summary: "Update workflow examples" });
      if (q.includes("install") || q.includes("setup") || q.includes("new")) results.push({ action: "examples", domain: "install", relevance: "HIGH", summary: "Installation wizard examples" });
      if (q.includes("package") || q.includes("npm") || q.includes("winget") || q.includes("pip")) results.push({ action: "examples", domain: "packages", relevance: "HIGH", summary: "Package manager usage examples" });
      if (q.includes("file") || q.includes("read") || q.includes("write") || q.includes("edit")) results.push({ action: "examples", domain: "files", relevance: "HIGH", summary: "File operation examples" });
      if (q.includes("permission") || q.includes("access") || q.includes("denied")) results.push({ action: "permissions", relevance: "HIGH", summary: "Permission levels and elevation guide" });
      if (q.includes("error") || q.includes("fail") || q.includes("broken") || q.includes("fix")) results.push({ action: "troubleshoot", relevance: "HIGH", summary: "Troubleshooting guide" });
      if (q.includes("health") || q.includes("diagnos") || q.includes("check")) results.push({ action: "tool_usage", tool_name: "diagnostics", relevance: "HIGH", summary: "Diagnostics tool usage" });
      if (q.includes("git") || q.includes("developer") || q.includes("skill")) results.push({ action: "tool_usage", tool_name: "developer", relevance: "HIGH", summary: "Developer tool usage" });
      if (q.includes("fl") || q.includes("flstudio") || q.includes("music") || q.includes("midi")) results.push({ action: "tool_usage", tool_name: "flstudio", relevance: "HIGH", summary: "FL Studio Suite real-time tool usage" });
      if (q.includes("network") || q.includes("internet") || q.includes("connect")) results.push({ action: "tool_usage", tool_name: "diagnostics", relevance: "MEDIUM", summary: "Network test in diagnostics" });
      if (results.length === 0) results.push({ action: "index", relevance: "LOW", summary: "Browse the full guide index" });
      return { ok: true, query, count: results.length, results, tip: "Call any of the suggested actions to get detailed information." };
    },
  };

  const permissions = {
    index: "standard", quick_start: "standard", tools: "standard", tool_usage: "standard",
    compact_mode: "standard", best_practices: "standard", examples: "standard",
    troubleshoot: "standard", permissions: "standard", changelog: "standard",
    faq: "standard", search: "standard",
    // legacy
    permissions_info: "standard",
  };

  // Legacy aliases
  actions.permissions_info = actions.permissions;
  actions.tool_usage = actions.tool_usage; // already defined

  return domain("guide", `Documentacion oficial v${CURRENT_VERSION} -- index, quick_start, tools, tool_usage, compact_mode, best_practices, examples, troubleshoot, permissions, changelog, faq, search.`, actions, permissions);
}
