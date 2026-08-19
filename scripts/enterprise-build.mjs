#!/usr/bin/env node
/**
 * Enterprise assembly build orchestrator.
 *
 * Replaces scripts/ci-enterprise-build.sh and
 * scripts/ci-enterprise-electron-build.sh. Running the orchestration in Node
 * means path handling is native on every platform: no Git Bash requirement,
 * no MSYS /e/... path translation, no WSL bash hijacking.
 *
 * What it does:
 *   1. Locate the sibling enterprise repositories (assembly + modules).
 *   2. Resolve VITE_ENTERPRISE_MODULES_ENTRY / VITE_ENTERPRISE_HTML_HEAD_PATH /
 *      VITE_ENTERPRISE_FS_ALLOW, auto-discovering local module entries when
 *      they are not provided (same precedence rules as the previous scripts).
 *   3. Run the matching @octo/web build with those variables exported.
 *
 * Usage (from the repo root):
 *   node scripts/enterprise-build.mjs [web|all|mac|win|linux|linux-arm64]
 *
 *   web              -> pnpm --filter @octo/web build            (browser bundle)
 *   all|mac|win|...  -> pnpm --filter @octo/web build-ele[:target] (electron)
 *
 * Environment overrides (same as before):
 *   ENTERPRISE_ROOT, ENTERPRISE_MODULES_DIR, ENTERPRISE_LOOP_DIR,
 *   ENTERPRISE_DRIVE_DIR, ENTERPRISE_DOCS_DIR,
 *   VITE_ENTERPRISE_MODULES_ENTRY, VITE_ENTERPRISE_HTML_HEAD_PATH,
 *   VITE_ENTERPRISE_FS_ALLOW
 */

import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOG_PREFIX = "[enterprise-build]";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(scriptDir, "..");
const WORKSPACE_ROOT = path.resolve(ROOT, "..");

const ENTERPRISE_ROOT = process.env.ENTERPRISE_ROOT || WORKSPACE_ROOT;
const ENTERPRISE_MODULES_DIR = process.env.ENTERPRISE_MODULES_DIR || path.join(ENTERPRISE_ROOT, "octo-enterprise-modules");
const ENTERPRISE_LOOP_DIR = process.env.ENTERPRISE_LOOP_DIR || path.join(ENTERPRISE_ROOT, "octo-loop-module");
const ENTERPRISE_DRIVE_DIR = process.env.ENTERPRISE_DRIVE_DIR || path.join(ENTERPRISE_ROOT, "octo-drive-module");
const ENTERPRISE_DOCS_DIR = process.env.ENTERPRISE_DOCS_DIR || path.join(ENTERPRISE_ROOT, "octo-docs-module");

const TARGET = process.argv[2] || "all";
const ELECTRON_TARGETS = {
  all: "build-ele",
  mac: "build-ele:mac",
  win: "build-ele:win",
  linux: "build-ele:linux",
  "linux-arm64": "build-ele:linux-arm64",
};

function fail(message) {
  console.error(`${LOG_PREFIX} ${message}`);
  process.exit(1);
}

const isElectron = TARGET !== "web";
if (isElectron && !(TARGET in ELECTRON_TARGETS)) {
  fail(`Unknown target: ${TARGET}\n\nUsage:\n  pnpm build-ele:enterprise[:mac|:win|:linux|:linux-arm64]\n  pnpm build:enterprise`);
}
const BUILD_SCRIPT = isElectron ? ELECTRON_TARGETS[TARGET] : "build";

/**
 * Entries that look like package names (e.g. "@scope/pkg" or "pkg") are passed
 * through untouched instead of being resolved against the repo root; the
 * bundler resolves them as module specifiers. Mirrors the previous electron
 * script's is_bare_module_entry().
 */
function isBareModuleEntry(entry) {
  if (entry.startsWith(".") || entry.startsWith("/") || path.isAbsolute(entry)) return false;
  return entry.startsWith("@") || (!entry.includes("/") && !entry.includes("\\"));
}

