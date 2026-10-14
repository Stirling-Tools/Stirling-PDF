import type { Dependency } from "@app/components/shared/config/configSections/ThirdPartyLicensesSection";

interface LicenseDisplay {
  short: string;
  spdxId?: string;
  spdxIds?: string[];
}

// Exact names seen in the generated license report and the native NOTICE files,
// normalized by normalizeLicenseName. Anything not listed here keeps its full
// text: OR/AND compounds whose every part is known get one explainer link per
// part, while WITH/slash compounds and unknown names get none and are never
// silently rewritten.
const LICENSE_ALIASES: Record<string, LicenseDisplay> = {
  "apache 2": { short: "Apache-2.0", spdxId: "Apache-2.0" },
  "apache 2.0": { short: "Apache-2.0", spdxId: "Apache-2.0" },
  "apache license 2.0": { short: "Apache-2.0", spdxId: "Apache-2.0" },
  "apache license version 2.0": { short: "Apache-2.0", spdxId: "Apache-2.0" },
  "apache license, version 2.0": { short: "Apache-2.0", spdxId: "Apache-2.0" },
  "apache-2.0": { short: "Apache-2.0", spdxId: "Apache-2.0" },
  "the apache license, version 2.0": {
    short: "Apache-2.0",
    spdxId: "Apache-2.0",
  },
  "the apache software license, version 2.0": {
    short: "Apache-2.0",
    spdxId: "Apache-2.0",
  },
  mit: { short: "MIT", spdxId: "MIT" },
  "mit license": { short: "MIT", spdxId: "MIT" },
  "the mit license": { short: "MIT", spdxId: "MIT" },
  "mit-0": { short: "MIT-0", spdxId: "MIT-0" },
  // ISC is its own SPDX id, not a variant of MIT.
  isc: { short: "ISC", spdxId: "ISC" },
  "bsd 3-clause": { short: "BSD-3-Clause", spdxId: "BSD-3-Clause" },
  "bsd-3-clause": { short: "BSD-3-Clause", spdxId: "BSD-3-Clause" },
  "bsd 3 clause": { short: "BSD-3-Clause", spdxId: "BSD-3-Clause" },
  "bsd 3-clause license": { short: "BSD-3-Clause", spdxId: "BSD-3-Clause" },
  "the bsd 3-clause license (bsd3)": {
    short: "BSD-3-Clause",
    spdxId: "BSD-3-Clause",
  },
  // SPDX calls BSD-3-Clause the "New or Revised License", so the old name maps here.
  "revised bsd": { short: "BSD-3-Clause", spdxId: "BSD-3-Clause" },
  "bsd 2-clause": { short: "BSD-2-Clause", spdxId: "BSD-2-Clause" },
  "bsd-2-clause": { short: "BSD-2-Clause", spdxId: "BSD-2-Clause" },
  "bsd 2 clause": { short: "BSD-2-Clause", spdxId: "BSD-2-Clause" },
  "bsd 2-clause license": { short: "BSD-2-Clause", spdxId: "BSD-2-Clause" },
  // The "+" suffix means "or later", so "only" variants must not carry it.
  "gnu lesser general public license v2.0 only": {
    short: "LGPL-2.0",
    spdxId: "LGPL-2.0-only",
  },
  "gnu lesser general public license v2.0 or later": {
    short: "LGPL-2.0+",
    spdxId: "LGPL-2.0-or-later",
  },
  "gnu lesser general public license v2.1 only": {
    short: "LGPL-2.1",
    spdxId: "LGPL-2.1-only",
  },
  "gnu lesser general public license v2.1 or later": {
    short: "LGPL-2.1+",
    spdxId: "LGPL-2.1-or-later",
  },
  "lgpl-2.1-only": { short: "LGPL-2.1", spdxId: "LGPL-2.1-only" },
  "gnu lesser general public license v3.0 only": {
    short: "LGPL-3.0",
    spdxId: "LGPL-3.0-only",
  },
  "gnu lesser general public license v3.0 or later": {
    short: "LGPL-3.0+",
    spdxId: "LGPL-3.0-or-later",
  },
  "gnu general public license v2.0 only": {
    short: "GPL-2.0",
    spdxId: "GPL-2.0-only",
  },
  "gnu general public license v2.0 or later": {
    short: "GPL-2.0+",
    spdxId: "GPL-2.0-or-later",
  },
  "gnu general public license v3.0 only": {
    short: "GPL-3.0",
    spdxId: "GPL-3.0-only",
  },
  "gnu general public license v3.0 or later": {
    short: "GPL-3.0+",
    spdxId: "GPL-3.0-or-later",
  },
  "gpl2 w/ cpe": {
    short: "GPL-2.0 w/ Classpath",
    spdxId: "GPL-2.0-with-classpath-exception",
  },
  "gnu general public license, version 2 with the gnu classpath exception": {
    short: "GPL-2.0 w/ Classpath",
    spdxId: "GPL-2.0-with-classpath-exception",
  },
  "gnu affero general public license v3.0 only": {
    short: "AGPL-3.0",
    spdxId: "AGPL-3.0-only",
  },
  "gnu affero general public license v3.0 or later": {
    short: "AGPL-3.0+",
    spdxId: "AGPL-3.0-or-later",
  },
  "mozilla public license 2.0": { short: "MPL-2.0", spdxId: "MPL-2.0" },
  "mozilla public license version 2.0": {
    short: "MPL-2.0",
    spdxId: "MPL-2.0",
  },
  "mozilla public license, version 2.0": {
    short: "MPL-2.0",
    spdxId: "MPL-2.0",
  },
  "mozilla public license 2.0 (mpl-2.0)": {
    short: "MPL-2.0",
    spdxId: "MPL-2.0",
  },
  "mpl 2.0": { short: "MPL-2.0", spdxId: "MPL-2.0" },
  "mozilla public license 1.1": { short: "MPL-1.1", spdxId: "MPL-1.1" },
  "mpl 1.1": { short: "MPL-1.1", spdxId: "MPL-1.1" },
  "eclipse public license - v 2.0": { short: "EPL-2.0", spdxId: "EPL-2.0" },
  "eclipse public license, version 2.0": {
    short: "EPL-2.0",
    spdxId: "EPL-2.0",
  },
  "epl-2.0": { short: "EPL-2.0", spdxId: "EPL-2.0" },
  "common development and distribution license (cddl) version 1.0": {
    short: "CDDL-1.0",
    spdxId: "CDDL-1.0",
  },
  "public domain, per creative commons cc0": {
    short: "CC0-1.0",
    spdxId: "CC0-1.0",
  },
  "the w3c license": { short: "W3C", spdxId: "W3C" },
  // No SPDX page exists for the Bouncy Castle licence, so shorten the label only.
  "bouncy castle licence": { short: "BouncyCastle" },
  "freetype license / ftl": { short: "FTL", spdxId: "FTL" },
  "zlib license": { short: "Zlib", spdxId: "Zlib" },
  "libpng license": { short: "libpng", spdxId: "Libpng" },
  "libtiff license": { short: "libtiff", spdxId: "libtiff" },
  // Custom composite notices have no SPDX page; shorten the label only.
  "custom (ijg / bsd-style / zlib)": { short: "IJG / BSD / zlib" },
};

