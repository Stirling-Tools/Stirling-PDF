import React from "react";
import i18n from "i18next";
import { describe, expect, it, vi } from "vitest";

vi.mock("@editor/contexts/ViewerContext", () => ({
  ViewerContext: React.createContext(null),
}));
vi.mock("@editor/services/fileStorage", () => ({ fileStorage: {} }));
vi.mock("@editor/data/processorEntitySearch", () => ({
  useProcessorEntityGroups: vi.fn(),
}));
vi.mock("@editor/data/settingsContentSearch", () => ({
  findSettingsContentMatch: () => null,
  buildMatchSnippet: vi.fn(),
}));

import { rankSettingsResults } from "@editor/hooks/useSuperSearch";

describe("self-hosted Users settings search", () => {
  it.each([false, true])(
    "hides Users with login disabled and admin status = %s, even with the admin preview enabled",
    (isAdmin) => {
      const results = rankSettingsResults(
        "users",
        i18n.t,
        { isAdmin, loginEnabled: false, showSettingsWhenNoLogin: true },
        vi.fn(),
      );

      expect(results.map((result) => result.key)).not.toContain(
        "setting-section:users",
      );
    },
  );

  it("keeps Users available to logged-in admins and opens the Users section", () => {
    const openSettings = vi.fn();
    const results = rankSettingsResults(
      "users",
      i18n.t,
      { isAdmin: true, loginEnabled: true },
      openSettings,
    );
    const users = results.find(
      (result) => result.key === "setting-section:users",
    );

    expect(users).toBeDefined();
    void users?.onSelect();
    expect(openSettings).toHaveBeenCalledWith("users");
  });

  it("hides Users from logged-in non-admins with Processor access", () => {
    const results = rankSettingsResults(
      "users",
      i18n.t,
      { isAdmin: false, loginEnabled: true, portalAccessible: true },
      vi.fn(),
    );

    expect(results.map((result) => result.key)).not.toContain(
      "setting-section:users",
    );
  });
});

describe("self-hosted MCP Server settings search", () => {
  it.each([
    [false, false],
    [true, true],
  ])("with MCP enabled = %s, offers MCP Server = %s", (mcpEnabled, offered) => {
    const results = rankSettingsResults(
      "chatgpt",
      i18n.t,
      { isAdmin: false, loginEnabled: true, mcpEnabled },
      vi.fn(),
    );

    expect(
      results.map((result) => result.key).includes("setting-section:mcp"),
    ).toBe(offered);
  });
});
