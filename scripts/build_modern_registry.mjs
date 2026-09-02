import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGET_FILE = path.join(ROOT, "core", "registry.mjs");

async function main() {
  const exists = await fs.access(TARGET_FILE).then(() => true).catch(() => false);
  if (!exists) {
    console.error("Registry target file not found:", TARGET_FILE);
    process.exit(1);
  }
  const content = await fs.readFile(TARGET_FILE, "utf8");
  console.log(`[Registry Builder] Target file verified: ${TARGET_FILE} (${(content.length / 1024).toFixed(1)} KB, ${content.split("\n").length} lines).`);
}

main().catch(console.error);