function normalizeLicenseName(license: string): string {
  return license.toLowerCase().replace(/\s+/g, " ").trim();
}

// SPDX expressions distinguish alternatives and exceptions, so anything the
// alias map does not know keeps its full text. Only top-level OR/AND splits
// qualify for per-part links: WITH names an exception on one license and "/"
// joins names reviewers asked to keep verbatim, so those stay linkless.
const COMPOUND_LICENSE_PATTERN = /\bor\b|\band\b|\bwith\b|\//i;
const OR_AND_SPLIT_PATTERN = /\s+\bor\b\s+|\s+\band\b\s+/i;

function compoundDisplay(full: string): LicenseDisplay {
  if (!OR_AND_SPLIT_PATTERN.test(full)) {
    return { short: full };
  }
  const ids: string[] = [];
  for (const part of full.split(OR_AND_SPLIT_PATTERN)) {
    const name = normalizeLicenseName(part);
    // Package metadata often parenthesizes SPDX expressions, so an exact
    // miss retries without grouping parens; the label keeps them verbatim.
    const alias =
      LICENSE_ALIASES[name] ??
      LICENSE_ALIASES[normalizeLicenseName(part.replace(/[()]/g, ""))];
    if (!alias?.spdxId) {
      return { short: full };
    }
    // Repeated alternatives link once; identical ids would also collide as keys.
    if (!ids.includes(alias.spdxId)) {
      ids.push(alias.spdxId);
    }
  }
  return { short: full, spdxIds: ids };
}

