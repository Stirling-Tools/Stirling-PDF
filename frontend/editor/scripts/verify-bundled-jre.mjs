// Fail the desktop build if the bundled jlink runtime is older than the Java
// version the app JAR is compiled for. A too-old runtime ships happily today
// (the jlink task short-circuits on a stale runtime/jre, and nothing checks the
// version), then dies at launch with UnsupportedClassVersionError -> the
// backend never starts and every tool shows "backend offline".
//
// Reads JAVA_VERSION from the jlink `release` file (always present in a jlink
// output) so it needs no shell and behaves identically on Windows/macOS/Linux.
//
// Required major comes from REQUIRED_JAVA (wired from .taskfiles/desktop.yml,
// which mirrors build.gradle `modernJavaVersion`). Keep them in sync.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const required = Number(process.env.REQUIRED_JAVA ?? "25");
const releasePath = process.argv[2] ?? "runtime/jre/release";

function rebuildRuntime(reason) {
  console.warn(`${reason} Rebuilding runtime with 'task desktop:jlink'.`);

  const taskCommand = process.platform === "win32" ? "task.cmd" : "task";
  const result = spawnSync(taskCommand, ["jlink:runtime"], {
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`FATAL: failed to launch 'task jlink:runtime': ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`FATAL: 'task jlink:runtime' exited with status ${result.status}.`);
    process.exit(result.status ?? 1);
  }
}

function readReleaseFile(path) {
  return readFileSync(path, "utf8");
}

function readReleaseOrFail(path, context) {
  try {
    return readReleaseFile(path);
  } catch (err) {
    console.error(`FATAL: ${context} cannot read bundled JRE release file at "${path}": ${err.message}.`);
    process.exit(1);
  }
}

function parseMajor(raw) {
  const match = raw.match(/JAVA_VERSION="?(\d+)/);
  return match ? Number(match[1]) : 0;
}

let raw;
try {
  raw = readReleaseFile(releasePath);
} catch (err) {
  console.error(
    `WARN: cannot read bundled JRE release file at "${releasePath}": ${err.message}.`,
  );
  rebuildRuntime("Bundled runtime is missing.");
  raw = readReleaseOrFail(releasePath, "After rebuilding,");
}

let major = parseMajor(raw);
if (!major || major < required) {
  rebuildRuntime(
    `Bundled runtime/jre is Java ${major || "unknown"} but the app JAR requires Java ${required}.`,
  );
  raw = readReleaseOrFail(releasePath, "After rebuilding,");
  major = parseMajor(raw);
}

console.log(`Bundled JRE major: ${major || "unknown"} (required >= ${required})`);

if (!major || major < required) {
  console.error(
    `FATAL: bundled runtime/jre is Java ${major || "unknown"} but the app JAR requires ` +
      `Java ${required}. Run 'task desktop:jlink:clean' and rebuild with JDK ${required} active ` +
      `(check 'java -version' / JAVA_HOME).`,
  );
  process.exit(1);
}
