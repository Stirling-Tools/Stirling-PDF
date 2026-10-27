#!/usr/bin/env node
// Stages the bootJar the desktop bundle expects under src-tauri/libs.
//
// tauri.conf.json bundles the whole libs/*.jar glob, so exactly one artifact
// must be present. The build's own version.properties names that artifact;
// scanning by mtime would be wrong because Gradle leaves an up-to-date bootJar
// output untouched, which lets a previously built jar look newer and get staged
// instead of the version that actually shipped.
//
// Usage: stage-backend-jar.mjs <sourceDir> <destDir> [version]
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
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

mkdirSync(destDir, { recursive: true });
const staged = existsSync(destDir)
  ? readdirSync(destDir).filter((name) => /^stirling-pdf-.*\.jar$/.test(name))
  : [];
for (const name of staged) {
  rmSync(join(destDir, name), { force: true });
}
copyFileSync(source, join(destDir, jarName));
console.log(`Staged ${jarName} in ${destDir}`);
