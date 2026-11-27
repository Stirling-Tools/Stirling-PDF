#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as ResEdit from "resedit";

export const WINDOWS_LAUNCHER_NAME = "stirling-pdf-backend.exe";

const DISPLAY_NAME = "Stirling PDF";
const COMPANY_NAME = "Stirling PDF Inc.";
const ENGLISH_US = 1033;

export function brandLauncher(javaExe, icon) {
  const executable = ResEdit.NtExecutable.from(javaExe, { ignoreCert: true });
  const resources = ResEdit.NtExecutableResource.from(executable);

  const versions = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
  if (versions.length === 0) {
    throw new Error("java.exe has no version resource to rename");
  }
  for (const version of versions) {
    for (const language of version.getAllLanguagesForStringValues()) {
      version.setStringValues(language, {
        FileDescription: DISPLAY_NAME,
        ProductName: DISPLAY_NAME,
        CompanyName: COMPANY_NAME,
        InternalName: WINDOWS_LAUNCHER_NAME,
        OriginalFilename: WINDOWS_LAUNCHER_NAME,
      });
    }
    version.outputToResourceEntries(resources.entries);
  }

  const [group] = ResEdit.Resource.IconGroupEntry.fromEntries(
    resources.entries,
  );
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    group?.id ?? 1,
    group?.lang ?? ENGLISH_US,
    ResEdit.Data.IconFile.from(icon).icons.map((item) => item.data),
  );

  resources.outputResource(executable);
  return Buffer.from(executable.generate());
}

function main() {
  const [jreDir, iconPath] = process.argv.slice(2);
  if (!jreDir || !iconPath) {
    console.error("Usage: stage-windows-launcher.mjs <jreDir> <app.ico>");
    process.exit(1);
  }
  const javaExe = join(jreDir, "bin", "java.exe");
  if (!existsSync(javaExe)) {
    console.log(`No ${javaExe}: not a Windows runtime, nothing to stage.`);
    return;
  }
  const launcher = join(jreDir, "bin", WINDOWS_LAUNCHER_NAME);
  writeFileSync(
    launcher,
    brandLauncher(readFileSync(javaExe), readFileSync(iconPath)),
  );
  console.log(`Staged ${launcher}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
