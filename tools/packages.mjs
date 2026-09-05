import os from "node:os";

export function createPackagesDomain({ runtime, domain, parsePkgLines: externalParser, buildPkgCmd: externalBuilder, detectPkgManager: externalDetect }) {
  function detectPkg() {
    return "winget";
  }

  function resolvePkgCmd(operation, mgr, name) {
    const m = String(mgr || detectPkg()).toLowerCase();
    const q = name ? runtime.shellQuote(name) : "";
    switch (operation) {
      case "install":
        if (m === "winget") return `winget install --id ${q} --accept-source-agreements --accept-package-agreements -e`;
        if (m === "choco") return `choco install ${q} -y`;
        if (m === "scoop") return `scoop install ${q}`;
        if (m === "npm") return `npm install -g ${q}`;
        if (m === "pnpm") return `pnpm add -g ${q}`;
        if (m === "pip" || m === "pip3") return `pip install ${q}`;
        if (m === "cargo") return `cargo install ${q}`;
        if (m === "go") return `go install ${q}`;
        return `winget install --id ${q} -e`;
      case "remove":
        if (m === "winget") return `winget uninstall --id ${q} -e`;
        if (m === "choco") return `choco uninstall ${q} -y`;
        if (m === "scoop") return `scoop uninstall ${q}`;
        if (m === "npm") return `npm uninstall -g ${q}`;
        if (m === "pnpm") return `pnpm remove -g ${q}`;
        if (m === "pip" || m === "pip3") return `pip uninstall -y ${q}`;
        if (m === "cargo") return `cargo uninstall ${q}`;
        return `winget uninstall --id ${q} -e`;
      case "update":
        if (m === "winget") return name ? `winget upgrade --id ${q} -e` : `winget upgrade --all`;
        if (m === "choco") return name ? `choco upgrade ${q} -y` : `choco upgrade all -y`;
        if (m === "scoop") return name ? `scoop update ${q}` : `scoop update *`;
        if (m === "npm") return name ? `npm update -g ${q}` : `npm update -g`;
        if (m === "pnpm") return name ? `pnpm update -g ${q}` : `pnpm update -g`;
        if (m === "pip" || m === "pip3") return `pip install --upgrade ${q || "pip"}`;
        if (m === "cargo") return `cargo install-update -a`;
        return `winget upgrade --all`;
      case "search":
        if (m === "winget") return `winget search ${q} --accept-source-agreements`;
        if (m === "choco") return `choco search ${q}`;
        if (m === "scoop") return `scoop search ${q}`;
        if (m === "npm") return `npm search ${q}`;
        if (m === "pnpm") return `pnpm search ${q}`;
        if (m === "pip" || m === "pip3") return `pip search ${q}`;
        if (m === "cargo") return `cargo search ${q}`;
        return `winget search ${q}`;
      case "info":
        if (m === "winget") return `winget show --id ${q}`;
        if (m === "choco") return `choco info ${q}`;
        if (m === "scoop") return `scoop info ${q}`;
        if (m === "npm") return `npm view ${q}`;
        if (m === "pnpm") return `pnpm view ${q}`;
        if (m === "pip" || m === "pip3") return `pip show ${q}`;
        if (m === "cargo") return `cargo info ${q}`;
        return `winget show --id ${q}`;
      case "list":
        if (m === "winget") return `winget list`;
        if (m === "choco") return `choco list --local-only`;
        if (m === "scoop") return `scoop list`;
        if (m === "npm") return `npm list -g --depth=0`;
        if (m === "pnpm") return `pnpm list -g --depth=0`;
        if (m === "pip" || m === "pip3") return `pip list`;
        if (m === "cargo") return `cargo install --list`;
        return `winget list`;
      default:
        return `${m} list`;
    }
  }

  function parseOutput(stdout) {
    const text = String(stdout || "")
      .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
      .replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, "")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
      .replace(/\r/g, "\n");
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => {
        if (!l) return false;
        if (/^[-—=\s\u2500-\u257F\u2580-\u259F]+$/.test(l)) return false;
        if (/^\s*\d+%\s*/.test(l) || /^[████\u2580-\u259F]+/.test(l)) return false;
        if (/^(\+--|`--|\|--|[+\-|`]\s)/.test(l)) return true;
        const lower = l.toLowerCase();
        if (lower.startsWith("nombre ") || lower.startsWith("name ") || lower.startsWith("id ") || lower.startsWith("paquete ") || lower.startsWith("package ") || lower.startsWith("version ") || lower.startsWith("directory ")) return false;
        if (lower.includes("search_agreements") || lower.includes("source_agreements") || lower.includes("buscando") || lower.includes("searching") || lower.includes("se encontró") || lower.includes("found ") || lower.includes("installed package")) return false;
        return true;
      })
      .slice(0, 100);
  }

  const actions = {
    install_package: async ({ manager, name } = {}) => {
      if (!name) return { ok: false, error: "El parámetro 'name' es requerido." };
      const mgr = manager || detectPkg();
      const cmd = resolvePkgCmd("install", mgr, name);
      const res = ["winget", "brew", "npm", "pnpm", "pip", "cargo", "go", "scoop"].includes(mgr.toLowerCase())
        ? await runtime.run(cmd, { timeout: 300000 })
        : await runtime.runElevated(cmd, { timeout: 300000 });
      return { ok: res.ok, manager: mgr, output: res.stdout };
    },

    remove_package: async ({ manager, name } = {}) => {
      if (!name) return { ok: false, error: "El parámetro 'name' es requerido." };
      const mgr = manager || detectPkg();
      const cmd = resolvePkgCmd("remove", mgr, name);
      const res = ["winget", "brew", "npm", "pnpm", "pip", "cargo", "go", "scoop"].includes(mgr.toLowerCase())
        ? await runtime.run(cmd, { timeout: 120000 })
        : await runtime.runElevated(cmd, { timeout: 120000 });
      return { ok: res.ok, manager: mgr, output: res.stdout };
    },

    update_package: async ({ manager, name = "" } = {}) => {
      const mgr = manager || detectPkg();
      const cmd = resolvePkgCmd("update", mgr, name);
      const res = ["winget", "brew", "npm", "pnpm", "pip", "cargo", "go", "scoop"].includes(mgr.toLowerCase())
        ? await runtime.run(cmd, { timeout: 300000 })
        : await runtime.runElevated(cmd, { timeout: 300000 });
      return { ok: res.ok, manager: mgr, output: res.stdout };
    },

    search_package: async ({ manager, query } = {}) => {
      if (!query) return { ok: false, error: "El parámetro 'query' es requerido." };
      const mgr = manager || detectPkg();
      const cmd = resolvePkgCmd("search", mgr, query) + (process.platform === "win32" ? "" : " | head -50");
      const res = await runtime.run(cmd);
      const items = parseOutput(res.stdout);
      return { ok: res.ok || items.length > 0, manager: mgr, count: items.length, results: items };
    },

    package_info: async ({ manager, name } = {}) => {
      if (!name) return { ok: false, error: "El parámetro 'name' es requerido." };
      const mgr = manager || detectPkg();
      const cmd = resolvePkgCmd("info", mgr, name) + (process.platform === "win32" ? "" : " | head -50");
      const res = await runtime.run(cmd);
      return { ok: res.ok || Boolean(res.stdout), manager: mgr, name, info: res.stdout || res.stderr };
    },

    list_installed: async ({ manager } = {}) => {
      const mgr = manager || detectPkg();
      const cmd = resolvePkgCmd("list", mgr, "") + (process.platform === "win32" ? "" : " | head -100");
      const res = await runtime.run(cmd);
      const items = parseOutput(res.stdout);
      const isEnoentOrEmpty = res.stderr && (res.stderr.includes("ENOENT") || res.stderr.includes("no such file") || res.stderr.includes("PSSecurityException"));
      return {
        ok: res.ok || items.length > 0 || isEnoentOrEmpty,
        manager: mgr,
        count: items.length,
        packages: items,
        ...(res.ok || items.length > 0 ? {} : { error: isEnoentOrEmpty ? "No hay paquetes globales instalados." : (res.stderr || "Error listando paquetes instalados.") }),
      };
    },

    add_repository: async ({ manager = "dnf", url, name = "" } = {}) => {
      if (!url) return { ok: false, error: "El parámetro 'url' es requerido." };
      const cmd = manager === "apt"
        ? `add-apt-repository -y ${runtime.shellQuote(url)}`
        : `dnf config-manager --add-repo ${runtime.shellQuote(url)}`;
      const res = await runtime.runElevated(cmd);
      return { ok: res.ok, output: res.stdout };
    },

    remove_repository: async ({ manager = "dnf", name } = {}) => {
      if (!name) return { ok: false, error: "El parámetro 'name' es requerido." };
      const cmd = manager === "apt"
        ? `add-apt-repository --remove -y ${runtime.shellQuote(name)}`
        : `dnf config-manager --disable ${runtime.shellQuote(name)}`;
      const res = await runtime.runElevated(cmd);
      return { ok: res.ok, output: res.stdout };
    },

    check_manager: async ({ manager } = {}) => {
      const mgr = String(manager || detectPkg()).toLowerCase();
      const testCmd = {
        npm: "npm -v",
        pnpm: "pnpm -v",
        pip: "pip --version",
        pip3: "pip3 --version",
        cargo: "cargo --version",
        go: "go version",
        winget: "winget --version",
        choco: "choco --version",
        scoop: "scoop --version",
      }[mgr] || `${mgr} --version`;

      const res = await runtime.run(testCmd, { timeout: 10000 });
      return {
        ok: true,
        manager: mgr,
        available: res.ok && Boolean(res.stdout),
        version: res.ok ? res.stdout.split(/\r?\n/)[0].trim() : null,
      };
    },

    list_repositories: async () => {
      const cmd = "winget source list";
      const res = await runtime.run(cmd);
      const repos = parseOutput(res.stdout);
      return { ok: res.ok || repos.length > 0, repositories: repos };
    },

    audit_vulnerabilities: async ({ path: targetPath, manager = "npm" } = {}) => {
      const mgr = String(manager || "npm").toLowerCase();
      if (mgr !== "npm" && mgr !== "pnpm") {
        return {
          ok: false,
          error: `Auditoría de vulnerabilidades disponible para 'npm' o 'pnpm' (solicitado: '${mgr}').`,
        };
      }
      const cwd = targetPath ? (runtime.hp ? runtime.hp(targetPath) : targetPath) : process.cwd();
      const cmd = mgr === "pnpm" ? "pnpm audit --json" : "npm audit --json";
      const res = await runtime.run(cmd, { cwd, timeout: 30000 });

      const homeDir = os.homedir();
      const sanitize = (val) => {
        if (typeof val === "string") return val.split(homeDir).join("~");
        return val;
      };

      let auditData = null;
      try {
        auditData = JSON.parse(res.stdout);
      } catch {}

      if (auditData) {
        const vulns = auditData.vulnerabilities || auditData.metadata?.vulnerabilities || {};
        return {
          ok: true,
          manager: mgr,
          audit_passed: Boolean(
            auditData.metadata?.vulnerabilities?.total === 0 ||
              (!auditData.error && Object.keys(vulns).length === 0)
          ),
          summary: auditData.metadata?.vulnerabilities || vulns,
          advisories_count: Object.keys(vulns).length,
          advisories: Object.values(vulns)
            .slice(0, 10)
            .map((v) => ({
              name: v.name,
              severity: v.severity,
              range: v.range,
              fixAvailable: v.fixAvailable,
            })),
          privacy_sanitized: true,
        };
      }

      return {
        ok: res.ok,
        manager: mgr,
        raw_output: sanitize((res.stdout || res.stderr || "").slice(0, 1000)),
        privacy_sanitized: true,
      };
    },
  };

  // Alias intuitivos para llamadas de LLMs
  actions.list_installed_packages = actions.list_installed;
  actions.list_packages = actions.list_installed;
  actions.list = actions.list_installed;
  actions.search = actions.search_package;
  actions.info = actions.package_info;
  actions.install = actions.install_package;
  actions.remove = actions.remove_package;
  actions.uninstall = actions.remove_package;
  actions.update = actions.update_package;
  actions.upgrade = actions.update_package;
  actions.audit = actions.audit_vulnerabilities;

  const permissions = {
    check_manager: "standard",
    audit_vulnerabilities: "standard",
    audit: "standard",
    list_installed: "standard",
    list_installed_packages: "standard",
    list_packages: "standard",
    list: "standard",
    list_repositories: "standard",
    search_package: "standard",
    search: "standard",
    package_info: "standard",
    info: "standard",
    install_package: "advanced",
    install: "advanced",
    remove_package: "advanced",
    remove: "advanced",
    uninstall: "advanced",
    update_package: "advanced",
    update: "advanced",
    upgrade: "advanced",
    add_repository: "advanced",
    remove_repository: "advanced",
  };

  return domain("packages", "Gestor universal de paquetes (winget, choco, scoop, npm, pnpm, pip, cargo, go, apt, dnf, pacman, brew, flatpak).", actions, permissions);
}
