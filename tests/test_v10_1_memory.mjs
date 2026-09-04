import assert from "node:assert";
import path from "node:path";
import os from "node:os";
import { MemoryStore, redactSecrets } from "../core/memory.mjs";
import { createDatabaseDomain } from "../tools/database.mjs";

async function runTests() {
  console.log("=== Test Suite: v10.1 Memory & SQLite FTS5 ===");

  // 1. redactSecrets unit tests
  console.log("-> 1. redactSecrets token and password redaction...");
  const textWithGh = "Mi token es ghp_123456789012345678901234567890123456 para git.";
  const redactedGh = redactSecrets(textWithGh);
  assert.ok(!redactedGh.includes("123456789012345678901234567890123456"));
  assert.ok(redactedGh.includes("ghp_[REDACTED]"));

  const textWithSecret = 'Config: api_key: "super_secret_token_12345678"';
  const redactedSecret = redactSecrets(textWithSecret);
  assert.ok(!redactedSecret.includes("super_secret_token_12345678"));
  assert.ok(redactedSecret.includes("[REDACTED]"));

  // 2. MemoryStore with FTS5
  console.log("-> 2. MemoryStore with SQLite FTS5 table & triggers...");
  const tempDb = path.join(os.tmpdir(), "fluxer_test_notes_" + Date.now() + ".db");
  const store = new MemoryStore({ file: tempDb, legacyFile: null });
  await store.load();

  // Remember normal note
  const n1 = store.rememberNote({
    title: "Arquitectura Fluxer v10.1",
    content: "Optimización de pipeline con OperationEngine y validación empírica.",
    tags: ["core", "arquitectura"],
    category: "architecture"
  });
  assert.strictEqual(n1.redacted, false);
  assert.strictEqual(n1.title, "Arquitectura Fluxer v10.1");

  // Remember note containing sensitive secret
  const n2 = store.rememberNote({
    title: "Credenciales de servicio",
    content: "Usar token ghp_abcdefghijklmnopqrstuvwxyz1234567890 para el bot.",
    tags: ["security"],
    category: "credentials"
  });
  assert.strictEqual(n2.redacted, true);
  assert.ok(!n2.content.includes("abcdefghijklmnopqrstuvwxyz"));
  assert.ok(n2.content.includes("ghp_[REDACTED]"));

  // Search via FTS5
  console.log("-> 3. Searching notes using FTS5 MATCH...");
  const search1 = store.searchNotes({ query: "OperationEngine" });
  assert.strictEqual(search1.length, 1);
  assert.strictEqual(search1[0].title, "Arquitectura Fluxer v10.1");

  const search2 = store.searchNotes({ query: "REDACTED" });
  assert.strictEqual(search2.length, 1);
  assert.strictEqual(search2[0].title, "Credenciales de servicio");

  // 3. Database domain integration
  console.log("-> 4. Testing database domain tools (remember_note, search_notes)...");
  const fakeRuntime = {
    memory: store,
    hp: (p) => p
  };
  const dbDomain = createDatabaseDomain({
    runtime: fakeRuntime,
    path,
    fs: await import("node:fs/promises"),
    domain: (name, desc, actions, permissions) => ({ name, actions, permissions }),
    splitLines: (v) => String(v).split("\n")
  });

  const domRem = await dbDomain.actions.remember_note({
    title: "Test Domain Note",
    content: "Contenido de prueba para tool database.remember_note",
    tags: ["domain-test"]
  });
  assert.strictEqual(domRem.ok, true);

  const domSearch = await dbDomain.actions.search_notes({ query: "Domain" });
  assert.strictEqual(domSearch.ok, true);
  assert.ok(domSearch.count >= 1);

  // Cleanup
  store.db?.close();
  const fs = await import("node:fs/promises");
  await fs.unlink(tempDb).catch(() => {});

  console.log("=== PASS: v10.1 Memory & SQLite FTS5 ===");
}

runTests().catch(err => {
  console.error("Test falló:", err);
  process.exit(1);
});
