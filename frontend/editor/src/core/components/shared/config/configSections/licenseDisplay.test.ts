import { describe, expect, it } from "vitest";
import {
  dedupeDependencies,
  resolveLicenseDisplay,
} from "@app/components/shared/config/configSections/licenseDisplay";
import type { Dependency } from "@app/components/shared/config/configSections/ThirdPartyLicensesSection";

function dependency(
  moduleName: string,
  moduleLicense?: string,
  moduleLicenseText?: string,
): Dependency {
  return { moduleName, moduleLicense, moduleLicenseText };
}

describe("resolveLicenseDisplay", () => {
  it("keeps compound expressions unchanged without an explainer link", () => {
    expect(resolveLicenseDisplay("Apache-2.0 OR MIT")).toEqual({
      short: "Apache-2.0 OR MIT",
    });
    expect(resolveLicenseDisplay("Apache-2.0 WITH LLVM-exception")).toEqual({
      short: "Apache-2.0 WITH LLVM-exception",
    });
  });

  it("agrees the only/or-later label with its SPDX id", () => {
    expect(
      resolveLicenseDisplay("GNU Lesser General Public License v3.0 only"),
    ).toEqual({ short: "LGPL-3.0", spdxId: "LGPL-3.0-only" });
    expect(
      resolveLicenseDisplay("GNU Lesser General Public License v3.0 or later"),
    ).toEqual({ short: "LGPL-3.0+", spdxId: "LGPL-3.0-or-later" });
  });

  it("does not map AGPL to GPL or MPL 1.1 to MPL 2.0", () => {
    expect(
      resolveLicenseDisplay("GNU Affero General Public License v3.0 only"),
    ).toEqual({ short: "AGPL-3.0", spdxId: "AGPL-3.0-only" });
    expect(resolveLicenseDisplay("Mozilla Public License 1.1")).toEqual({
      short: "MPL-1.1",
      spdxId: "MPL-1.1",
    });
  });

  it("shortens names without an SPDX page but adds no dead link", () => {
    expect(resolveLicenseDisplay("Bouncy Castle Licence")).toEqual({
      short: "BouncyCastle",
    });
  });
});

describe("dedupeDependencies", () => {
  it("keeps same-name records with different licenses", () => {
    const result = dedupeDependencies([
      dependency("logback-classic", "EPL-1.0"),
      dependency("logback-classic", "LGPL-2.1"),
    ]);
    expect(result).toHaveLength(2);
  });

  it("collapses same-name same-license version rows", () => {
    const result = dedupeDependencies([
      { ...dependency("logback-classic", "EPL-1.0"), moduleVersion: "1.5.38" },
      { ...dependency("logback-classic", "EPL-1.0"), moduleVersion: "1.6.3" },
    ]);
    expect(result).toHaveLength(1);
  });

  it("prefers the record carrying the full license text", () => {
    const result = dedupeDependencies([
      dependency("PDFium", "BSD-3-Clause"),
      dependency("PDFium", "BSD-3-Clause", "full text"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.moduleLicenseText).toBe("full text");
  });

  it("keeps differing texts for the same component", () => {
    const result = dedupeDependencies([
      dependency("PDFium", "BSD-3-Clause", "text A"),
      dependency("PDFium", "BSD-3-Clause", "text B"),
    ]);
    expect(result).toHaveLength(2);
  });
});
