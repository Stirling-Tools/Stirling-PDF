import React from "react";
import i18n from "i18next";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/contexts/ViewerContext", () => ({
  ViewerContext: React.createContext(null),
}));
vi.mock("@app/services/fileStorage", () => ({ fileStorage: {} }));
vi.mock("@app/data/processorEntitySearch", () => ({
  useProcessorEntityGroups: vi.fn(),
}));
vi.mock("@app/data/settingsContentSearch", () => ({
  findSettingsContentMatch: () => null,
  buildMatchSnippet: vi.fn(),
}));

import { rankSettingsResults } from "@app/hooks/useSuperSearch";

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
