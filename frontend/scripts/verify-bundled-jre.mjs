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
import { readFileSync } from "node:fs";

const required = Number(process.env.REQUIRED_JAVA ?? "25");
const releasePath = process.argv[2] ?? "runtime/jre/release";

let raw;
try {
  raw = readFileSync(releasePath, "utf8");
} catch (err) {
  console.error(
    `FATAL: cannot read bundled JRE release file at "${releasePath}": ${err.message}. ` +
      `Is the runtime built? Run 'task desktop:jlink'.`,
  );
  process.exit(1);
}

const match = raw.match(/JAVA_VERSION="?(\d+)/);
const major = match ? Number(match[1]) : 0;

console.log(
  `Bundled JRE major: ${major || "unknown"} (required >= ${required})`,
);

if (!major || major < required) {
  console.error(
    `FATAL: bundled runtime/jre is Java ${major || "unknown"} but the app JAR requires ` +
      `Java ${required}. Run 'task desktop:jlink:clean' and rebuild with JDK ${required} active ` +
      `(check 'java -version' / JAVA_HOME).`,
  );
  process.exit(1);
}
