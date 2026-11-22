#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const [jreDir, jdkHome] = process.argv.slice(2);

if (!jreDir || !jdkHome) {
  console.error("Usage: use-vendor-signed-jdk-binaries.mjs <jreDir> <jdkHome>");
  process.exit(1);
}

function peLayout(bytes) {
  const pe = bytes.readUInt32LE(0x3c);
  const optional = pe + 24;
  const magic = bytes.readUInt16LE(optional);
  const certEntry = optional + (magic === 0x20b ? 112 : 96) + 4 * 8;
  return {
    checksum: optional + 64,
    certEntry,
    certOffset: bytes.readUInt32LE(certEntry),
    certSize: bytes.readUInt32LE(certEntry + 4),
  };
}

function hasSignature(bytes) {
  const { certOffset, certSize } = peLayout(bytes);
  return certSize > 0 && certOffset + certSize <= bytes.length;
}

function authenticodeDigest(bytes) {
  const { checksum, certEntry, certOffset } = peLayout(bytes);
  const signed = hasSignature(bytes);
  const end = signed ? certOffset : bytes.length;
  const hash = createHash("sha256");
  hash.update(bytes.subarray(0, checksum));
  hash.update(bytes.subarray(checksum + 4, certEntry));
  hash.update(bytes.subarray(certEntry + 8, end));
  if (!signed) {
    hash.update(Buffer.alloc((8 - (end % 8)) % 8));
  }
  return hash.digest("hex");
}

function binaries(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        [".dll", ".exe"].includes(extname(entry.name).toLowerCase()),
    )
    .map((entry) => join(entry.parentPath, entry.name));
}

let replaced = 0;
let unsigned = 0;
for (const file of binaries(jreDir)) {
  const bytes = readFileSync(file);
  if (hasSignature(bytes)) continue;
  const vendorFile = join(jdkHome, relative(jreDir, file));
  if (existsSync(vendorFile)) {
    const vendorBytes = readFileSync(vendorFile);
    if (
      hasSignature(vendorBytes) &&
      authenticodeDigest(vendorBytes) === authenticodeDigest(bytes)
    ) {
      copyFileSync(vendorFile, file);
      replaced++;
      continue;
    }
  }
  unsigned++;
}

console.log(
  `Replaced ${replaced} unsigned runtime binaries with the JDK's signed copies; ${unsigned} remain unsigned`,
);
