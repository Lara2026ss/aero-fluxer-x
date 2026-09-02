import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";
import { Router } from "../core/router.mjs";

async function main() {
  console.log("🧪 [TEST: Markdown & Skill Support in Aeron Fluxer X]");

  const tmpDir = path.join(os.tmpdir(), `aeron_skills_test_${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const runtime = await createRuntime({
    root: tmpDir,
    version: "9.0.0",
    brand: "aeron-fluxer-x",
  });
  const registry = new Registry(runtime);
  await registry.load();
  const router = new Router({ runtime, registry });

  try {
    // ── TEST 1: files.create_document con formato .md y frontmatter ──────────
    console.log("  → 1. files.create_document (.md con frontmatter y secciones)");
    const docPath = path.join(tmpDir, "docs", "sample-guide.md");
    const docRes = await router.execute({
      tool: "files",
      action: "create_document",
      args: {
        path: docPath,
        format: "md",
        frontmatter: {
          name: "sample-guide",
          version: "1.0.0",
          author: "Aeron AI",
          tags: ["docs", "tutorial"],
        },
        title: "Sample Guide",
        paragraphs: [
          { heading: "Getting Started", level: 2, content: "This is step 1 of the guide." },
          { heading: "Advanced Tips", level: 2, content: "Here are advanced tips." },
        ],
      },
    });

    assert.equal(docRes.ok, true, `create_document .md failed: ${docRes.error}`);
    assert.equal(docRes.format, "md");

    // ── TEST 2: files.read_document con formato .md ──────────────────────────
    console.log("  → 2. files.read_document (.md parsing de frontmatter)");
    const readDocRes = await router.execute({
      tool: "files",
      action: "read_document",
      args: { path: docPath },
    });

    assert.equal(readDocRes.ok, true);
    assert.equal(readDocRes.format, "md");
    assert.equal(readDocRes.frontmatter?.name, "sample-guide");
    assert.ok(readDocRes.content.includes("Getting Started"));

    // ── TEST 3: files.create_document y read_document con formato .txt ────────
    console.log("  → 3. files.create_document y read_document (.txt)");
    const txtPath = path.join(tmpDir, "notes.txt");
    const txtRes = await router.execute({
      tool: "files",
      action: "create_document",
      args: {
        path: txtPath,
        format: "txt",
        title: "Meeting Notes",
        paragraphs: ["Note 1: Architecture review completed.", "Note 2: Tests passed."],
      },
    });
    assert.equal(txtRes.ok, true);

    const readTxtRes = await router.execute({
      tool: "files",
      action: "read_document",
      args: { path: txtPath },
    });
    assert.equal(readTxtRes.ok, true);
    assert.equal(readTxtRes.format, "txt");
    assert.ok(readTxtRes.content.includes("Meeting Notes"));

    // ── TEST 4: developer.create_skill ───────────────────────────────────────
    console.log("  → 4. developer.create_skill (SKILL.md con YAML frontmatter y subrecursos)");
    const skillPath = path.join(tmpDir, "skills", "code-refactor");
    const createSkillRes = await router.execute({
      tool: "developer",
      action: "create_skill",
      args: {
        name: "code-refactor",
        description: "Professional code refactoring and modernization skill for AI agents.",
        instructions: "Always analyze dependencies before modifying code. Run full tests after any change.",
        path: skillPath,
        rules: [
          "Preserve all public interfaces unless explicit deprecation is approved.",
          "Keep functions small with single responsibility.",
        ],
        examples: [
          { filename: "example_before_after.md", content: "# Refactor Example\nBefore vs After diff." },
        ],
        references: [
          { filename: "patterns.md", content: "# Clean Code Patterns" },
        ],
        scripts: [
          { filename: "check.js", content: "console.log('Validating refactor');" },
        ],
      },
    });

    assert.equal(createSkillRes.ok, true, `create_skill failed: ${createSkillRes.error}`);
    assert.equal(createSkillRes.skillName, "code-refactor");
    assert.ok(createSkillRes.resourcesCreated.includes("examples/example_before_after.md"));
    assert.ok(createSkillRes.resourcesCreated.includes("references/patterns.md"));
    assert.ok(createSkillRes.resourcesCreated.includes("scripts/check.js"));

    // ── TEST 5: developer.validate_skill ─────────────────────────────────────
    console.log("  → 5. developer.validate_skill (Validación estricta de YAML frontmatter)");
    const validateRes = await router.execute({
      tool: "developer",
      action: "validate_skill",
      args: { path: skillPath },
    });

    assert.equal(validateRes.ok, true);
    assert.equal(validateRes.valid, true);
    assert.equal(validateRes.metadata.name, "code-refactor");
    assert.equal(validateRes.errors.length, 0);

    // ── TEST 6: developer.get_skill ──────────────────────────────────────────
    console.log("  → 6. developer.get_skill (Inspección detallada de skill)");
    const getSkillRes = await router.execute({
      tool: "developer",
      action: "get_skill",
      args: { path: skillPath },
    });

    assert.equal(getSkillRes.ok, true);
    assert.equal(getSkillRes.metadata.name, "code-refactor");
    assert.ok(getSkillRes.instructions.includes("Always analyze dependencies"));
    assert.ok(getSkillRes.subResources.examples.includes("example_before_after.md"));

    // ── TEST 7: developer.list_skills ────────────────────────────────────────
    console.log("  → 7. developer.list_skills (Descubrimiento automático)");
    const listSkillsRes = await router.execute({
      tool: "developer",
      action: "list_skills",
      args: { path: tmpDir, searchGlobal: false },
    });

    assert.equal(listSkillsRes.ok, true);
    assert.ok(listSkillsRes.count >= 1);
    assert.ok(listSkillsRes.skills.some((s) => s.name === "code-refactor"));

    console.log("\n✅ ALL MARKDOWN & SKILL TESTS PASSED SUCCESSFULLY!");
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
