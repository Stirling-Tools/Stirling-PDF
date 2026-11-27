import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as ResEdit from "resedit";
import { describe, expect, it } from "vitest";
// oxlint-disable-next-line no-restricted-imports -- scripts have no alias for this local build helper
import {
  WINDOWS_LAUNCHER_NAME,
  brandLauncher,
} from "./stage-windows-launcher.mjs";

const ICON = readFileSync(
  fileURLToPath(new URL("../src-tauri/icons/windows/app.ico", import.meta.url)),
);
const ENGLISH_US = { lang: 1033, codepage: 1200 };

function fakeJavaExe(withVersion: boolean): Buffer {
  const executable = ResEdit.NtExecutable.createEmpty(false, false);
  const resources = ResEdit.NtExecutableResource.from(executable);
  if (withVersion) {
    const version = ResEdit.Resource.VersionInfo.createEmpty();
    version.setStringValues(ENGLISH_US, {
      FileDescription: "OpenJDK Platform binary",
      ProductName: "OpenJDK Platform 25",
      CompanyName: "Eclipse Adoptium",
      FileVersion: "25.0.5.1",
    });
    version.outputToResourceEntries(resources.entries);
  }
  resources.outputResource(executable);
  return Buffer.from(executable.generate());
}

function readBranding(exe: Buffer) {
  const executable = ResEdit.NtExecutable.from(exe);
  const resources = ResEdit.NtExecutableResource.from(executable);
  const [version] = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
  const [group] = ResEdit.Resource.IconGroupEntry.fromEntries(
    resources.entries,
  );
  return { strings: version.getStringValues(ENGLISH_US), group };
}

describe("brandLauncher", () => {
  it("names the launcher after Stirling PDF and keeps the JDK version", () => {
    const { strings } = readBranding(brandLauncher(fakeJavaExe(true), ICON));

    expect(strings).toMatchObject({
      FileDescription: "Stirling PDF",
      ProductName: "Stirling PDF",
      CompanyName: "Stirling PDF Inc.",
      InternalName: WINDOWS_LAUNCHER_NAME,
      OriginalFilename: WINDOWS_LAUNCHER_NAME,
      FileVersion: "25.0.5.1",
    });
  });

  it("gives the launcher the app icon", () => {
    const { group } = readBranding(brandLauncher(fakeJavaExe(true), ICON));

    expect(group.icons.length).toBe(
      ResEdit.Data.IconFile.from(ICON).icons.length,
    );
  });

  it("refuses a java.exe with no version resource to rename", () => {
    expect(() => brandLauncher(fakeJavaExe(false), ICON)).toThrow(
      /no version resource/,
    );
  });
});
