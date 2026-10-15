import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const run = promisify(execFile);
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Unit tests mock @octo/base. Only the production bundle exercises its real
// barrel exports and catches capture APIs lost when owner changes are rebased.
test("production Communication capture bundles through the real base exports", { timeout: 120_000 }, async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "octo-capture-build-"));
  try {
    const { stdout } = await run("git", ["rev-parse", "HEAD"], { cwd: appDir });
    const commit = stdout.trim();
    await run(process.execPath, ["scripts/build-client-communication.mjs"], {
      cwd: appDir,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 110_000,
      env: {
        ...process.env,
        VITE_API_URL: "http://127.0.0.1:1/v1/",
        VITE_GIT_COMMIT: commit,
        VITE_SIDEBAR_CAPTURE: "1",
        VITE_E2E_MOCK: "0",
        VITE_E2E_MOCK_IM: "0",
        // The regression can run before a fix is committed; generated test
        // artifacts stay isolated and can never replace a pinned renderer.
        OCTO_ALLOW_DIRTY_CLIENT_ARTIFACT: "1",
        OCTO_CLIENT_ARTIFACT_OUT_DIR: outputDir,
      },
    });

    const manifest = JSON.parse(await readFile(path.join(outputDir, "renderer-manifest.json"), "utf8"));
    assert.equal(manifest.commit, commit.slice(0, manifest.commit.length));
    assert.equal(manifest.ownerCutoverVersion, 1);
    assert.equal(manifest.e2eMock, false);
    assert.deepEqual(manifest.mockFlags, { api: "0", im: "0" });
    await readFile(path.join(outputDir, manifest.entry), "utf8");

    const assetDir = path.join(outputDir, "assets");
    const scripts = (await readdir(assetDir)).filter((name) => name.endsWith(".js"));
    const bundles = await Promise.all(scripts.map((name) => readFile(path.join(assetDir, name), "utf8")));
    assert.ok(bundles.some((source) => source.includes("__octoProductionSidebarCapture__")),
      "the opt-in production capture hook must survive the real Communication build");
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
