#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const dryRun = process.argv.includes("--dry-run");
const packageJsonPaths = process.argv
  .slice(2)
  .filter((item) => item !== "--dry-run")
  .map((item) => {
    const resolved = path.resolve(rootDir, item);
    return fs.existsSync(path.join(resolved, "package.json")) ? path.join(resolved, "package.json") : resolved;
  });

if (packageJsonPaths.length === 0) {
  packageJsonPaths.push(path.resolve(rootDir, ".enterprise/octo-enterprise-modules/package.json"));
}

const ignoredSpecPrefixes = ["workspace:", "file:", "link:", "portal:"];
const hostPackageJsonPaths = [
  path.join(rootDir, "package.json"),
  path.join(rootDir, "apps/web/package.json"),
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function collectDeclaredDependencies(packageJson) {
  return new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
    ...Object.keys(packageJson.peerDependencies || {}),
    ...Object.keys(packageJson.optionalDependencies || {}),
  ]);
}

function shouldInstallDependency(name, spec) {
  if (!spec || ignoredSpecPrefixes.some((prefix) => spec.startsWith(prefix))) {
    return false;
  }

  // The host supplies these as singleton workspace/runtime packages. Installing
  // another copy from a private module would break React context and Vite peers.
  if (name === "react" || name === "react-dom" || name === "@octo/base") {
    return false;
  }

  return true;
}

const hostDependencies = new Set();
for (const hostPackageJsonPath of hostPackageJsonPaths) {
  if (!fs.existsSync(hostPackageJsonPath)) continue;
  for (const name of collectDeclaredDependencies(readJson(hostPackageJsonPath))) {
    hostDependencies.add(name);
  }
}

const dependencies = new Map();
for (const packageJsonPath of packageJsonPaths) {
  const packageJson = readJson(packageJsonPath);
  for (const [name, spec] of Object.entries(packageJson.dependencies || {})) {
    if (shouldInstallDependency(name, spec) && !dependencies.has(name)) {
      dependencies.set(name, spec);
    }
  }
}

const missing = [...dependencies.entries()]
  .filter(([name]) => !hostDependencies.has(name))
  .map(([name, spec]) => `${name}@${spec}`)
  .sort((a, b) => a.localeCompare(b));

if (missing.length === 0) {
  console.log("[enterprise-deps] no missing enterprise host dependencies");
  process.exit(0);
}

console.log(`[enterprise-deps] installing ${missing.length} missing dependencies:`);
for (const item of missing) console.log(`  ${item}`);

if (dryRun) process.exit(0);

const args = [
  "add",
  "--filter",
  "@octo/web",
  "--ignore-scripts",
  "--no-lockfile",
  "--registry=https://registry.npmmirror.com",
  ...missing,
];

const result = spawnSync("pnpm", args, {
  cwd: rootDir,
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
