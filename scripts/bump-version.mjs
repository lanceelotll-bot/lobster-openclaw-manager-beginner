#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const target = process.argv[2] ?? "patch";
const semverPattern = /^(\d+)\.(\d+)\.(\d+)$/;

function parseVersion(version) {
  const match = semverPattern.exec(version);
  if (!match) {
    throw new Error(`Invalid version: ${version}`);
  }
  return match.slice(1).map((part) => Number(part));
}

function bumpVersion(version, bumpType) {
  const [major, minor, patch] = parseVersion(version);

  switch (bumpType) {
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "major":
      return `${major + 1}.0.0`;
    default:
      if (!semverPattern.test(bumpType)) {
        throw new Error(`Unsupported bump target: ${bumpType}`);
      }
      return bumpType;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function replaceVersionInToml(content, version) {
  return content.replace(/^version = ".*"$/m, `version = "${version}"`);
}

function replaceVersionInMeta(content, version) {
  return content.replace(
    /export const APP_VERSION = ".*";/,
    `export const APP_VERSION = "${version}";`
  );
}

function replaceVersionInReadme(content, version) {
  return content.replace(
    /\*\*当前版本 \/ Current Version:\*\* `.*`/,
    `**当前版本 / Current Version:** \`${version}\``
  );
}

async function main() {
  const packageJsonPath = path.join(repoRoot, "package.json");
  const packageLockPath = path.join(repoRoot, "package-lock.json");
  const tauriConfigPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
  const cargoTomlPath = path.join(repoRoot, "src-tauri", "Cargo.toml");
  const appMetaPath = path.join(repoRoot, "src", "lib", "app-meta.ts");
  const readmePath = path.join(repoRoot, "README.md");

  const packageJson = await readJson(packageJsonPath);
  const nextVersion = bumpVersion(packageJson.version, target);

  packageJson.version = nextVersion;
  await writeJson(packageJsonPath, packageJson);

  const packageLock = await readJson(packageLockPath);
  packageLock.version = nextVersion;
  if (packageLock.packages?.[""]) {
    packageLock.packages[""].version = nextVersion;
  }
  await writeJson(packageLockPath, packageLock);

  const tauriConfig = await readJson(tauriConfigPath);
  tauriConfig.version = nextVersion;
  await writeJson(tauriConfigPath, tauriConfig);

  const cargoToml = await readFile(cargoTomlPath, "utf8");
  await writeFile(cargoTomlPath, replaceVersionInToml(cargoToml, nextVersion));

  const appMeta = await readFile(appMetaPath, "utf8");
  await writeFile(appMetaPath, replaceVersionInMeta(appMeta, nextVersion));

  const readme = await readFile(readmePath, "utf8");
  await writeFile(readmePath, replaceVersionInReadme(readme, nextVersion));

  console.log(`Version bumped: ${packageJson.version} -> ${nextVersion}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
