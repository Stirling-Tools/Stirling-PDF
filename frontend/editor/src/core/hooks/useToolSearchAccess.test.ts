// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { resolveToolSearchAccess } from "@app/hooks/useToolSearchAccess";
import type { ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import type { ToolAvailabilityMap } from "@app/hooks/useToolManagement";

const t = ((_key: string, fallback?: string) =>
  fallback ?? _key) as unknown as TFunction;

const Component = () => null;
const tool = (overrides: Partial<ToolRegistryEntry> = {}) =>
  ({
    name: "Repair",
    description: "",
    component: Component,
    ...overrides,
  }) as unknown as ToolRegistryEntry;

const resolve = (
  entry: ToolRegistryEntry,
  availability: ToolAvailabilityMap = {},
  unavailableFallback = false,
) =>
  resolveToolSearchAccess("repair", entry, availability, {
    premiumEnabled: false,
    unavailableFallback,
    t,
  });

describe("resolveToolSearchAccess", () => {
  it("opens an available tool normally", () => {
    expect(resolve(tool())).toEqual({ kind: "open" });
  });

  it("hides what the tool list hides", () => {
    expect(resolve(tool({ hiddenFromToolList: true }))).toEqual({
      kind: "hidden",
    });
    // No component and no link: a coming-soon placeholder.
    expect(resolve(tool({ component: null }))).toEqual({ kind: "hidden" });
  });

  it("disables what the tool list greys out, with the list's reason", () => {
    expect(
      resolve(tool(), {
        repair: { available: false, reason: "disabledByAdmin" },
      }),
    ).toEqual({
      kind: "disabled",
      message: "Disabled by server administrator:",
    });
    expect(
      resolve(tool(), {
        repair: { available: false, reason: "missingDependency" },
      }),
    ).toEqual({
      kind: "disabled",
      message: "Unavailable - required tool missing on server:",
    });
    expect(resolve(tool({ requiresPremium: true }))).toEqual({
      kind: "disabled",
      message: "Premium feature:",
    });
  });

  it("opens an unavailable tool where the host falls back to the cloud", () => {
    expect(
      resolve(
        tool(),
        { repair: { available: false, reason: "disabledByAdmin" } },
        true,
      ),
    ).toEqual({ kind: "openForced" });
  });

  it("keeps a tool disabled while its self-hosted server is offline", () => {
    expect(
      resolve(
        tool(),
        { repair: { available: false, reason: "selfHostedOffline" } },
        true,
      ),
    ).toEqual({
      kind: "disabled",
      message: "Requires your Stirling-PDF server (currently offline):",
    });
  });
});