export function resolveLicenseDisplay(
  license: string | undefined,
  moduleName?: string,
): LicenseDisplay {
  const full = license || "-";
  const normalized = normalizeLicenseName(full);
  if (moduleName) {
    const override = MODULE_LICENSE_OVERRIDES.find(
      (entry) =>
        moduleName.startsWith(entry.modulePrefix) &&
        normalized === entry.license,
    );
    if (override) {
      return override.display;
    }
  }
  const alias = LICENSE_ALIASES[normalized];
  if (alias) {
    return alias;
  }
  if (COMPOUND_LICENSE_PATTERN.test(full)) {
    return compoundDisplay(full);
  }
  return { short: full };
}

export interface LicenseAboutLink {
  spdxId: string;
  short: string;
}

// A single license keeps its short label; a compound gets one link per part
// with the SPDX id as its own label, so no part hides behind another.
export function resolveAboutLinks(display: LicenseDisplay): LicenseAboutLink[] {
  if (display.spdxIds) {
    return display.spdxIds.map((spdxId) => ({ spdxId, short: spdxId }));
  }
  if (display.spdxId) {
    return [{ spdxId: display.spdxId, short: display.short }];
  }
  return [];
}

// A bare license name shared by unrelated projects cannot select an SPDX
// page on its own. TwelveMonkeys is the only carrier of "The BSD License" in
// the generated report and its LICENSE.txt is the BSD 3-clause text, so the
// override is scoped to that project's modules instead of the bare name.
const MODULE_LICENSE_OVERRIDES: Array<{
  modulePrefix: string;
  license: string;
  display: LicenseDisplay;
}> = [
  {
    modulePrefix: "com.twelvemonkeys",
    license: "the bsd license",
    display: { short: "BSD-3-Clause", spdxId: "BSD-3-Clause" },
  },
];

// License files the generated report leaves URL-less, keyed by exact module
// coordinate. Both locations verified against the jai-imageio GitHub org:
// the core repo holds LICENSE.txt on master, the jpeg2000 repo holds both
// named files at its root.
const MODULE_LICENSE_URLS: Record<string, string> = {
  "com.github.jai-imageio:jai-imageio-core":
    "https://github.com/jai-imageio/jai-imageio-core/blob/master/LICENSE.txt",
  "com.github.jai-imageio:jai-imageio-jpeg2000":
    "https://github.com/jai-imageio/jai-imageio-jpeg2000/tree/master",
};

export function resolveModuleLicenseUrl(
  dependency: Dependency,
): string | undefined {
  return (
    dependency.moduleLicenseUrl ||
    (dependency.moduleName
      ? MODULE_LICENSE_URLS[dependency.moduleName]
      : undefined)
  );
}

