#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const [sourceRoot, jreDir] = process.argv.slice(2);
const WINDOWS_MANIFEST = "jpdfium-natives.txt";

if (!sourceRoot || !jreDir) {
  console.error("Usage: stage-jpdfium-natives.mjs <extractedDir> <jreDir>");
  process.exit(1);
}
if (!existsSync(join(jreDir, "release"))) {
  console.error(`${jreDir} is not a JRE; build it before staging natives.`);
  process.exit(1);
}

const platforms = existsSync(sourceRoot) ? readdirSync(sourceRoot) : [];
if (platforms.length === 0) {
  console.error(
    `No JPDFium natives in ${sourceRoot}; run :common:stageJpdfiumNatives.`,
  );
  process.exit(1);
}
const windowsPlatforms = platforms.filter((p) => p.startsWith("windows-"));
if (windowsPlatforms.length > 1) {
  console.error(
    `Only one Windows platform fits in one JRE, got ${windowsPlatforms.join(", ")}.`,
  );
  process.exit(1);
}

function readList(file) {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function stageIntoJreBin(platformDir, libs) {
  const binDir = join(jreDir, "bin");
  const manifest = join(binDir, WINDOWS_MANIFEST);
  if (existsSync(manifest)) {
    for (const name of readList(manifest)) {
      rmSync(join(binDir, name), { force: true });
    }
  }
  const staged = [];
  for (const lib of libs) {
    if (existsSync(join(binDir, lib))) {
      console.log(`Keeping the JRE's own ${lib}`);
      continue;
    }
    cpSync(join(platformDir, lib), join(binDir, lib));
    staged.push(lib);
  }
  writeFileSync(manifest, staged.join("\n") + "\n");
  return binDir;
}

function stageIntoPlatformDir(platform, platformDir, libs) {
  const target = join(jreDir, "natives", platform);
  rmSync(target, { recursive: true, force: true });
  for (const lib of libs) {
    cpSync(join(platformDir, lib), join(target, lib));
  }
  return target;
}

rmSync(join(jreDir, "natives"), { recursive: true, force: true });
for (const platform of platforms) {
  const platformDir = join(sourceRoot, platform);
  const libs = readList(join(platformDir, "native-libs.txt"));
  const target = platform.startsWith("windows-")
    ? stageIntoJreBin(platformDir, libs)
    : stageIntoPlatformDir(platform, platformDir, libs);
  const licenses = join(platformDir, "licenses");
  if (existsSync(licenses)) {
    cpSync(licenses, join(jreDir, "legal", "jpdfium"), { recursive: true });
  }
  console.log(
    `Staged ${libs.length} JPDFium natives for ${platform} in ${target}`,
  );
}
