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

  it("preserves slash-separated licenses verbatim with no SPDX link", () => {
    expect(resolveLicenseDisplay("MIT/Old MIT License")).toEqual({
      short: "MIT/Old MIT License",
    });
    expect(resolveLicenseDisplay("Unicode License / ICU License")).toEqual({
      short: "Unicode License / ICU License",
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

  it("collapses same-name same-license version rows and shows all versions", () => {
    const result = dedupeDependencies([
      { ...dependency("logback-classic", "EPL-1.0"), moduleVersion: "1.5.38" },
      { ...dependency("logback-classic", "EPL-1.0"), moduleVersion: "1.6.3" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.moduleVersion).toBe("1.5.38, 1.6.3");
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

  it("assigns distinct row ids to hash-colliding texts", () => {
    const result = dedupeDependencies([
      dependency("PDFium", "BSD-3-Clause", "Ab"),
      dependency("PDFium", "BSD-3-Clause", "BA"),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]?.rowId).not.toBe(result[1]?.rowId);
  });

  it("keeps row ids stable for the same input", () => {
    const input = [
      dependency("PDFium", "BSD-3-Clause", "text A"),
      dependency("QPDF", "Apache-2.0"),
    ];
    const first = dedupeDependencies(input).map((row) => row.rowId);
    const second = dedupeDependencies(input).map((row) => row.rowId);
    expect(first).toEqual(second);
  });
});
