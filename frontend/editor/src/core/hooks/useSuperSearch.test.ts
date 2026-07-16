import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(),
}));

vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: vi.fn(),
}));

vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationActions: vi.fn(),
}));

vi.mock("@app/contexts/ViewerContext", () => ({
  ViewerContext: React.createContext(null),
}));

vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: vi.fn(),
}));

vi.mock("@app/contexts/file/fileHooks", () => ({
  useFileActions: vi.fn(),
}));

vi.mock("@app/auth/UseSession", () => ({
  useAuth: vi.fn(() => ({
    portalAccess: false,
    isAdmin: false,
    role: null,
  })),
}));

vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getLeafStirlingFileStubs: vi.fn(),
  },
}));

vi.mock("@app/data/settingsSearchIndex", () => ({
  SETTINGS_SEARCH_INDEX: [
    {
      section: "email",
      anchor: "smtp-host",
      labelKey: "settings.email.smtpHost",
      labelFallback: "SMTP host",
      keywords: ["smtp"],
    },
  ],
}));

vi.mock("@app/data/settingsSectionRegistry", () => ({
  SETTINGS_SECTION_REGISTRY: [
    {
      key: "general",
      labelKey: "settings.general.title",
      labelFallback: "General",
      keywords: ["general"],
    },
    {
      key: "email",
      labelKey: "settings.email.title",
      labelFallback: "Email",
      keywords: ["mail"],
      requiresLogin: true,
    },
    {
      key: "admin",
      labelKey: "settings.admin.title",
      labelFallback: "Admin",
      keywords: ["admin"],
      requiresLogin: true,
      adminArea: true,
    },
  ],
}));

vi.mock("@app/data/settingsContentSearch", () => ({
  findSettingsContentMatch: vi.fn((section: string, query: string) => {
    if (query === "smtp" && (section === "general" || section === "email")) {
      return { section, query };
    }
    return null;
  }),
  buildMatchSnippet: vi.fn(
    (_match: unknown, query: string) => `Match: ${query}`,
  ),
}));

vi.mock("@app/data/processorSearchIndex", () => ({
  PROCESSOR_SEARCH_INDEX: [
    {
      id: "users",
      labelKey: "superSearch.processor.users",
      labelFallback: "Users",
      path: "/users",
      keywords: ["members"],
    },
    {
      id: "docs",
      labelKey: "superSearch.processor.docs",
      labelFallback: "Docs",
      path: "",
      externalUrl: "https://example.com/docs",
      keywords: ["manual"],
    },
  ],
}));

import type { TFunction } from "i18next";
import {
  assembleSuperSearchGroups,
  rankProcessorResults,
  rankSettingsResults,
} from "@app/hooks/useSuperSearch";

const t = ((key: string, fallback?: string) =>
  fallback ?? key) as unknown as TFunction;

describe("useSuperSearch helpers", () => {
  it("drops empty groups and preserves the requested group order", () => {
    const groups = assembleSuperSearchGroups(
      {
        tools: [
          {
            key: "tool:rotate",
            group: "tools",
            title: "Rotate",
            score: 60,
            onSelect: vi.fn(),
          },
        ],
        processor: [
          {
            key: "processor:users",
            group: "processor",
            title: "Users",
            score: 70,
            onSelect: vi.fn(),
          },
        ],
      },
      t,
      ["processor", "settings", "tools", "files"],
    );

    expect(groups.map((group) => group.id)).toEqual(["processor", "tools"]);
    expect(groups.map((group) => group.label)).toEqual(["Processor", "Tools"]);
  });

  it("prefers row-level setting hits and skips duplicate content matches", () => {
    const openSettings = vi.fn();

    const results = rankSettingsResults(
      "smtp",
      t,
      {
        isAdmin: false,
        loginEnabled: true,
      },
      openSettings,
    );

    expect(results.map((result) => result.key)).toEqual([
      "setting:email:smtp-host",
      "setting-content:general",
    ]);

    void results[0]?.onSelect();
    expect(openSettings).toHaveBeenCalledWith("email", "smtp-host");
  });

  it("keeps gated settings hidden while app config is unresolved", () => {
    const results = rankSettingsResults("admin", t, null, vi.fn());

    expect(results).toEqual([]);
  });

  it("keeps the Processor group closed until gates resolve, then opens it for single-user mode", () => {
    const selectEntry = vi.fn();

    expect(rankProcessorResults("members", t, null, selectEntry)).toEqual([]);

    const results = rankProcessorResults(
      "members",
      t,
      {
        isAdmin: false,
        loginEnabled: false,
      },
      selectEntry,
    );

    expect(results.map((result) => result.key)).toEqual(["processor:users"]);

    void results[0]?.onSelect();
    expect(selectEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: "users", path: "/users" }),
    );
  });

  it("opens the Processor group for a user with explicit portal access", () => {
    const results = rankProcessorResults(
      "members",
      t,
      {
        isAdmin: false,
        loginEnabled: true,
        portalAccessible: true,
      },
      vi.fn(),
    );

    expect(results.map((result) => result.key)).toEqual(["processor:users"]);
  });
});
