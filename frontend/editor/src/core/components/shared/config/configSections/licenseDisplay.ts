import type { Dependency } from "@app/components/shared/config/configSections/ThirdPartyLicensesSection";

interface LicenseDisplay {
  short: string;
  spdxId?: string;
}

// Exact names seen in the generated license report and the native NOTICE files,
// normalized by normalizeLicenseName. Anything not listed here keeps its full
// text and gets no explainer link, so compound expressions (OR/AND/WITH) and
// unknown names are never silently rewritten.
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
  "mit/old mit license": { short: "MIT", spdxId: "MIT" },
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
  "unicode license / icu license": { short: "ICU", spdxId: "ICU" },
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
// alias map does not know keeps its full text and gets no explainer link.
const COMPOUND_LICENSE_PATTERN = /\bor\b|\band\b|\bwith\b|\//i;

export function resolveLicenseDisplay(
  license: string | undefined,
): LicenseDisplay {
  const full = license || "-";
  const alias = LICENSE_ALIASES[normalizeLicenseName(full)];
  if (alias) {
    return alias;
  }
  if (COMPOUND_LICENSE_PATTERN.test(full)) {
    return { short: full };
  }
  return { short: full };
}

// Same name, version, and license can still carry different full texts, so
// rows are fingerprinted by text content; the hash keeps keys distinct
// without stuffing kilobytes of license text into React keys.
export function textFingerprint(text: string | undefined): string {
  if (!text) {
    return "notext";
  }
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return `text${(hash >>> 0).toString(16)}`;
}

// The license report lists one row per resolved artifact, so the same module
// shows up at several versions; a notice names each module once per license,
// and records carrying the full license text win over textless ones. Records
// with genuinely different texts are all kept, mirroring the backend merge.
export function dedupeDependencies(dependencies: Dependency[]): Dependency[] {
  const byGroup = new Map<string, Dependency[]>();
  for (const dependency of dependencies) {
    const key = [
      (dependency.moduleName || "").toLowerCase(),
      (dependency.moduleLicense || "").toLowerCase(),
    ].join("");
    const group = byGroup.get(key);
    if (group) {
      group.push(dependency);
    } else {
      byGroup.set(key, [dependency]);
    }
  }
  const deduplicated: Dependency[] = [];
  for (const group of byGroup.values()) {
    const withText: Dependency[] = [];
    const seenTexts = new Set<string>();
    let bare: Dependency | undefined;
    for (const dependency of group) {
      if (dependency.moduleLicenseText) {
        if (!seenTexts.has(dependency.moduleLicenseText)) {
          seenTexts.add(dependency.moduleLicenseText);
          withText.push(dependency);
        }
      } else {
        bare ??= dependency;
      }
    }
    deduplicated.push(...(withText.length > 0 ? withText : bare ? [bare] : []));
  }
  return deduplicated.sort((a, b) =>
    (a.moduleName || "").localeCompare(b.moduleName || ""),
  );
}
