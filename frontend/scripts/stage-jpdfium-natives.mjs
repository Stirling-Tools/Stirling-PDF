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

function importedDlls(file) {
  const bytes = readFileSync(file);
  const pe = bytes.readUInt32LE(0x3c);
  const sectionCount = bytes.readUInt16LE(pe + 6);
  const optional = pe + 24;
  const optionalSize = bytes.readUInt16LE(pe + 20);
  const directories =
    optional + (bytes.readUInt16LE(optional) === 0x20b ? 112 : 96);
  const sections = [];
  for (let i = 0; i < sectionCount; i++) {
    const header = optional + optionalSize + i * 40;
    sections.push({
      rva: bytes.readUInt32LE(header + 12),
      size: Math.max(
        bytes.readUInt32LE(header + 8),
        bytes.readUInt32LE(header + 16),
      ),
      offset: bytes.readUInt32LE(header + 20),
    });
  }
  const toOffset = (rva) => {
    const section = sections.find((s) => rva >= s.rva && rva < s.rva + s.size);
    return section ? rva - section.rva + section.offset : null;
  };
  const readName = (rva) => {
    const start = toOffset(rva);
    if (start === null) return null;
    return bytes.toString("latin1", start, bytes.indexOf(0, start));
  };
  const names = [];
  const walk = (directory, entrySize, nameField) => {
    const rva = bytes.readUInt32LE(directories + directory * 8);
    let entry = rva ? toOffset(rva) : null;
    while (entry !== null && entry + entrySize <= bytes.length) {
      const nameRva = bytes.readUInt32LE(entry + nameField);
      if (nameRva === 0) break;
      const name = readName(nameRva);
      if (name) names.push(name);
      entry += entrySize;
    }
  };
  walk(1, 20, 12);
  walk(13, 32, 4);
  return names;
}

function librariesJpdfiumLoads(platformDir, libs, binDir) {
  const byName = new Map(libs.map((lib) => [lib.toLowerCase(), lib]));
  if (!byName.has("jpdfium.dll")) {
    console.error(`No jpdfium.dll among the natives in ${platformDir}.`);
    process.exit(1);
  }
  const loaded = new Set();
  const pending = ["jpdfium.dll"];
  while (pending.length > 0) {
    const lib = byName.get(pending.pop().toLowerCase());
    if (!lib || loaded.has(lib) || existsSync(join(binDir, lib))) continue;
    loaded.add(lib);
    pending.push(...importedDlls(join(platformDir, lib)));
  }
  return loaded;
}

function stageIntoJreBin(platformDir, libs) {
  const binDir = join(jreDir, "bin");
  const manifest = join(binDir, WINDOWS_MANIFEST);
  if (existsSync(manifest)) {
    for (const name of readList(manifest)) {
      rmSync(join(binDir, name), { force: true });
    }
  }
  const loaded = librariesJpdfiumLoads(platformDir, libs, binDir);
  const staged = libs.filter((lib) => {
    if (existsSync(join(binDir, lib))) {
      console.log(`Keeping the JRE's own ${lib}`);
      return false;
    }
    if (!loaded.has(lib)) {
      console.log(`Skipping ${lib}: nothing jpdfium.dll loads imports it`);
      return false;
    }
    return true;
  });
  // Written first so an interrupted copy can't leave DLLs a rerun mistakes for the JRE's own.
  writeFileSync(manifest, staged.join("\n") + "\n");
  for (const lib of staged) {
    cpSync(join(platformDir, lib), join(binDir, lib));
  }
  return { target: binDir, count: staged.length };
}

function stageIntoPlatformDir(platform, platformDir, libs) {
  const target = join(jreDir, "natives", platform);
  rmSync(target, { recursive: true, force: true });
  for (const lib of libs) {
    cpSync(join(platformDir, lib), join(target, lib));
  }
  return { target, count: libs.length };
}

rmSync(join(jreDir, "natives"), { recursive: true, force: true });
for (const platform of platforms) {
  const platformDir = join(sourceRoot, platform);
  const libs = readList(join(platformDir, "native-libs.txt"));
  const { target, count } = platform.startsWith("windows-")
    ? stageIntoJreBin(platformDir, libs)
    : stageIntoPlatformDir(platform, platformDir, libs);
  const licenses = join(platformDir, "licenses");
  if (existsSync(licenses)) {
    cpSync(licenses, join(jreDir, "legal", "jpdfium"), { recursive: true });
  }
  console.log(`Staged ${count} JPDFium natives for ${platform} in ${target}`);
}
