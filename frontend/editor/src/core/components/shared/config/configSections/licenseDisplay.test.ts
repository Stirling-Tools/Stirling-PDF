import { describe, expect, it } from "vitest";
import {
  dedupeDependencies,
  resolveAboutLinks,
  resolveLicenseDisplay,
  resolveModuleLicenseUrl,
  resolveModuleUrl,
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
  it("keeps compound labels intact and links only fully-known OR/AND parts", () => {
    expect(resolveLicenseDisplay("Apache-2.0 OR MIT")).toEqual({
      short: "Apache-2.0 OR MIT",
      spdxIds: ["Apache-2.0", "MIT"],
    });
    expect(resolveLicenseDisplay("MIT AND Apache-2.0")).toEqual({
      short: "MIT AND Apache-2.0",
      spdxIds: ["MIT", "Apache-2.0"],
    });
    expect(resolveLicenseDisplay("MIT OR Some Unknown License")).toEqual({
      short: "MIT OR Some Unknown License",
    });
    expect(resolveLicenseDisplay("Apache-2.0 WITH LLVM-exception")).toEqual({
      short: "Apache-2.0 WITH LLVM-exception",
    });
  });

  it("derives about links from single and compound displays", () => {
    expect(resolveAboutLinks(resolveLicenseDisplay("MIT license"))).toEqual([
      { spdxId: "MIT", short: "MIT" },
    ]);
    expect(
      resolveAboutLinks(resolveLicenseDisplay("MIT OR Apache-2.0")),
    ).toEqual([
      { spdxId: "MIT", short: "MIT" },
      { spdxId: "Apache-2.0", short: "Apache-2.0" },
    ]);
    expect(
      resolveAboutLinks(resolveLicenseDisplay("Some Unknown License")),
    ).toEqual([]);
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

  it("maps The BSD License to BSD-3-Clause for TwelveMonkeys modules only", () => {
    expect(
      resolveLicenseDisplay(
        "The BSD License",
        "com.twelvemonkeys.imageio:imageio-core",
      ),
    ).toEqual({ short: "BSD-3-Clause", spdxId: "BSD-3-Clause" });
    expect(resolveLicenseDisplay("The BSD License")).toEqual({
      short: "The BSD License",
    });
    expect(
      resolveLicenseDisplay("The BSD License", "com.example:other"),
    ).toEqual({ short: "The BSD License" });
  });
});

describe("resolveModuleLicenseUrl", () => {
  it("links the jai-imageio license files the report leaves URL-less", () => {
    expect(
      resolveModuleLicenseUrl(
        dependency("com.github.jai-imageio:jai-imageio-core", "LICENSE.txt"),
      ),
    ).toBe(
      "https://github.com/jai-imageio/jai-imageio-core/blob/master/LICENSE.txt",
    );
    expect(
      resolveModuleLicenseUrl(
        dependency(
          "com.github.jai-imageio:jai-imageio-jpeg2000",
          "LICENSE-JJ2000.txt, LICENSE-Sun.txt",
        ),
      ),
    ).toBe("https://github.com/jai-imageio/jai-imageio-jpeg2000/tree/master");
  });

  it("prefers the report URL when present", () => {
    expect(
      resolveModuleLicenseUrl({
        ...dependency("com.github.jai-imageio:jai-imageio-core"),
        moduleLicenseUrl: "https://example.com/license",
      }),
    ).toBe("https://example.com/license");
  });
});

describe("resolveModuleUrl", () => {
  it("links native components to their homepages", () => {
    expect(
      resolveModuleUrl(
        dependency("ICU (International Components for Unicode)"),
      ),
    ).toBe("https://icu.unicode.org/");
    expect(resolveModuleUrl(dependency("zstd"))).toBe(
      "https://facebook.github.io/zstd/",
    );
  });

  it("prefers the module URL, then the homepage, then the license URL", () => {
    expect(
      resolveModuleUrl({
        ...dependency("zstd"),
        moduleLicenseUrl: "https://example.com/license",
      }),
    ).toBe("https://facebook.github.io/zstd/");
    expect(
      resolveModuleUrl({
        ...dependency("unknown-module"),
        moduleLicenseUrl: "https://example.com/license",
      }),
    ).toBe("https://example.com/license");
    expect(resolveModuleUrl(dependency("unknown-module"))).toBeUndefined();
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

  it("keeps a versioned textless record instead of lending its version", () => {
    const result = dedupeDependencies([
      { ...dependency("PDFium", "BSD-3-Clause"), moduleVersion: "1.0" },
      dependency("PDFium", "BSD-3-Clause", "full text"),
    ]);
    expect(result).toHaveLength(2);
    const bare = result.find((row) => !row.moduleLicenseText);
    const text = result.find((row) => row.moduleLicenseText === "full text");
    expect(bare?.moduleVersion).toBe("1.0");
    expect(text?.moduleVersion).toBeUndefined();
  });

  it("attributes each version to the text it arrived with", () => {
    const result = dedupeDependencies([
      {
        ...dependency("PDFium", "BSD-3-Clause", "text A"),
        moduleVersion: "1.0",
      },
      {
        ...dependency("PDFium", "BSD-3-Clause", "text B"),
        moduleVersion: "2.0",
      },
    ]);
    expect(result).toHaveLength(2);
    expect(
      result.find((row) => row.moduleLicenseText === "text A")?.moduleVersion,
    ).toBe("1.0");
    expect(
      result.find((row) => row.moduleLicenseText === "text B")?.moduleVersion,
    ).toBe("2.0");
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
