import { describe, expect, it } from "vitest";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";
import type { StoreFinding } from "@portal/api/store";
import {
  findToolForOperation,
  formatCount,
  groupFindings,
  installTargetLabelKey,
  settingsSummary,
} from "@portal/components/store/storeTools";

// Only the fields the lookup reads; the rest of a registry entry is irrelevant here.
const registry = {
  compress: {
    name: "Compress",
    operationConfig: { endpoint: "/api/v1/misc/compress-pdf" },
  },
  convert: {
    name: "Convert",
    operationConfig: {
      endpoint: () => "/api/v1/convert/pdf/img",
      endpoints: ["/api/v1/convert/pdf/img", "/api/v1/convert/img/pdf"],
    },
  },
} as unknown as Partial<ToolRegistry>;

const finding = (severity: StoreFinding["severity"]): StoreFinding => ({
  severity,
  code: `code-${severity}`,
  title: severity,
  detail: "",
  where: { kind: "details" },
});

describe("findToolForOperation", () => {
  it("matches a static endpoint exactly", () => {
    expect(
      findToolForOperation("/api/v1/misc/compress-pdf", registry)?.toolId,
    ).toBe("compress");
  });

  it("matches a dynamic tool through its declared endpoint set", () => {
    expect(
      findToolForOperation("/api/v1/convert/img/pdf", registry)?.toolId,
    ).toBe("convert");
  });

  it("returns null for an endpoint no tool models", () => {
    expect(findToolForOperation("/api/v1/misc/unknown", registry)).toBeNull();
  });
});

describe("groupFindings", () => {
  it("buckets by severity, preserving order within each bucket", () => {
    const grouped = groupFindings([
      finding("info"),
      finding("block"),
      finding("warn"),
      finding("block"),
    ]);
    expect(grouped.block).toHaveLength(2);
    expect(grouped.warn).toHaveLength(1);
    expect(grouped.info).toHaveLength(1);
  });

  it("returns empty buckets for no findings", () => {
    expect(groupFindings([])).toEqual({ block: [], warn: [], info: [] });
  });
});

describe("installTargetLabelKey", () => {
  it("installs to the team on the SaaS build and to this server otherwise", () => {
    expect(installTargetLabelKey(true)).toBe("portal.store.detail.installTeam");
    expect(installTargetLabelKey(false)).toBe(
      "portal.store.detail.installServer",
    );
  });
});

describe("formatCount", () => {
  it("compacts thousands and millions", () => {
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1234)).toBe("1.2k");
    expect(formatCount(2000)).toBe("2k");
    expect(formatCount(12345)).toBe("12k");
    expect(formatCount(1_200_000)).toBe("1.2M");
  });
});

describe("settingsSummary", () => {
  it("skips empty values, nested objects and installer-owned fields", () => {
    expect(
      settingsSummary(
        { level: 5, grayscale: false, note: "", nested: { a: 1 }, secret: "x" },
        new Set(["secret"]),
      ),
    ).toBe("level: 5, grayscale: false");
  });
});
