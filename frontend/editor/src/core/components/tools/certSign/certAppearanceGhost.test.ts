import { describe, expect, it } from "vitest";
import {
  buildCertAppearanceGhostDataUrl,
  buildCertAppearanceGhostLines,
} from "@app/components/tools/certSign/certAppearanceGhost";

describe("buildCertAppearanceGhostLines", () => {
  it("uses form name and filled reason/location", () => {
    const lines = buildCertAppearanceGhostLines(
      {
        name: "Alice",
        reason: "Approved",
        location: "Berlin",
        showLogo: false,
      },
      "DATE",
    );

    expect(lines.map((l) => l.text)).toEqual([
      "Signed by Alice",
      "DATE",
      "Approved",
      "Berlin",
    ]);
    expect(lines.every((l) => !l.placeholder)).toBe(true);
  });

  it("uses placeholders when fields are empty", () => {
    const lines = buildCertAppearanceGhostLines(
      { name: "", reason: "", location: "", showLogo: false },
      "DATE",
    );

    expect(lines[0]).toEqual({
      text: "Signed by [certificate name]",
      placeholder: true,
    });
    expect(lines[2]?.placeholder).toBe(true);
    expect(lines[3]?.placeholder).toBe(true);
  });
});

describe("buildCertAppearanceGhostDataUrl", () => {
  it("returns an svg data url including filled fields", () => {
    const url = buildCertAppearanceGhostDataUrl({
      name: "Bob",
      reason: "Review",
      location: "NYC",
      showLogo: true,
    });

    expect(url.startsWith("data:image/svg+xml,")).toBe(true);
    const decoded = decodeURIComponent(url.slice("data:image/svg+xml,".length));
    expect(decoded).toContain("Signed by Bob");
    expect(decoded).toContain("Review");
    expect(decoded).toContain("NYC");
  });
});
