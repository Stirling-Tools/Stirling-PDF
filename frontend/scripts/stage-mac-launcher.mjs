#!/usr/bin/env node
// macOS names and badges a smart-card PIN prompt after the requesting executable: a bare
// bin/java shows "java" with a terminal icon. Wrapping a copy of the launcher in an app bundle
// inside the JRE makes the prompt read "Stirling PDF" with the app icon.
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const MAC_LAUNCHER_NAME = "Stirling PDF";

const [jreDir, iconPath] = process.argv.slice(2);

if (!jreDir || !iconPath) {
  console.error("Usage: stage-mac-launcher.mjs <jreDir> <icon.icns>");
  process.exit(1);
}
if (process.platform !== "darwin") {
  process.exit(0);
}
if (!existsSync(join(jreDir, "release"))) {
  console.error(
    `${jreDir} is not a JRE; build it before staging the launcher.`,
  );
  process.exit(1);
}

const bundle = join(jreDir, `${MAC_LAUNCHER_NAME}.app`);
const contents = join(bundle, "Contents");
const executable = join(contents, "MacOS", MAC_LAUNCHER_NAME);

rmSync(bundle, { recursive: true, force: true });
mkdirSync(join(contents, "MacOS"), { recursive: true });
mkdirSync(join(contents, "Resources"), { recursive: true });

cpSync(join(jreDir, "bin", "java"), executable);
chmodSync(executable, 0o755);
// The launcher loads libjli through its rpath, and libjli derives java.home from its own
// location, so pointing the rpath back at the JRE's lib keeps one copy of the runtime.
execFileSync("install_name_tool", [
  "-add_rpath",
  "@loader_path/../../../lib",
  executable,
]);

cpSync(iconPath, join(contents, "Resources", "AppIcon.icns"));
writeFileSync(
  join(contents, "Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>${MAC_LAUNCHER_NAME}</string>
  <key>CFBundleIdentifier</key><string>stirling.pdf.dev.backend</string>
  <key>CFBundleName</key><string>${MAC_LAUNCHER_NAME}</string>
  <key>CFBundleDisplayName</key><string>${MAC_LAUNCHER_NAME}</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
`,
);

execFileSync("codesign", ["--force", "--sign", "-", bundle]);
console.log(`Staged ${bundle}`);
