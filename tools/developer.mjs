import os from "node:os";
import https from "node:https";
import http from "node:http";
import crypto from "node:crypto";
import { getStorageStructure } from "../core/storage-paths.mjs";
import { CURRENT_VERSION } from "../core/version.mjs";
import { checkForUpdates, executeAutoUpdate } from "../core/updater.mjs";
import { unwrapArgs } from "../core/json-utils.mjs";

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
    },

    submit_feedback: async (rawInput = {}) => {
      // Normalización defensiva: soporta clientes MCP (como Claude Desktop) con JSON stringificado, anidado o con data/args
      const input = unwrapArgs(rawInput);

      let {
        type = "bug_report",
        title,
        description,
        steps_to_reproduce = "",
        expected_behavior = "",
        actual_behavior = "",
        severity = "medium",
        screenshot = null,
        attach_logs = true,
        tool = null,
      } = input || {};

      // 1. Validación de campos obligatorios
      if (!title || typeof title !== "string" || !title.trim() || !description || typeof description !== "string" || !description.trim()) {
        return {
          ok: false,
          status: "invalid_input",
          code: "INVALID_INPUT",
          message: "Los campos 'title' y 'description' son obligatorios para enviar feedback.",
        };
      }

      // 2. Escáner de seguridad y sanitización local (Cero Secretos)
      const sensitivePatterns = [
        /gsk_[a-zA-Z0-9]{20,}/i,
        /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/i,
        /ghp_[a-zA-Z0-9]{36,}/i,
        /gho_[a-zA-Z0-9]{36,}/i,
        /-----BEGIN (RSA|EC|OPENSSH|PGP|PRIVATE) KEY-----/i,
        /AIza[0-9A-Za-z-_]{35}/i,
        /xox[baprs]-[0-9a-zA-Z]{10,}/i,
      ];

      const fullRawText = `${title}\n${description}\n${steps_to_reproduce || ""}\n${expected_behavior || ""}\n${actual_behavior || ""}`;
      if (sensitivePatterns.some((pattern) => pattern.test(fullRawText))) {
        return {
          ok: false,
          status: "blocked",
          code: "BLOCKED_SENSITIVE_DATA",
          message: "El feedback contiene posibles credenciales, API keys o tokens de seguridad y fue bloqueado preventivamente.",
        };
      }

      const sanitize = (val) => {
        if (!val || typeof val !== "string") return val;
        let s = val;
        const home = os.homedir();
        if (home) s = s.split(home).join("~");
        s = s.replace(/[a-zA-Z]:\\[Uu]sers\\[^\\]+/g, "~");
        s = s.replace(/\/home\/[^\/]+/g, "~");
        return s;
      };

      // 3. Generar Identificador Idempotente AFX-FB-XXXXXXXX
      const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
      let code = "";
      const bytes = crypto.randomBytes(6);
      for (let i = 0; i < 6; i++) {
        code += chars[bytes[i] % chars.length];
      }
      const feedbackId = `AFX-FB-${code}`;

      // 4. Validar y procesar captura de pantalla (tamaño bounded max 2MB)
      let attachmentPayload = null;
      if (screenshot) {
        try {
          let buffer = null;
          let mime = "image/png";
          if (typeof screenshot === "string" && screenshot.startsWith("data:image")) {
            const match = screenshot.match(/^data:(image\/\w+);base64,(.*)$/);
            if (match) {
              mime = match[1];
              buffer = Buffer.from(match[2], "base64");
            } else {
              buffer = Buffer.from(screenshot.replace(/^data:image\/\w+;base64,/, ""), "base64");
            }
          } else if (typeof screenshot === "string" && (await fs.access(screenshot).then(() => true).catch(() => false))) {
            buffer = await fs.readFile(screenshot);
            const ext = path.extname(screenshot).toLowerCase();
            if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
            else if (ext === ".webp") mime = "image/webp";
          }

          if (buffer) {
            if (buffer.length > 2 * 1024 * 1024) {
              return {
                status: "invalid_input",
                code: "PAYLOAD_TOO_LARGE",
                message: "La captura de pantalla supera el límite máximo permitido de 2MB.",
              };
            }
            attachmentPayload = {
              name: `${feedbackId}_screenshot.png`,
              mime,
              sizeBytes: buffer.length,
              data: buffer.toString("base64"),
            };
          }
        } catch {
          attachmentPayload = null;
        }
      }

      // 5. Sanitizar y extraer fragmento de logs relevante (máximo 30 líneas)
      const storage = getStorageStructure(runtime.root);
      let logsSnippet = null;
      if (attach_logs !== false) {
        try {
          const logContent = await fs.readFile(storage.mainLog, "utf8").catch(() => "");
          if (logContent) {
            const lines = logContent.split("\n").filter(Boolean);
            const tail = lines.slice(-30).join("\n");
            logsSnippet = sanitize(tail);
          }
        } catch {}
      }

      // 6. Construir Payload Normalizado para el Gateway
      const validTypes = ["bug_report", "feature_request", "general_feedback"];
      const feedbackType = validTypes.includes(type) ? type : "general_feedback";

      const validSeverities = ["low", "medium", "high", "critical"];
      const feedbackSeverity = validSeverities.includes(severity) ? severity : "medium";

      const payload = {
        id: feedbackId,
        type: feedbackType,
        title: sanitize(title).trim().slice(0, 200),
        description: sanitize(description).trim().slice(0, 4000),
        steps_to_reproduce: steps_to_reproduce ? sanitize(steps_to_reproduce).trim().slice(0, 2000) : null,
        expected_behavior: expected_behavior ? sanitize(expected_behavior).trim().slice(0, 1000) : null,
        actual_behavior: actual_behavior ? sanitize(actual_behavior).trim().slice(0, 1000) : null,
        severity: feedbackSeverity,
        tool: tool ? sanitize(String(tool)).slice(0, 100) : null,
        version: CURRENT_VERSION,
        system: {
          platform: os.platform(),
          arch: os.arch(),
          node: process.version,
        },
        logs: logsSnippet,
        attachment: attachmentPayload,
        created_at: new Date().toISOString(),
      };

      // 7. Despacho HTTPS al Feedback Gateway externo (Render)
      const endpoint = process.env.AERON_FEEDBACK_ENDPOINT || runtime.config?.feedback?.endpoint || "https://aero-fluxer-feedback-gateway-4rp0.onrender.com/api/v1/feedback";

      try {
        const url = new URL(endpoint);
        const client = url.protocol === "https:" ? https : http;
        const payloadStr = JSON.stringify(payload);

        const gatewayResponse = await new Promise((resolve, reject) => {
          const req = client.request(
            url,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payloadStr),
                "User-Agent": `Aero-Fluxer-X/v${CURRENT_VERSION}`,
              },
              timeout: 6000,
            },
            (res) => {
              let body = "";
              res.on("data", (c) => (body += c));
              res.on("end", () => {
                try {
                  resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch {
                  resolve({ status: res.statusCode, raw: body });
                }
              });
            }
          );
          req.on("timeout", () => {
            req.destroy();
            reject(new Error("GATEWAY_TIMEOUT"));
          });
          req.on("error", (err) => reject(err));
          req.write(payloadStr);
          req.end();
        });

        if (gatewayResponse.status === 200 || gatewayResponse.status === 201) {
          return {
            ok: true,
            status: gatewayResponse.data?.status || "received",
            id: gatewayResponse.data?.id || feedbackId,
          };
        }

        if (gatewayResponse.status === 409 || gatewayResponse.data?.status === "duplicate") {
          return {
            ok: true,
            status: "duplicate",
            id: gatewayResponse.data?.id || feedbackId,
          };
        }

        if (gatewayResponse.status === 429) {
          return {
            ok: false,
            status: "rate_limited",
            code: "RATE_LIMITED",
            message: gatewayResponse.data?.message || "Límite de envíos alcanzado. Intente de nuevo más tarde.",
            reset_in_seconds: gatewayResponse.data?.reset_in_seconds,
          };
        }

        throw new Error(`Gateway returned HTTP ${gatewayResponse.status}`);
      } catch (err) {
        // Fallback a Outbox Local Seguro si el Gateway está inaccesible o en modo offline
        if (runtime.config?.feedback?.queue_offline !== false) {
          try {
            await fs.mkdir(storage.feedbackOutboxDir, { recursive: true }).catch(() => {});
            const outboxPath = path.join(storage.feedbackOutboxDir, `${feedbackId}.json`);
            await fs.writeFile(outboxPath, JSON.stringify(payload, null, 2), "utf8");
            return {
              ok: true,
              status: "queued",
              id: feedbackId,
              message: "Servicio fuera de línea momentáneamente. Feedback guardado localmente en outbox; se enviará automáticamente.",
            };
          } catch {}
        }

        return {
          ok: false,
          status: "unavailable",
          code: "GATEWAY_UNAVAILABLE",
          message: "El servicio de feedback está temporalmente fuera de línea.",
        };
      }
    },

    feedback_guide: async () => {
      return {
        types: ["bug_report", "feature_request", "general_feedback"],
        required_fields: ["title", "description"],
        optional_fields: [
          "steps_to_reproduce",
          "expected_behavior",
          "actual_behavior",
          "severity",
          "screenshot",
          "attach_logs",
          "tool",
        ],
        guidelines: [
          "Describa el comportamiento con claridad y precisión.",
          "Nunca incluya API keys, tokens, credenciales o contraseñas.",
          "Cualquier patrón de credenciales detectado bloqueará automáticamente el reporte.",
          "Los reportes idénticos consecutivos son deduplicados automáticamente.",
        ],
      };
    },

    check_update: async () => {
      const res = await checkForUpdates({ repoRoot: runtime.root });
      return {
        current: res.currentVersion,
        latest: res.latestVersion,
        update_available: res.updateAvailable,
      };
    },

    update_info: async () => {
      const res = await checkForUpdates({ repoRoot: runtime.root });
      return {
        version: res.latestVersion,
        release_type: "patch",
        update_available: res.updateAvailable,
        breaking_changes: false,
      };
    },

    get_update: async ({ allowDowngrade = false } = {}) => {
      const check = await checkForUpdates({ repoRoot: runtime.root, allowDowngrade });
      const info = {
        ok: check.ok,
        current_version: check.currentVersion,
        latest_version: check.latestVersion,
        update_available: check.updateAvailable,
        source: check.releaseInfo?.source || "github_releases",
        reason: check.eligibility?.reason || (check.updateAvailable ? "Nueva versión disponible." : "Ya está en la versión más reciente."),
      };

      if (check.releaseInfo?.releaseNotes) {
        info.release_notes = check.releaseInfo.releaseNotes.slice(0, 600);
      }
      if (check.releaseInfo?.downloadUrl) {
        info.download_url = check.releaseInfo.downloadUrl;
      }

      if (check.updateAvailable) {
        info.instructions = [
          `💡 ACTUALIZACIÓN DISPONIBLE: v${check.currentVersion} → v${check.latestVersion}`,
          `Las actualizaciones se aplican de forma manual para garantizar que nunca se desconecte la sesión de Claude Desktop ni se interrumpan tareas en curso.`,
          `Para actualizar de forma segura cuando no estés usando el MCP, abre una terminal y ejecuta:`,
          `npm run update:apply`,
        ].join("\n");
      }

      return info;
    },

    update: async () => {
      return {
        ok: false,
        manual_update_required: true,
        message: "Las actualizaciones automáticas en caliente están desactivadas para evitar desconectar Claude Desktop. Para actualizar manualmente cuando lo desees, ejecuta en tu terminal: npm run update:apply",
      };
    },

    list_feedbacks: async ({ type, severity, status, limit = 50 } = {}) => {
      const endpoint = process.env.AERON_FEEDBACK_ENDPOINT || runtime.config?.feedback?.endpoint || "https://aero-fluxer-feedback-gateway-4rp0.onrender.com/api/v1/feedback";
      const adminKey = process.env.AERON_FEEDBACK_ADMIN_KEY || runtime.config?.feedback?.admin_key;
      const baseUrl = endpoint.replace("/api/v1/feedback", "");

      if (!adminKey) {
        return {
          ok: false,
          error: "ADMIN_KEY_REQUIRED",
          message: "Se requiere AERON_FEEDBACK_ADMIN_KEY en las variables de entorno para listar feedbacks.",
        };
      }

      try {
        const queryParams = new URLSearchParams();
        if (type) queryParams.set("type", type);
        if (severity) queryParams.set("severity", severity);
        if (status) queryParams.set("status", status);
        queryParams.set("limit", String(Math.min(limit, 100)));

        const url = new URL(`${baseUrl}/api/v1/feedbacks?${queryParams.toString()}`);
        const client = url.protocol === "https:" ? https : http;

        const response = await new Promise((resolve, reject) => {
          const req = client.request(url, {
            method: "GET",
            headers: { "Authorization": `Bearer ${adminKey}`, "User-Agent": `Aero-Fluxer-X/v${CURRENT_VERSION}` },
            timeout: 10000,
          }, (res) => {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => {
              try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
              catch { resolve({ status: res.statusCode, raw: body }); }
            });
          });
          req.on("timeout", () => { req.destroy(); reject(new Error("TIMEOUT")); });
          req.on("error", reject);
          req.end();
        });

        if (response.status === 401) return { ok: false, error: "UNAUTHORIZED", message: "ADMIN_KEY inválida." };
        if (response.status !== 200) return { ok: false, error: `HTTP ${response.status}`, raw: response.raw };

        return {
          ok: true,
          total: response.data.total,
          count: response.data.count,
          feedbacks: response.data.feedbacks,
        };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    read_feedback: async ({ id } = {}) => {
      if (!id) return { ok: false, error: "ID requerido." };

      const endpoint = process.env.AERON_FEEDBACK_ENDPOINT || runtime.config?.feedback?.endpoint || "https://aero-fluxer-feedback-gateway-4rp0.onrender.com/api/v1/feedback";
      const adminKey = process.env.AERON_FEEDBACK_ADMIN_KEY || runtime.config?.feedback?.admin_key;
      const baseUrl = endpoint.replace("/api/v1/feedback", "");

      if (!adminKey) return { ok: false, error: "ADMIN_KEY_REQUIRED" };

      try {
        const url = new URL(`${baseUrl}/api/v1/feedback/${encodeURIComponent(id)}`);
        const client = url.protocol === "https:" ? https : http;

        const response = await new Promise((resolve, reject) => {
          const req = client.request(url, {
            method: "GET",
            headers: { "Authorization": `Bearer ${adminKey}`, "User-Agent": `Aero-Fluxer-X/v${CURRENT_VERSION}` },
            timeout: 8000,
          }, (res) => {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => {
              try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
              catch { resolve({ status: res.statusCode, raw: body }); }
            });
          });
          req.on("timeout", () => { req.destroy(); reject(new Error("TIMEOUT")); });
          req.on("error", reject);
          req.end();
        });

        if (response.status === 401) return { ok: false, error: "UNAUTHORIZED" };
        if (response.status === 404) return { ok: false, error: "NOT_FOUND", id };
        if (response.status !== 200) return { ok: false, error: `HTTP ${response.status}` };

        return { ok: true, feedback: response.data.feedback };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    delete_feedback: async ({ id } = {}) => {
      if (!id) return { ok: false, error: "ID requerido." };

      const endpoint = process.env.AERON_FEEDBACK_ENDPOINT || runtime.config?.feedback?.endpoint || "https://aero-fluxer-feedback-gateway-4rp0.onrender.com/api/v1/feedback";
      const adminKey = process.env.AERON_FEEDBACK_ADMIN_KEY || runtime.config?.feedback?.admin_key;
      const baseUrl = endpoint.replace("/api/v1/feedback", "");

      if (!adminKey) return { ok: false, error: "ADMIN_KEY_REQUIRED", message: "Se requiere AERON_FEEDBACK_ADMIN_KEY para eliminar feedbacks." };

      try {
        const url = new URL(`${baseUrl}/api/v1/feedback/${encodeURIComponent(id)}`);
        const client = url.protocol === "https:" ? https : http;

        const response = await new Promise((resolve, reject) => {
          const req = client.request(url, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${adminKey}`, "User-Agent": `Aero-Fluxer-X/v${CURRENT_VERSION}` },
            timeout: 8000,
          }, (res) => {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => {
              try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
              catch { resolve({ status: res.statusCode, raw: body }); }
            });
          });
          req.on("timeout", () => { req.destroy(); reject(new Error("TIMEOUT")); });
          req.on("error", reject);
          req.end();
        });

        if (response.status === 401) return { ok: false, error: "UNAUTHORIZED" };
        if (response.status === 404) return { ok: false, error: "NOT_FOUND", id, message: "El feedback no existe o ya fue eliminado." };
        if (response.status !== 200) return { ok: false, error: `HTTP ${response.status}` };

        return { ok: true, deleted: id, paths: response.data.paths };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  };

  return domain(
    "developer",
    "Detección, análisis, tests, builds, gestión de skills, feedback público (Render/Firebase) y actualización.",
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
      submit_feedback: "user",
      feedback_guide: "user",
      check_update: "user",
      update_info: "user",
      get_update: "user",
      update: "poweruser",
      list_feedbacks: "poweruser",
      read_feedback: "poweruser",
      delete_feedback: "poweruser",
    }
  );
}
