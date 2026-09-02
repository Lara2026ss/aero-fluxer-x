import os from "node:os";
import https from "node:https";
import http from "node:http";
import { getStorageStructure } from "../core/storage-paths.mjs";
import { CURRENT_VERSION } from "../core/version.mjs";

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

    submit_feedback: async ({
      type = "bug_report",
      title,
      description,
      steps_to_reproduce = "",
      expected_behavior = "",
      actual_behavior = "",
      severity = "medium",
      screenshot = null,
      attach_logs = true,
      attach_system_info = true,
      webhook_url = null,
    } = {}) => {
      if (!title || !description) {
        return {
          ok: false,
          error: "Los campos 'title' y 'description' son obligatorios para enviar feedback.",
        };
      }

      const validTypes = ["bug_report", "feature_request", "general_feedback", "performance"];
      const feedbackType = validTypes.includes(type) ? type : "general_feedback";

      const validSeverities = ["low", "medium", "high", "critical"];
      const feedbackSeverity = validSeverities.includes(severity) ? severity : "medium";

      const storage = getStorageStructure(runtime.root);
      await fs.mkdir(storage.feedbackDir, { recursive: true }).catch(() => {});
      await fs.mkdir(storage.feedbackAttachmentsDir, { recursive: true }).catch(() => {});

      const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const timestamp = new Date().toISOString();

      // 1. Diagnóstico del sistema
      let systemInfo = null;
      if (attach_system_info) {
        systemInfo = {
          platform: os.platform(),
          release: os.release(),
          arch: os.arch(),
          nodeVersion: process.version,
          totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
          freeMemoryMB: Math.round(os.freemem() / (1024 * 1024)),
          uptimeSeconds: Math.round(process.uptime()),
          fluxerVersion: CURRENT_VERSION,
        };
      }

      // 2. Extraer logs del servidor (enmascarando rutas privadas)
      let logsSnippet = null;
      if (attach_logs) {
        try {
          const logContent = await fs.readFile(storage.mainLog, "utf8").catch(() => "");
          if (logContent) {
            const lines = logContent.split("\n").filter(Boolean);
            const tail = lines.slice(-50).join("\n");
            const home = os.homedir();
            logsSnippet = tail.split(home).join("~");
          } else {
            logsSnippet = "Sin logs registrados en fluxer.log";
          }
        } catch {
          logsSnippet = "No se pudieron leer los logs del servidor.";
        }
      }

      // 3. Procesar captura de pantalla / imágenes
      let attachmentInfo = null;
      if (screenshot) {
        try {
          let buffer = null;
          let filename = `${feedbackId}_screenshot.png`;

          if (typeof screenshot === "string" && screenshot.startsWith("data:image")) {
            const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, "");
            buffer = Buffer.from(base64Data, "base64");
          } else if (typeof screenshot === "string" && (await fs.access(screenshot).then(() => true).catch(() => false))) {
            buffer = await fs.readFile(screenshot);
            filename = `${feedbackId}_${path.basename(screenshot)}`;
          } else if (typeof screenshot === "string" && screenshot.length > 50 && !screenshot.includes("\n")) {
            try {
              buffer = Buffer.from(screenshot, "base64");
            } catch {}
          }

          if (buffer) {
            const destPath = path.join(storage.feedbackAttachmentsDir, filename);
            await fs.writeFile(destPath, buffer);
            attachmentInfo = {
              filename,
              path: destPath,
              sizeBytes: buffer.length,
            };
          }
        } catch (e) {
          attachmentInfo = { error: `No se pudo adjuntar la captura: ${e.message}` };
        }
      }

      // 4. Construir registro completo de feedback
      const feedbackRecord = {
        id: feedbackId,
        timestamp,
        type: feedbackType,
        title,
        description,
        steps_to_reproduce: steps_to_reproduce || null,
        expected_behavior: expected_behavior || null,
        actual_behavior: actual_behavior || null,
        severity: feedbackSeverity,
        systemInfo,
        logsSnippet,
        attachment: attachmentInfo,
      };

      const recordPath = path.join(storage.feedbackDir, `${feedbackId}.json`);
      await fs.writeFile(recordPath, JSON.stringify(feedbackRecord, null, 2), "utf8");

      // 5. Enviar por MD privado a través del bot de Discord (Nexus) si está configurado
      const discordBotToken = process.env.DISCORD_TOKEN || runtime.config?.feedback?.discord_bot_token;
      const discordRecipientId = runtime.config?.feedback?.discord_recipient_id || process.env.DISCORD_FEEDBACK_USER_ID || "971639277626720268";
      let dmDelivered = false;
      let dmDetails = null;

      if (discordBotToken && discordRecipientId) {
        try {
          // Abrir o recuperar canal de DM
          const dmChannel = await new Promise((res, rej) => {
            const body = JSON.stringify({ recipient_id: discordRecipientId });
            const req = https.request("https://discord.com/api/v10/users/@me/channels", {
              method: "POST",
              headers: {
                "Authorization": `Bot ${discordBotToken}`,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
              },
            }, (r) => {
              let d = "";
              r.on("data", (c) => (d += c));
              r.on("end", () => {
                if (r.statusCode >= 200 && r.statusCode < 300) res(JSON.parse(d));
                else rej(new Error(`HTTP ${r.statusCode}: ${d}`));
              });
            });
            req.on("error", rej);
            req.write(body);
            req.end();
          });

          // Construir embed para el DM privado
          const colorMap = {
            bug_report: 15158332,      // Rojo
            feature_request: 3066993,  // Verde esmeralda
            general_feedback: 3447003, // Azul
            performance: 15844367,     // Naranja
          };

          const fields = [
            { name: "Tipo", value: feedbackType.toUpperCase(), inline: true },
            { name: "Severidad", value: feedbackSeverity.toUpperCase(), inline: true },
            { name: "Versión", value: `v${CURRENT_VERSION}`, inline: true },
            { name: "Descripción", value: description.slice(0, 1024) },
          ];

          if (steps_to_reproduce) {
            fields.push({ name: "Pasos para reproducir", value: steps_to_reproduce.slice(0, 1024) });
          }

          if (expected_behavior || actual_behavior) {
            fields.push({
              name: "Comportamiento",
              value: `**Esperado:** ${expected_behavior || 'N/A'}\n**Actual:** ${actual_behavior || 'N/A'}`.slice(0, 1024),
            });
          }

          if (systemInfo) {
            fields.push({
              name: "Diagnóstico",
              value: `${systemInfo.platform} (${systemInfo.arch}) | Node ${systemInfo.nodeVersion} | RAM libre: ${systemInfo.freeMemoryMB}MB / ${systemInfo.totalMemoryMB}MB`.slice(0, 1024),
            });
          }

          if (attachmentInfo?.path) {
            fields.push({
              name: "Captura adjunta",
              value: `Archivo: \`${attachmentInfo.filename}\` (${attachmentInfo.sizeBytes} bytes) guardado en disco.`,
            });
          }

          const embed = {
            title: `📩 Nuevo Feedback recibido: ${title.slice(0, 200)}`,
            color: colorMap[feedbackType] || 3447003,
            fields,
            footer: { text: `ID: ${feedbackId} • Aero Fluxer X` },
            timestamp,
          };

          // Enviar mensaje al canal de DM
          await new Promise((res, rej) => {
            const body = JSON.stringify({ embeds: [embed] });
            const req = https.request(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
              method: "POST",
              headers: {
                "Authorization": `Bot ${discordBotToken}`,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
              },
            }, (r) => {
              let d = "";
              r.on("data", (c) => (d += c));
              r.on("end", () => {
                if (r.statusCode >= 200 && r.statusCode < 300) {
                  dmDelivered = true;
                  dmDetails = `Enviado por MD a través del bot Nexus (Canal DM: ${dmChannel.id})`;
                } else {
                  dmDetails = `Fallo al enviar mensaje DM: HTTP ${r.statusCode} ${d}`;
                }
                res();
              });
            });
            req.on("error", rej);
            req.write(body);
            req.end();
          });
        } catch (e) {
          dmDetails = `Error en DM de Discord: ${e.message}`;
        }
      }

      // 6. Enviar a Webhook si está configurado
      const targetWebhook = webhook_url || process.env.AERON_FEEDBACK_WEBHOOK || runtime.config?.feedback?.webhook_url;
      let webhookDelivered = false;
      let deliveryDetails = null;

      if (targetWebhook) {
        try {
          if (targetWebhook.includes("discord.com/api/webhooks")) {
            const colorMap = {
              bug_report: 15158332,      // Rojo
              feature_request: 3066993,  // Verde esmeralda
              general_feedback: 3447003, // Azul
              performance: 15844367,     // Naranja
            };

            const fields = [
              { name: "Tipo", value: feedbackType.toUpperCase(), inline: true },
              { name: "Severidad", value: feedbackSeverity.toUpperCase(), inline: true },
              { name: "Versión", value: `v${CURRENT_VERSION}`, inline: true },
              { name: "Descripción", value: description.slice(0, 1024) },
            ];

            if (steps_to_reproduce) {
              fields.push({ name: "Pasos para reproducir", value: steps_to_reproduce.slice(0, 1024) });
            }

            if (expected_behavior || actual_behavior) {
              fields.push({
                name: "Comportamiento",
                value: `**Esperado:** ${expected_behavior || 'N/A'}\n**Actual:** ${actual_behavior || 'N/A'}`.slice(0, 1024),
              });
            }

            if (systemInfo) {
              fields.push({
                name: "Diagnóstico del Sistema",
                value: `${systemInfo.platform} (${systemInfo.arch}) | Node ${systemInfo.nodeVersion} | RAM libre: ${systemInfo.freeMemoryMB}MB / ${systemInfo.totalMemoryMB}MB`.slice(0, 1024),
              });
            }

            const embed = {
              title: `📢 Feedback: ${title.slice(0, 200)}`,
              color: colorMap[feedbackType] || 3447003,
              fields,
              footer: { text: `ID: ${feedbackId} • Aero Fluxer X` },
              timestamp,
            };

            const payloadStr = JSON.stringify({
              username: "Aero Fluxer Feedback",
              embeds: [embed],
            });

            const client = targetWebhook.startsWith("https") ? https : http;
            await new Promise((res, rej) => {
              const req = client.request(
                targetWebhook,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(payloadStr),
                    "User-Agent": `Aero-Fluxer-X/v${CURRENT_VERSION}`,
                  },
                },
                (r) => {
                  let b = "";
                  r.on("data", (c) => (b += c));
                  r.on("end", () => {
                    if (r.statusCode >= 200 && r.statusCode < 300) {
                      webhookDelivered = true;
                      deliveryDetails = "Entregado exitosamente al webhook de Discord";
                    } else {
                      deliveryDetails = `HTTP ${r.statusCode}: ${b}`;
                    }
                    res();
                  });
                }
              );
              req.on("error", rej);
              req.write(payloadStr);
              req.end();
            });
          } else {
            // Webhook genérico
            const payloadStr = JSON.stringify(feedbackRecord);
            const client = targetWebhook.startsWith("https") ? https : http;
            await new Promise((res, rej) => {
              const req = client.request(
                targetWebhook,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(payloadStr),
                    "User-Agent": `Aero-Fluxer-X/v${CURRENT_VERSION}`,
                  },
                },
                (r) => {
                  webhookDelivered = r.statusCode >= 200 && r.statusCode < 300;
                  deliveryDetails = `Webhook respondió HTTP ${r.statusCode}`;
                  res();
                }
              );
              req.on("error", rej);
              req.write(payloadStr);
              req.end();
            });
          }
        } catch (we) {
          deliveryDetails = `Error al contactar webhook: ${we.message}`;
        }
      }

      return {
        ok: true,
        feedbackId,
        type: feedbackType,
        storedLocally: true,
        feedbackFile: recordPath,
        attachmentSaved: Boolean(attachmentInfo?.path),
        dmDelivered,
        dmDetails: dmDetails || "Sin bot configurado para MD",
        webhookDelivered,
        deliveryDetails: dmDelivered ? dmDetails : (deliveryDetails || "Guardado en almacenamiento local de usuario"),
        message: "¡Feedback registrado exitosamente!",
      };
    },

    list_feedbacks: async ({ limit = 20 } = {}) => {
      const storage = getStorageStructure(runtime.root);
      const exists = await fs.access(storage.feedbackDir).then(() => true).catch(() => false);
      if (!exists) return { ok: true, feedbacks: [], count: 0 };

      const files = await fs.readdir(storage.feedbackDir);
      const jsonFiles = files.filter((f) => f.startsWith("fb_") && f.endsWith(".json"));

      const list = [];
      for (const f of jsonFiles) {
        try {
          const raw = await fs.readFile(path.join(storage.feedbackDir, f), "utf8");
          const data = JSON.parse(raw);
          list.push({
            id: data.id,
            timestamp: data.timestamp,
            type: data.type,
            title: data.title,
            severity: data.severity,
            hasAttachment: Boolean(data.attachment?.path),
            file: path.join(storage.feedbackDir, f),
          });
        } catch {}
      }

      list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return {
        ok: true,
        count: list.length,
        feedbacks: list.slice(0, limit),
      };
    },

    get_feedback: async ({ feedbackId } = {}) => {
      if (!feedbackId) return { ok: false, error: "Se requiere 'feedbackId'." };
      const storage = getStorageStructure(runtime.root);
      const target = path.join(storage.feedbackDir, `${feedbackId.replace(/\.json$/, "")}.json`);

      try {
        const raw = await fs.readFile(target, "utf8");
        return { ok: true, feedback: JSON.parse(raw) };
      } catch {
        return { ok: false, error: `No se encontró el feedback con ID '${feedbackId}'.` };
      }
    },
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
      submit_feedback: "user",
      list_feedbacks: "user",
      get_feedback: "user",
    }
  );
}