function resolveFromRoot(target) {
  return path.isAbsolute(target) ? path.resolve(target) : path.resolve(ROOT, target);
}

const MODULE_SOURCES = [
  { entryFile: "src/loop.ts", dir: ENTERPRISE_LOOP_DIR, id: "octo-loop-module" },
  { entryFile: "src/drive.ts", dir: ENTERPRISE_DRIVE_DIR, id: "octo-drive-module" },
  { entryFile: "src/docs.ts", dir: ENTERPRISE_DOCS_DIR, id: "octo-docs-module" },
];

function discoverLocalEntries() {
  const entries = [];
  const discoveredDirs = [];
  for (const source of MODULE_SOURCES) {
    const entryPath = path.join(ENTERPRISE_MODULES_DIR, source.entryFile);
    if (fs.existsSync(source.dir) && fs.existsSync(entryPath)) {
      entries.push(entryPath);
      discoveredDirs.push(source.dir);
    }
  }
  return { entries, discoveredDirs };
}

// --- Entry resolution -------------------------------------------------------

let autoDiscovered = false;
let discoveredDirs = [];
let enterpriseModulesEntry;

if (process.env.VITE_ENTERPRISE_MODULES_ENTRY !== undefined) {
  enterpriseModulesEntry = process.env.VITE_ENTERPRISE_MODULES_ENTRY;
} else if (!process.env.CI || process.env.CI === "false") {
  const { entries, discoveredDirs: dirs } = discoverLocalEntries();
  if (entries.length === 0) {
    fail(`No local enterprise entries were discovered.

Expected local layout:
  ${WORKSPACE_ROOT}${path.sep}
    octo-web${path.sep}
    octo-enterprise-modules${path.sep}
    octo-loop-module${path.sep}   # optional, enables src/loop.ts
    octo-drive-module${path.sep}  # optional, enables src/drive.ts
    octo-docs-module${path.sep}   # optional, enables src/docs.ts

Set VITE_ENTERPRISE_MODULES_ENTRY explicitly for CI or custom builds.`);
  }
  enterpriseModulesEntry = entries.join(path.delimiter);
  discoveredDirs = dirs;
  autoDiscovered = true;
} else {
  enterpriseModulesEntry = path.join(ENTERPRISE_MODULES_DIR, "src/loop.ts");
}

const normalizedEntries = [];
for (const entry of enterpriseModulesEntry.split(path.delimiter)) {
  if (!entry) continue;
  if (isElectron && isBareModuleEntry(entry)) {
    normalizedEntries.push(entry);
    continue;
  }
  const resolved = resolveFromRoot(entry);
  if (!fs.existsSync(resolved)) {
    fail(`Missing enterprise module entry:
  ${resolved}

CI must checkout the enterprise assembly repository next to octo-web, or pass
VITE_ENTERPRISE_MODULES_ENTRY explicitly.

Expected default layout:
  ${WORKSPACE_ROOT}${path.sep}
    octo-web${path.sep}
    octo-enterprise-modules${path.sep}

Only modules imported by the selected enterprise entry files are bundled.`);
  }
  normalizedEntries.push(resolved);
}
enterpriseModulesEntry = normalizedEntries.join(path.delimiter);

// --- HTML head path ---------------------------------------------------------

let htmlHeadPath = process.env.VITE_ENTERPRISE_HTML_HEAD_PATH || path.join(ENTERPRISE_MODULES_DIR, "html", "head.html");
if (htmlHeadPath) {
  htmlHeadPath = resolveFromRoot(htmlHeadPath);
  if (!fs.existsSync(htmlHeadPath)) {
    htmlHeadPath = "";
  }
}

// --- FS allow list ----------------------------------------------------------

