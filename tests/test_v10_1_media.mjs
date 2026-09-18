import assert from "node:assert";
import path from "node:path";
import os from "node:os";
import { createFilesDomain } from "../tools/files.mjs";
import { VerificationEngine } from "../core/verification.mjs";

async function runTests() {
  console.log("=== Test Suite: v10.1 Media Tooling ===");

  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);
  const fs = await import("node:fs/promises");

  const fakeRuntime = {
    root: process.cwd(),
    run: async (cmd) => {
      try {
        const { stdout, stderr } = await execAsync(cmd, { windowsHide: true });
        return { ok: true, stdout, stderr };
      } catch (e) {
        return { ok: false, stdout: e.stdout || "", stderr: e.stderr || e.message };
      }
    }
  };

  const filesDomain = createFilesDomain({
    runtime: fakeRuntime,
    path,
    fs,
    crypto: await import("node:crypto"),
    domain: (name, desc, actions, permissions) => ({ name, actions, permissions }),
    helpers: {
      getDirectoryTreeHelper: () => [],
      searchFilesHelper: () => [],
      grepFilesHelper: () => [],
      generateSimpleDiff: () => "",
      splitLines: () => []
    }
  });

  const tempDir = path.join(os.tmpdir(), "fluxer_media_test");
  await fs.mkdir(tempDir, { recursive: true });

  const samplePath = path.join(tempDir, "sample.png");
  const convertedPath = path.join(tempDir, "sample.bmp");
  const resizedPath = path.join(tempDir, "sample_resized.png");

  // Crear una imagen PNG de prueba usando PowerShell System.Drawing
  const createPs = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 32, 24
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::DeepSkyBlue)
$g.Dispose()
$bmp.Save('${samplePath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
`;
  const b64 = Buffer.from(createPs, "utf16le").toString("base64");
  await execAsync(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`);

  // 1. get_image_metadata
  console.log("-> 1. get_image_metadata...");
  const metaRes = await filesDomain.actions.get_image_metadata({ path: samplePath });
  assert.strictEqual(metaRes.ok, true);
  assert.strictEqual(metaRes.width, 32);
  assert.strictEqual(metaRes.height, 24);
  assert.strictEqual(metaRes.dimensions, "32x24");
  assert.strictEqual(metaRes.format, "png");

  // 2. convert_image
  console.log("-> 2. convert_image (PNG -> BMP)...");
  const convRes = await filesDomain.actions.convert_image({
    path: samplePath,
    targetPath: convertedPath,
    format: "bmp"
  });
  assert.strictEqual(convRes.ok, true);
  assert.strictEqual(convRes.verified, true);
  assert.strictEqual(convRes.format, "bmp");
  const bmpVerify = await VerificationEngine.verifyFileWritten(convertedPath, { minBytes: 50 });
  assert.strictEqual(bmpVerify.verified, true);

  // 3. resize_image
  console.log("-> 3. resize_image (32x24 -> 16x12)...");
  const resizeRes = await filesDomain.actions.resize_image({
    path: samplePath,
    targetPath: resizedPath,
    width: 16,
    height: 12
  });
  assert.strictEqual(resizeRes.ok, true);
  assert.strictEqual(resizeRes.verified, true);
  assert.strictEqual(resizeRes.newDimensions, "16x12");
  const resizeVerify = await VerificationEngine.verifyFileWritten(resizedPath, { minBytes: 50 });
  assert.strictEqual(resizeVerify.verified, true);

  // Cleanup
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

  console.log("=== PASS: v10.1 Media Tooling ===");
}

runTests().catch(err => {
  console.error("Test falló:", err);
  process.exit(1);
});
