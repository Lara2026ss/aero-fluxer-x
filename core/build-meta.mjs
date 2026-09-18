import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

function stableHash(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

export async function loadBuildMeta(root) {
  const releaseFile = path.join(root, "release.json");
  const release = await readJson(releaseFile, {
    name: "FLUXER",
    version: "4.0.0",
    build: 1,
    channel: "stable",
    releasedAt: new Date().toISOString().slice(0, 10),
    files: [],
  });
  return { file: releaseFile, release };
}

export async function maybeIncrementBuild(root, fingerprintSources = []) {
  const { file, release } = await loadBuildMeta(root);
  const fingerprint = stableHash(JSON.stringify(fingerprintSources));
  const changed = release.fingerprint !== fingerprint;
  if (!changed) return { changed: false, release };

  const next = {
    ...release,
    name: "FLUXER",
    legacyName: undefined,
    build: Number(release.build || 0) + 1,
    fingerprint,
    releasedAt: new Date().toISOString().slice(0, 10),
  };
  await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return { changed: true, release: next };
}
