import childProcess from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const viteEnv = loadEnv("production", appDir, "VITE_");
const apiURL = process.env.VITE_API_URL || viteEnv.VITE_API_URL;
const viteBin = path.join(path.dirname(require.resolve("vite/package.json")), "bin", "vite.js");

function originOf(value) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

if (!apiURL) {
  console.error(
    "[build-electron-renderer] VITE_API_URL is required for Electron builds. " +
      "Set it to the deployment API origin, for example: VITE_API_URL=https://api.example.com",
  );
  process.exit(1);
}

const apiOrigin = originOf(apiURL);
const fleetOrigin = originOf(process.env.VITE_FLEET_API_URL || viteEnv.VITE_FLEET_API_URL) || apiOrigin;
const docsOrigin = originOf(process.env.VITE_DOCS_API_URL || viteEnv.VITE_DOCS_API_URL) || apiOrigin;

const child = childProcess.spawn(process.execPath, [viteBin, "build"], {
  cwd: appDir,
  env: {
    ...process.env,
    VITE_ELECTRON_BUILD: "true",
    VITE_API_URL: apiURL,
    VITE_LOOP_API_BASE:
      process.env.VITE_LOOP_API_BASE || (fleetOrigin ? `${fleetOrigin}/fleet/api/v1` : undefined),
    VITE_OCTO_DOC_BASE:
      process.env.VITE_OCTO_DOC_BASE || (docsOrigin ? `${docsOrigin}/docs-html` : undefined),
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on("error", error => {
  console.error(`[build-electron-renderer] failed to start vite: ${error.message}`);
  process.exit(1);
});
