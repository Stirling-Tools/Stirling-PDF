#!/usr/bin/env node
// Stages the bootJar the desktop bundle expects under src-tauri/libs, unpacked
// into a thin main jar plus lib/ so the JDK AOT cache can cover its classes.
//
// tauri.conf.json bundles all of libs/, so it must hold only this build's
// output. The build's own version.properties names that artifact;
// scanning by mtime would be wrong because Gradle leaves an up-to-date bootJar
// output untouched, which lets a previously built jar look newer and get staged
// instead of the version that actually shipped.
//
// Usage: stage-backend-jar.mjs <sourceDir> <destDir> [version]
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
} from "node:fs";
import { join } from "node:path";

const [sourceDir, destDir, versionArg] = process.argv.slice(2);

const VERSION_PROPERTIES = "app/common/src/main/resources/version.properties";

function resolveVersion() {
  if (versionArg) return versionArg;
  if (!existsSync(VERSION_PROPERTIES)) {
    console.error(
      `Missing ${VERSION_PROPERTIES}; run the backend build or pass a version.`,
    );
    process.exit(1);
  }
  const match = readFileSync(VERSION_PROPERTIES, "utf8").match(
    /^version=(.+)$/m,
  );
  if (!match) {
    console.error(`No version= entry in ${VERSION_PROPERTIES}`);
    process.exit(1);
  }
  return match[1].trim();
}

const jarName = `stirling-pdf-${resolveVersion()}.jar`;
const source = join(sourceDir, jarName);

if (!existsSync(source)) {
  console.error(
    `Expected ${jarName} in ${sourceDir}; the backend build did not produce it.`,
  );
  process.exit(1);
}

// Clear everything: a stale lib/ jar or AOT cache from an older build would ship too.
rmSync(destDir, { recursive: true, force: true });
mkdirSync(destDir, { recursive: true });
const java = process.env.JAVA_HOME
  ? join(process.env.JAVA_HOME, "bin", "java")
  : "java";
execFileSync(
  java,
  ["-Djarmode=tools", "-jar", source, "extract", "--destination", destDir],
  { stdio: "inherit" },
);
if (!existsSync(join(destDir, jarName))) {
  console.error(
    `Extracting ${jarName} did not produce ${join(destDir, jarName)}`,
  );
  process.exit(1);
}

// MSI stores file times at 2 s precision and the AOT cache rejects a jar whose mtime moved.
for (const entry of readdirSync(destDir, {
  recursive: true,
  withFileTypes: true,
})) {
  if (!entry.isFile()) continue;
  const file = join(entry.parentPath, entry.name);
  const seconds = Math.floor(statSync(file).mtimeMs / 2000) * 2;
  utimesSync(file, seconds, seconds);
}
console.log(`Staged ${jarName} (unpacked) in ${destDir}`);
