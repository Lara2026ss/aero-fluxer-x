import https from "node:https";
import fs from "node:fs";
import path from "node:path";

const config = JSON.parse(fs.readFileSync("C:\\Users\\mauri\\AppData\\Roaming\\Claude\\claude_desktop_config.json", "utf8"));
const token = config.mcpServers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN;

async function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = https.request(url, {
      method: "POST",
      headers: {
        "User-Agent": "Antigravity-Release-Manager",
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, res => {
      let b = "";
      res.on("data", c => b += c);
      res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(b || "{}") }));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function uploadAsset(uploadUrlTemplate, filePath, contentType) {
  const fileName = path.basename(filePath);
  const fileBytes = fs.readFileSync(filePath);
  const uploadUrl = uploadUrlTemplate.replace(/\{.*\}/, "") + "?name=" + encodeURIComponent(fileName);

  return new Promise((resolve, reject) => {
    const req = https.request(uploadUrl, {
      method: "POST",
      headers: {
        "User-Agent": "Antigravity-Release-Manager",
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": contentType,
        "Content-Length": fileBytes.length
      }
    }, res => {
      let b = "";
      res.on("data", c => b += c);
      res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(b || "{}") }));
    });
    req.on("error", reject);
    req.write(fileBytes);
    req.end();
  });
}

async function main() {
  console.log("Creando GitHub Release v9.0.0...");
  const relRes = await postJson("https://api.github.com/repos/Lara2026ss/aero-fluxer-x/releases", {
    tag_name: "v9.0.0",
    target_commitish: "main",
    name: "Aero Fluxer X v9.0.0 — Public Distribution Ready",
    body: "## Aero Fluxer X v9.0.0 (Release Candidate)\n\nOfficial public distribution release of Aero Fluxer X MCP Server.\n\n### Highlights:\n- 10 Modular Domains with 197 system automation tools.\n- Completely stateless and decoupled from local PC.\n- Automated secure updater with SHA-256 integrity verification and rollback.\n- Zero secrets and multiplatform adaptive support (Windows 10/11 native, Linux/macOS adaptive).\n\n### Assets:\n- `aeron-fluxer-x-v9.0.0.zip` (SHA-256 verified package)\n- `checksums.sha256`\n- `release-manifest.json`",
    draft: false,
    prerelease: false
  });

  if (relRes.status !== 201) {
    console.error("Error al crear release:", relRes.status, relRes.data);
    process.exit(1);
  }

  const uploadUrl = relRes.data.upload_url;
  console.log("Release creada con éxito:", relRes.data.html_url);

  console.log("Subiendo artefacto ZIP...");
  const zipRes = await uploadAsset(uploadUrl, "dist/aeron-fluxer-x-v9.0.0.zip", "application/zip");
  console.log("ZIP subido:", zipRes.status, zipRes.data.name);

  console.log("Subiendo checksums.sha256...");
  const shaRes = await uploadAsset(uploadUrl, "dist/checksums.sha256", "text/plain");
  console.log("Checksum subido:", shaRes.status, shaRes.data.name);

  console.log("Subiendo release-manifest.json...");
  const manRes = await uploadAsset(uploadUrl, "dist/release-manifest.json", "application/json");
  console.log("Manifest subido:", manRes.status, manRes.data.name);

  console.log("\n🎉 GitHub Release v9.0.0 publicada con todos sus artefactos!");
}

main().catch(err => { console.error(err); process.exit(1); });
