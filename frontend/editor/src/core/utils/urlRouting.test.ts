import { describe, expect, it } from "vitest";
import {
  parseToolRoute,
  presetFreeRoute,
  toolRoute,
} from "@app/utils/urlRouting";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";

const registry = {
  convert: { name: "Convert" },
  compress: { name: "Compress" },
} as unknown as ToolRegistry;

const at = (pathname: string, search = "") => ({ pathname, search });

describe("tool route presets", () => {
  it("reads a known ?preset= for the tool", () => {
    expect(
      parseToolRoute(registry, at("/convert", "?preset=pdf-to-png")),
    ).toMatchObject({ toolId: "convert", preset: "pdf-to-png" });
  });

  it("takes the preset an alias path implies", () => {
    expect(parseToolRoute(registry, at("/pdf-to-pdfa"))).toMatchObject({
      toolId: "convert",
      preset: "pdf-to-pdfa-2b",
    });
  });

  it("ignores a slug the tool doesn't have", () => {
    const route = parseToolRoute(registry, at("/convert", "?preset=nope"));
    expect(route.toolId).toBe("convert");
    expect(route.preset).toBeUndefined();
    expect(
      parseToolRoute(registry, at("/compress", "?preset=pdf-to-png")).preset,
    ).toBeUndefined();
  });

  it("never carries a preset onto the next address", () => {
    const from = at("/convert", "?preset=pdf-to-png&lang=de");
    expect(toolRoute("compress", registry, from)).toBe("/compress?lang=de");
    expect(presetFreeRoute(from)).toBe("/convert?lang=de");
    expect(presetFreeRoute(at("/convert"))).toBeNull();
  });
});
