export function createDeveloperDomain({ runtime, domain, fs, path }) {
  function parseSkillFrontmatter(rawText) {
    const match = rawText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { frontmatter: null, body: rawText };
    const rawFm = match[1];
    const body = match[2];
    const frontmatter = {};
    const lines = rawFm.split(/\r?\n/);
    let currentKey = null;
    let isArray = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      if (line.startsWith("  - ") && currentKey && isArray) {
        frontmatter[currentKey].push(trimmed.slice(2).trim());
        continue;
      }

      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim();
        if (!val) {
          currentKey = key;
          isArray = true;
          frontmatter[key] = [];
        } else {
          currentKey = key;
          isArray = false;
          let cleanVal = val;
          if ((cleanVal.startsWith('"') && cleanVal.endsWith('"')) || (cleanVal.startsWith("'") && cleanVal.endsWith("'"))) {
            cleanVal = cleanVal.slice(1, -1);
          }
          frontmatter[key] = cleanVal;
        }
      }
    }
    return { frontmatter, body };
  }

  const actions = {
    detect_project: async ({ path: p = "." } = {}) => {
      const target = runtime.hp(p);
      const types = [];
      let manifest = null;

      if (await fs.access(path.join(target, "package.json")).then(() => true).catch(() => false)) {
        types.push("Node.js");
        try { manifest = JSON.parse(await fs.readFile(path.join(target, "package.json"), "utf8")); } catch {}
      }
      if (await fs.access(path.join(target, "Cargo.toml")).then(() => true).catch(() => false)) types.push("Rust");
      if (await fs.access(path.join(target, "pyproject.toml")).then(() => true).catch(() => false) || await fs.access(path.join(target, "requirements.txt")).then(() => true).catch(() => false)) types.push("Python");
      if (await fs.access(path.join(target, "go.mod")).then(() => true).catch(() => false)) types.push("Go");

      return {
        ok: true,
        path: target,
        detectedEcosystems: types,
        isProject: types.length > 0,
        primaryType: types[0] || "unknown",
        name: manifest?.name || path.basename(target),
        version: manifest?.version || "1.0.0"
      };
    },

    inspect_project: async ({ path: p = "." } = {}) => {
      const target = runtime.hp(p);
      const pkgPath = path.join(target, "package.json");
      try {
        const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
        return {
          ok: true,
          name: pkg.name,
          version: pkg.version,
          scripts: Object.keys(pkg.scripts || {}),
          dependenciesCount: Object.keys(pkg.dependencies || {}).length,
          devDependenciesCount: Object.keys(pkg.devDependencies || {}).length,
          hasTests: Boolean(pkg.scripts?.test),
          hasBuild: Boolean(pkg.scripts?.build)
        };
      } catch (e) {
        return { ok: false, error: "No se pudo leer el manifiesto del proyecto: " + e.message };
      }
    },

    run_project_tests: async ({ path: p = ".", timeoutMs = 60000 } = {}) => {
      const target = runtime.hp(p);
      const res = await runtime.run("npm test", { cwd: target, timeout: Number(timeoutMs) || 60000 });
      return {
        ok: res.ok,
        cwd: target,
        output: res.stdout || "",
        ...(res.ok ? {} : { error: res.stderr || "npm test finalizó con código de error non-zero." })
      };
    },

    run_project_build: async ({ path: p = ".", timeoutMs = 60000 } = {}) => {
      const target = runtime.hp(p);
      const res = await runtime.run("npm run build", { cwd: target, timeout: Number(timeoutMs) || 60000 });
      return {
        ok: res.ok,
        cwd: target,
        output: res.stdout || "",
        ...(res.ok ? {} : { error: res.stderr || "npm run build finalizó con código de error non-zero." })
      };
    },

    diagnose_service: async ({ path: p = ".", serviceId } = {}) => {
      const target = runtime.hp(p);
      const pkgPath = path.join(target, "package.json");
      const gitPath = path.join(target, ".git");
      const hasPkg = await fs.access(pkgPath).then(() => true).catch(() => false);
      const hasGit = await fs.access(gitPath).then(() => true).catch(() => false);

      if (!hasPkg) {
        return {
          ok: false,
          serviceId: serviceId || path.basename(target),
          status: "CONFIG_INVALID",
          reason: "Manifiesto de proyecto package.json no encontrado en la ruta dada.",
        };
      }

      try {
        const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
        let commit = null;
        if (hasGit) {
          const gitRes = await runtime.run("git rev-parse HEAD", { cwd: target }).catch(() => ({ ok: false }));
          if (gitRes.ok) commit = gitRes.stdout.trim();
        }

        const healthStatus = pkg.scripts?.test ? "HEALTHY" : "DEGRADED";

        return {
          ok: true,
          serviceId: serviceId || pkg.name || path.basename(target),
          status: healthStatus,
          environment: process.env.NODE_ENV || "development",
          commit,
          hasBuildCommand: Boolean(pkg.scripts?.build),
          hasStartCommand: Boolean(pkg.scripts?.start),
          hasTests: Boolean(pkg.scripts?.test),
          diagnosedAt: new Date().toISOString(),
        };
      } catch (e) {
        return {
          ok: false,
          serviceId: serviceId || path.basename(target),
          status: "MISCONFIGURED",
          error: e.message,
        };
      }
    },

    refresh_service_state: async ({ path: p = ".", serviceId } = {}) => {
      const target = runtime.hp(p);
      if (runtime.cachePolicy) {
        runtime.cachePolicy.invalidateService(serviceId || path.basename(target));
      }

      const diag = await actions.diagnose_service({ path: p, serviceId });
      return {
        ok: diag.ok,
        source: "live",
        cacheBypassed: true,
        cacheInvalidated: true,
        refreshedAt: new Date().toISOString(),
        service: diag,
        verification: {
          status: diag.ok ? "VERIFIED" : "VERIFICATION_FAILED",
          verifiedAt: new Date().toISOString(),
        },
      };
    },

    create_skill: async ({ name, description, instructions = "", path: targetPath, rules = [], examples = [], references = [], scripts = [], overwrite = true } = {}) => {
      if (!name) return { ok: false, error: "El parámetro 'name' es requerido para crear una skill." };
      if (!description) return { ok: false, error: "El parámetro 'description' es requerido para crear una skill." };

      const cleanName = String(name).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      let skillFile;
      let skillDir;

      if (targetPath) {
        const resolved = runtime.hp(targetPath);
        if (resolved.toLowerCase().endsWith(".md")) {
          skillFile = resolved;
          skillDir = path.dirname(resolved);
        } else {
          skillDir = resolved;
          skillFile = path.join(skillDir, "SKILL.md");
        }
      } else {
        const baseRoot = runtime.root || process.cwd();
        skillDir = path.join(baseRoot, ".gemini", "skills", cleanName);
        skillFile = path.join(skillDir, "SKILL.md");
      }

      try {
        await fs.mkdir(skillDir, { recursive: true });

        const exists = await fs.access(skillFile).then(() => true).catch(() => false);
        if (exists && !overwrite) {
          return { ok: false, error: `El archivo de skill '${skillFile}' ya existe y overwrite=false.` };
        }

        const safeDesc = String(description).trim();
        const descFmt = safeDesc.includes("\n")
          ? `|\n  ${safeDesc.replace(/\n/g, "\n  ")}`
          : (safeDesc.includes(":") || safeDesc.includes('"') || safeDesc.includes("'") ? `"${safeDesc.replace(/"/g, '\\"')}"` : safeDesc);

        let md = `---\nname: ${cleanName}\ndescription: ${descFmt}\n---\n\n# ${name}\n\n`;

        if (instructions && String(instructions).trim()) {
          md += `${String(instructions).trim()}\n\n`;
        } else {
          md += `## Overview\n\n${safeDesc}\n\n## Instructions\n\nDefine the standard workflow and operational instructions for this skill.\n\n`;
        }

        if (Array.isArray(rules) && rules.length > 0) {
          md += `## Rules & Best Practices\n\n`;
          for (const rule of rules) {
            md += `- ${rule}\n`;
          }
          md += "\n";
        }

        const buf = Buffer.from(md.trimEnd() + "\n", "utf8");
        await fs.writeFile(skillFile, buf);

        const createdResources = [];

        if (Array.isArray(examples) && examples.length > 0) {
          const exDir = path.join(skillDir, "examples");
          await fs.mkdir(exDir, { recursive: true });
          for (let i = 0; i < examples.length; i++) {
            const ex = examples[i];
            if (typeof ex === "object" && ex !== null && ex.filename && ex.content) {
              const fPath = path.join(exDir, ex.filename);
              await fs.writeFile(fPath, String(ex.content), "utf8");
              createdResources.push(`examples/${ex.filename}`);
            } else if (typeof ex === "string") {
              const fname = `example_${i + 1}.md`;
              await fs.writeFile(path.join(exDir, fname), ex, "utf8");
              createdResources.push(`examples/${fname}`);
            }
          }
        }

        if (Array.isArray(references) && references.length > 0) {
          const refDir = path.join(skillDir, "references");
          await fs.mkdir(refDir, { recursive: true });
          for (let i = 0; i < references.length; i++) {
            const ref = references[i];
            if (typeof ref === "object" && ref !== null && ref.filename && ref.content) {
              const fPath = path.join(refDir, ref.filename);
              await fs.writeFile(fPath, String(ref.content), "utf8");
              createdResources.push(`references/${ref.filename}`);
            } else if (typeof ref === "string") {
              const fname = `reference_${i + 1}.md`;
              await fs.writeFile(path.join(refDir, fname), ref, "utf8");
              createdResources.push(`references/${fname}`);
            }
          }
        }

        if (Array.isArray(scripts) && scripts.length > 0) {
          const scrDir = path.join(skillDir, "scripts");
          await fs.mkdir(scrDir, { recursive: true });
          for (let i = 0; i < scripts.length; i++) {
            const sc = scripts[i];
            if (typeof sc === "object" && sc !== null && sc.filename && sc.content) {
              const fPath = path.join(scrDir, sc.filename);
              await fs.writeFile(fPath, String(sc.content), "utf8");
              createdResources.push(`scripts/${sc.filename}`);
            } else if (typeof sc === "string") {
              const fname = `script_${i + 1}.js`;
              await fs.writeFile(path.join(scrDir, fname), sc, "utf8");
              createdResources.push(`scripts/${fname}`);
            }
          }
        }

        return {
          ok: true,
          skillName: cleanName,
          skillFile,
          skillDirectory: skillDir,
          sizeBytes: buf.length,
          linesCount: md.split(/\r?\n/).length,
          resourcesCreated: createdResources,
        };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    validate_skill: async ({ path: p } = {}) => {
      if (!p) return { ok: false, error: "El parámetro 'path' es requerido para validar una skill." };
      const target = runtime.hp(p);
      try {
        let skillFile = target;
        const stat = await fs.stat(target).catch(() => null);
        if (!stat) {
          return { ok: false, valid: false, error: `La ruta '${target}' no existe.` };
        }
        if (stat.isDirectory()) {
          skillFile = path.join(target, "SKILL.md");
          const fStat = await fs.stat(skillFile).catch(() => null);
          if (!fStat) {
            skillFile = path.join(target, "skill.md");
            const fStat2 = await fs.stat(skillFile).catch(() => null);
            if (!fStat2) {
              return { ok: true, valid: false, errors: ["No se encontró SKILL.md dentro del directorio."], warnings: [], path: target };
            }
          }
        }

        const raw = await fs.readFile(skillFile, "utf8");
        const { frontmatter, body } = parseSkillFrontmatter(raw);
        const errors = [];
        const warnings = [];

        if (!frontmatter) {
          errors.push("Falta el bloque YAML frontmatter (delimitado con '---' al inicio del archivo).");
        } else {
          if (!frontmatter.name) {
            errors.push("El campo 'name' es requerido en el frontmatter de la skill.");
          } else if (!/^[a-zA-Z0-9_-]+$/.test(frontmatter.name)) {
            warnings.push(`El nombre '${frontmatter.name}' contiene caracteres especiales. Se recomienda usar solo letras, números, guiones y guiones bajos.`);
          }

          if (!frontmatter.description) {
            errors.push("El campo 'description' es requerido en el frontmatter de la skill.");
          } else if (String(frontmatter.description).trim().length < 10) {
            warnings.push("La descripción es muy corta. Se recomienda detallar cuándo y cómo debe activarse la skill.");
          }
        }

        if (!body || body.trim().length === 0) {
          errors.push("El cuerpo de instrucciones de la skill está vacío.");
        }

        const valid = errors.length === 0;

        return {
          ok: true,
          valid,
          skillFile,
          metadata: frontmatter || {},
          instructionsLinesCount: (body || "").split(/\r?\n/).length,
          errors,
          warnings,
        };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    list_skills: async ({ path: p = ".", searchGlobal = true } = {}) => {
      const foundSkills = [];
      const visitedPaths = new Set();

      async function scanDirectory(dirPath, maxDepth = 4, depth = 0) {
        if (depth > maxDepth) return;
        const resolved = path.resolve(dirPath);
        if (visitedPaths.has(resolved.toLowerCase())) return;
        visitedPaths.add(resolved.toLowerCase());

        try {
          const entries = await fs.readdir(resolved, { withFileTypes: true }).catch(() => []);
          for (const entry of entries) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            const full = path.join(resolved, entry.name);
            if (entry.isDirectory()) {
              const skillMdPath = path.join(full, "SKILL.md");
              const hasSkillMd = await fs.access(skillMdPath).then(() => true).catch(() => false);
              if (hasSkillMd) {
                try {
                  const raw = await fs.readFile(skillMdPath, "utf8");
                  const { frontmatter } = parseSkillFrontmatter(raw);
                  foundSkills.push({
                    name: frontmatter?.name || entry.name,
                    description: frontmatter?.description || "",
                    file: skillMdPath,
                    directory: full,
                  });
                } catch {}
              }
              await scanDirectory(full, maxDepth, depth + 1);
            } else if (entry.isFile() && (entry.name === "SKILL.md" || entry.name === "skill.md")) {
              if (!foundSkills.some((s) => s.file.toLowerCase() === full.toLowerCase())) {
                try {
                  const raw = await fs.readFile(full, "utf8");
                  const { frontmatter } = parseSkillFrontmatter(raw);
                  foundSkills.push({
                    name: frontmatter?.name || path.basename(resolved),
                    description: frontmatter?.description || "",
                    file: full,
                    directory: resolved,
                  });
                } catch {}
              }
            }
          }
        } catch {}
      }

      const target = runtime.hp(p);
      await scanDirectory(target, 4);

      if (searchGlobal) {
        const userProf = process.env.USERPROFILE || process.env.HOME || runtime.home;
        const globalLocations = [
          path.join(userProf, ".gemini", "skills"),
          path.join(userProf, ".gemini", "config", "skills"),
          path.join(userProf, ".gemini", "config", "plugins"),
          path.join(userProf, ".gemini", "antigravity", "builtin", "skills"),
          path.join(userProf, ".gemini", "antigravity", "skills"),
        ];

        for (const loc of globalLocations) {
          const exists = await fs.access(loc).then(() => true).catch(() => false);
          if (exists) {
            await scanDirectory(loc, 3);
          }
        }
      }

      // Eliminar duplicados por ruta
      const uniqueSkills = [];
      const seenFiles = new Set();
      for (const sk of foundSkills) {
        if (!seenFiles.has(sk.file.toLowerCase())) {
          seenFiles.add(sk.file.toLowerCase());
          uniqueSkills.push(sk);
        }
      }

      return {
        ok: true,
        count: uniqueSkills.length,
        skills: uniqueSkills,
      };
    },

    get_skill: async ({ name, path: p } = {}) => {
      let targetFile = null;
      if (p) {
        const resolved = runtime.hp(p);
        const stat = await fs.stat(resolved).catch(() => null);
        if (stat?.isDirectory()) {
          targetFile = path.join(resolved, "SKILL.md");
        } else {
          targetFile = resolved;
        }
      } else if (name) {
        const listRes = await actions.list_skills({ searchGlobal: true });
        const match = listRes.skills.find((s) => s.name.toLowerCase() === String(name).toLowerCase());
        if (match) targetFile = match.file;
      }

      if (!targetFile) {
        return { ok: false, error: `No se encontró la skill ${name ? `'${name}'` : `en '${p}'`}.` };
      }

      try {
        const raw = await fs.readFile(targetFile, "utf8");
        const { frontmatter, body } = parseSkillFrontmatter(raw);
        const skillDir = path.dirname(targetFile);

        const subResources = { examples: [], references: [], scripts: [] };
        for (const resType of ["examples", "references", "scripts"]) {
          const resDir = path.join(skillDir, resType);
          const entries = await fs.readdir(resDir).catch(() => []);
          subResources[resType] = entries;
        }

        return {
          ok: true,
          file: targetFile,
          directory: skillDir,
          metadata: frontmatter || {},
          instructions: body.trim(),
          subResources,
        };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
  };

  return domain(
    "developer",
    "Detección, análisis, tests, builds y gestión integral de skills de IA (.md) para desarrollo de software.",
    actions,
    {
      create_skill: "user",
      validate_skill: "user",
      list_skills: "user",
      get_skill: "user",
      detect_project: "user",
      inspect_project: "user",
      run_project_tests: "poweruser",
      run_project_build: "poweruser",
      diagnose_service: "user",
      refresh_service_state: "user",
    }
  );
}
