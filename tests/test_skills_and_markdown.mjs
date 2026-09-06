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

    // ── TEST 8: developer.create_skill (compact mode) ─────────────────────────
    console.log("  → 8. developer.create_skill con 'compact: true' (Ahorro masivo de tokens)");
    const compactSkillPath = path.join(tmpDir, "skills", "compact-helper");
    const createCompactRes = await router.execute({
      tool: "developer",
      action: "create_skill",
      args: {
        name: "compact-helper",
        description: "A lightweight helper skill designed to run with minimal token footprint.",
        instructions: "Do small tasks quickly and return succinct responses.",
        path: compactSkillPath,
        compact: true,
      },
    });

    assert.equal(createCompactRes.ok, true);
    assert.equal(createCompactRes.compact, true, "create_skill debe retornar compact: true");
    assert.equal(createCompactRes.skillName, "compact-helper");
    assert.ok(createCompactRes.skillFile !== undefined, "debe retornar skillFile");
    assert.strictEqual(createCompactRes.sizeBytes, undefined, "compact NO debe incluir sizeBytes");
    assert.strictEqual(createCompactRes.linesCount, undefined, "compact NO debe incluir linesCount");
    assert.strictEqual(createCompactRes.resourcesCreated, undefined, "compact NO debe incluir resourcesCreated");
    assert.strictEqual(createCompactRes.skillDirectory, undefined, "compact NO debe incluir skillDirectory");

    // ── TEST 9: developer.edit_skill (compact mode) ───────────────────────────
    console.log("  → 9. developer.edit_skill con 'compact: true'");
    const editCompactRes = await router.execute({
      tool: "developer",
      action: "edit_skill",
      args: {
        name: "compact-helper",
        path: compactSkillPath,
        description: "Updated description for compact helper skill.",
        compact: true,
      },
    });

    assert.equal(editCompactRes.ok, true);
    assert.equal(editCompactRes.compact, true, "edit_skill debe retornar compact: true");
    assert.equal(editCompactRes.skillName, "compact-helper");
    assert.strictEqual(editCompactRes.sizeBytes, undefined, "edit_skill compact NO debe incluir sizeBytes");

    // ── TEST 10: developer.get_skill (compact mode) ───────────────────────────
    console.log("  → 10. developer.get_skill con 'compact: true' (Sin volcar instrucciones completas)");
    const getCompactRes = await router.execute({
      tool: "developer",
      action: "get_skill",
      args: { path: compactSkillPath, compact: true },
    });

    assert.equal(getCompactRes.ok, true);
    assert.equal(getCompactRes.compact, true, "get_skill debe retornar compact: true");
    assert.equal(getCompactRes.name, "compact-helper");
    assert.strictEqual(getCompactRes.instructions, undefined, "get_skill compact NO debe incluir instructions completas");
    assert.ok(typeof getCompactRes.instructionsSummary === "string", "debe incluir instructionsSummary");
    assert.ok(typeof getCompactRes.instructionsLinesCount === "number", "debe incluir instructionsLinesCount");

    // ── TEST 11: developer.list_skills (compact mode) ─────────────────────────
    console.log("  → 11. developer.list_skills con 'compact: true' (Solo nombres y descripciones breves)");
    const listCompactRes = await router.execute({
      tool: "developer",
      action: "list_skills",
      args: { path: tmpDir, searchGlobal: false, compact: true },
    });

    assert.equal(listCompactRes.ok, true);
    assert.equal(listCompactRes.compact, true, "list_skills debe retornar compact: true");
    assert.ok(listCompactRes.count >= 2);
    assert.strictEqual(listCompactRes.directories_scanned, undefined, "compact NO debe incluir directories_scanned");
    assert.strictEqual(listCompactRes.scope, undefined, "compact NO debe incluir scope");
    const foundCompactHelper = listCompactRes.skills.find((s) => s.name === "compact-helper");
    assert.ok(foundCompactHelper, "debe encontrar compact-helper");
    assert.strictEqual(foundCompactHelper.file, undefined, "cada skill en compact NO debe incluir ruta 'file'");
    assert.strictEqual(foundCompactHelper.directory, undefined, "cada skill en compact NO debe incluir 'directory'");

    // ── TEST 12: developer.validate_skill (compact mode) ──────────────────────
    console.log("  → 12. developer.validate_skill con 'compact: true'");
    const validateCompactRes = await router.execute({
      tool: "developer",
      action: "validate_skill",
      args: { path: compactSkillPath, compact: true },
    });

    assert.equal(validateCompactRes.ok, true);
    assert.equal(validateCompactRes.compact, true);
    assert.equal(validateCompactRes.valid, true);
    assert.equal(validateCompactRes.name, "compact-helper");
    assert.strictEqual(validateCompactRes.skillFile, undefined);
    assert.strictEqual(validateCompactRes.metadata, undefined);

    // ── TEST 13: developer.delete_skill (compact mode) ────────────────────────
    console.log("  → 13. developer.delete_skill con 'compact: true'");
    const deleteCompactRes = await router.execute({
      tool: "developer",
      action: "delete_skill",
      args: { name: "compact-helper", path: compactSkillPath, compact: true },
    });

    assert.equal(deleteCompactRes.ok, true);
    assert.equal(deleteCompactRes.compact, true);
    assert.equal(deleteCompactRes.deleted, true);
    assert.equal(deleteCompactRes.name, "compact-helper");
    assert.strictEqual(deleteCompactRes.directory, undefined);
    assert.strictEqual(deleteCompactRes.message, undefined);

    console.log("\n✅ ALL MARKDOWN & SKILL TESTS (STANDARD + COMPACT) PASSED SUCCESSFULLY!");
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