let fsAllow;
if (!process.env.VITE_ENTERPRISE_FS_ALLOW) {
  const allowPaths = [ROOT, ENTERPRISE_MODULES_DIR];
  if (autoDiscovered) {
    allowPaths.push(...discoveredDirs);
  } else {
    for (const source of MODULE_SOURCES) {
      const entryPath = path.join(ENTERPRISE_MODULES_DIR, source.entryFile);
      if (enterpriseModulesEntry.includes(entryPath) && fs.existsSync(source.dir)) {
        allowPaths.push(source.dir);
      }
    }
  }
  allowPaths.push(path.join(ROOT, "node_modules"));
  fsAllow = allowPaths.join(path.delimiter);
} else {
  fsAllow = process.env.VITE_ENTERPRISE_FS_ALLOW
    .split(path.delimiter)
    .filter((allowPath) => allowPath)
    .map((allowPath) => resolveFromRoot(allowPath))
    .join(path.delimiter);
}

// --- Enterprise electron API bases -------------------------------------------
// Mirrors the derivation previously living in ci-enterprise-electron-build.sh:
// the fleet and docs HTML bases fall back to the API origin so a single
// VITE_API_URL is enough for the enterprise electron build.

function deriveOrigin(raw) {
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

const childEnv = { ...process.env };
if (isElectron) {
  const apiOrigin = process.env.VITE_API_URL ? deriveOrigin(process.env.VITE_API_URL) : "";
  if (!process.env.VITE_LOOP_API_BASE) {
    const loopOrigin = (process.env.VITE_FLEET_API_URL ? deriveOrigin(process.env.VITE_FLEET_API_URL) : "") || apiOrigin;
    if (loopOrigin) {
      childEnv.VITE_LOOP_API_BASE = `${loopOrigin}/fleet/api/v1`;
    }
  }
  if (!process.env.VITE_OCTO_DOC_BASE) {
    const docsOrigin = (process.env.VITE_DOCS_API_URL ? deriveOrigin(process.env.VITE_DOCS_API_URL) : "") || apiOrigin;
    if (docsOrigin) {
      childEnv.VITE_OCTO_DOC_BASE = `${docsOrigin}/docs-html`;
    }
  }
}

// --- Run the build ----------------------------------------------------------

console.log(`${LOG_PREFIX} VITE_ENTERPRISE_MODULES_ENTRY=${enterpriseModulesEntry}`);
if (htmlHeadPath) {
  console.log(`${LOG_PREFIX} VITE_ENTERPRISE_HTML_HEAD_PATH=${htmlHeadPath}`);
}
console.log(`${LOG_PREFIX} VITE_ENTERPRISE_FS_ALLOW=${fsAllow}`);
if (childEnv.VITE_LOOP_API_BASE) {
  console.log(`${LOG_PREFIX} VITE_LOOP_API_BASE=${childEnv.VITE_LOOP_API_BASE}`);
}
if (childEnv.VITE_OCTO_DOC_BASE) {
  console.log(`${LOG_PREFIX} VITE_OCTO_DOC_BASE=${childEnv.VITE_OCTO_DOC_BASE}`);
}
console.log(`${LOG_PREFIX} build script=${BUILD_SCRIPT}`);

// Prefer `corepack pnpm` when corepack is available (matches the previous
// script behavior); the arguments below are fixed strings from package.json,
// never user input.
const pnpmCommand = childProcess.spawnSync("corepack", ["--version"], { shell: true, encoding: "utf8" }).status === 0
  ? "corepack pnpm"
  : "pnpm";
const child = childProcess.spawn(pnpmCommand, ["--filter", "@octo/web", BUILD_SCRIPT], {
  cwd: ROOT,
  stdio: "inherit",
  shell: true,
  env: {
    ...childEnv,
    VITE_ENTERPRISE_MODULES_ENTRY: enterpriseModulesEntry,
    VITE_ENTERPRISE_HTML_HEAD_PATH: htmlHeadPath,
    VITE_ENTERPRISE_FS_ALLOW: fsAllow,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  fail(`failed to start pnpm: ${error.message}`);
});