// Project homepages for entries carrying neither a module nor a license URL,
// keyed by the exact native notice title (or Maven coordinate).
const MODULE_HOMEPAGES: Record<string, string> = {
  PDFium: "https://pdfium.googlesource.com/pdfium/",
  QPDF: "https://github.com/qpdf/qpdf",
  libvips: "https://github.com/libvips/libvips",
  "GLib / GObject": "https://docs.gtk.org/glib/",
  libheif: "https://github.com/strukturag/libheif",
  "libjxl (JPEG XL reference implementation)":
    "https://github.com/libjxl/libjxl",
  libwebp: "https://developers.google.com/speed/webp",
  "libjpeg-turbo": "https://libjpeg-turbo.org/",
  libpng: "http://www.libpng.org/",
  libtiff: "http://www.libtiff.org/",
  FreeType: "https://freetype.org/",
  HarfBuzz: "https://harfbuzz.github.io/",
  "Little CMS (lcms2)": "https://www.littlecms.com/",
  "ICU (International Components for Unicode)": "https://icu.unicode.org/",
  zlib: "https://zlib.net/",
  zstd: "https://facebook.github.io/zstd/",
  "libde265 (H.265/HEVC decoder, used for HEIC decoding)":
    "https://github.com/strukturag/libde265",
  "Kvazaar (H.265/HEVC encoder, used for HEIC encoding on Linux/macOS)":
    "https://github.com/ultravideo/Kvazaar",
  "OpenJPEG (JPEG 2000 codec, used for JPEG2000-in-HEIF)":
    "https://www.openjpeg.org/",
  "com.github.jai-imageio:jai-imageio-core":
    "https://github.com/jai-imageio/jai-imageio-core",
  "com.github.jai-imageio:jai-imageio-jpeg2000":
    "https://github.com/jai-imageio/jai-imageio-jpeg2000",
};

export function resolveModuleUrl(dependency: Dependency): string | undefined {
  return (
    dependency.moduleUrl ||
    (dependency.moduleName
      ? MODULE_HOMEPAGES[dependency.moduleName]
      : undefined) ||
    dependency.moduleLicenseUrl
  );
}

export interface DependencyRow extends Dependency {
  rowId: string;
}

// The license report lists one row per resolved artifact, so the same module
// shows up at several versions; a notice names each module once per license.
// Versions aggregate only within records that already agree on everything else:
// a version is never borrowed onto a row carrying a different license text, and
// a textless record keeps its own versions instead of inventing a relationship.
export function dedupeDependencies(
  dependencies: Dependency[],
): DependencyRow[] {
  const byGroup = new Map<string, Dependency[]>();
  for (const dependency of dependencies) {
    // Tuple identity keeps ["ab", "c"] and ["a", "bc"] distinct.
    const key = JSON.stringify([
      (dependency.moduleName || "").toLowerCase(),
      (dependency.moduleLicense || "").toLowerCase(),
    ]);
    const group = byGroup.get(key);
    if (group) {
      group.push(dependency);
    } else {
      byGroup.set(key, [dependency]);
    }
  }
  const deduplicated: Dependency[] = [];
  for (const group of byGroup.values()) {
    interface VersionSlot {
      row: Dependency;
      versions: string[];
      seen: Set<string>;
    }
    const textSlots = new Map<string, VersionSlot>();
    let bare: VersionSlot | undefined;
    for (const dependency of group) {
      const slot = dependency.moduleLicenseText
        ? (() => {
            const existing = textSlots.get(dependency.moduleLicenseText);
            if (existing) return existing;
            const created: VersionSlot = {
              row: dependency,
              versions: [],
              seen: new Set(),
            };
            textSlots.set(dependency.moduleLicenseText, created);
            return created;
          })()
        : (bare ??= { row: dependency, versions: [], seen: new Set() });
      if (
        dependency.moduleVersion &&
        !slot.seen.has(dependency.moduleVersion)
      ) {
        slot.seen.add(dependency.moduleVersion);
        slot.versions.push(dependency.moduleVersion);
      }
    }
    for (const slot of [...textSlots.values(), ...(bare ? [bare] : [])]) {
      deduplicated.push(
        slot.versions.length > 0
          ? { ...slot.row, moduleVersion: slot.versions.join(", ") }
          : slot.row,
      );
    }
  }
  // Ordinal IDs stay stable while the underlying list is unchanged and never
  // collide however similar two texts are.
  return deduplicated
    .sort((a, b) => (a.moduleName || "").localeCompare(b.moduleName || ""))
    .map((dependency, index) => ({
      ...dependency,
      rowId: `license-row-${index}`,
    }));
}
