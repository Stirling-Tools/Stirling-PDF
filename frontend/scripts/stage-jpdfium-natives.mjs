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

const extracted = existsSync(sourceRoot) ? readdirSync(sourceRoot) : [];
if (extracted.length === 0) {
  console.error(
    `No JPDFium natives in ${sourceRoot}; run :common:stageJpdfiumNatives.`,
  );
  process.exit(1);
}

// jlink's release file has no OS_ARCH, so read the machine type from java.exe's PE header.
function windowsJrePlatform() {
  const javaExe = join(jreDir, "bin", "java.exe");
  if (!existsSync(javaExe)) {
    return null;
  }
  const header = readFileSync(javaExe);
  const machine = header.readUInt16LE(header.readUInt32LE(0x3c) + 4);
  const platform = { 0x8664: "windows-x64", 0xaa64: "windows-arm64" }[machine];
  if (!platform) {
    console.error(
      `Unsupported java.exe machine type 0x${machine.toString(16)}.`,
    );
    process.exit(1);
  }
  return platform;
}

const jreWindowsPlatform = windowsJrePlatform();
const platforms = extracted.filter((platform) => {
  if (!platform.startsWith("windows-") || platform === jreWindowsPlatform) {
    return true;
  }
  console.log(`Skipping ${platform}: it does not match this JRE`);
  return false;
});
if (
  jreWindowsPlatform &&
  extracted.some((p) => p.startsWith("windows-")) &&
  !platforms.includes(jreWindowsPlatform)
) {
  console.error(`No JPDFium natives for this ${jreWindowsPlatform} JRE.`);
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
  const staged = libs.filter((lib) => {
    const ownedByJre = existsSync(join(binDir, lib));
    if (ownedByJre) {
      console.log(`Keeping the JRE's own ${lib}`);
    }
    return !ownedByJre;
  });
  // Written first so an interrupted copy can't leave DLLs a rerun mistakes for the JRE's own.
  writeFileSync(manifest, staged.join("\n") + "\n");
  for (const lib of staged) {
    cpSync(join(platformDir, lib), join(binDir, lib));
  }
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
