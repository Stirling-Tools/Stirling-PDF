// @vitest-environment node
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
    {
      section: "general",
      anchor: "account",
      labelKey: "account.accountSettings",
      labelFallback: "Account",
      keywords: ["password"],
      requiresAccountCard: true,
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
      adminArea: true,
    },
    {
      key: "teams",
      labelKey: "settings.teams.title",
      labelFallback: "Team",
      keywords: ["team"],
      requiresAccount: true,
    },
    {
      key: "billing",
      labelKey: "portal.nav.usage",
      labelFallback: "Usage & Billing",
      keywords: ["wallet"],
      adminArea: true,
      requiresOrgOwner: true,
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
  rankFileResults,
  rankSettingsResults,
  rankToolResults,
} from "@app/hooks/useSuperSearch";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { ToolSearchAccess } from "@app/hooks/useToolSearchAccess";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";

const t = ((key: string, fallback?: string) =>
  fallback ?? key) as unknown as TFunction;

describe("useSuperSearch helpers", () => {
  it("omits hidden tools and marks disabled ones with their reason", () => {
    const registry = {
      repair: { name: "Repair", description: "Fix a broken PDF" },
      rotate: { name: "Rotate", description: "Turn pages" },
      automate: { name: "Automate", description: "Run a repair pipeline" },
    } as unknown as Partial<ToolRegistry>;
    const accessById: Record<string, ToolSearchAccess> = {
      repair: {
        kind: "disabled",
        message: "Disabled by server administrator:",
      },
      rotate: { kind: "open" },
      automate: { kind: "hidden" },
    };
    const openTool = vi.fn();

    const results = rankToolResults(
      registry,
      "repair",
      openTool,
      (id) => accessById[id],
    );

    expect(results.map((result) => result.key)).toEqual(["tool:repair"]);
    expect(results[0].disabledReason).toBe("Disabled by server administrator:");
    expect(results[0].subtitle).toBe(
      "Disabled by server administrator: Fix a broken PDF",
    );
    results[0].onSelect();
    expect(openTool).toHaveBeenCalledWith("repair", accessById.repair);
  });

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
    expect(rankSettingsResults("team", t, null, vi.fn())).toEqual([]);
  });

  it("respects showSettingsWhenNoLogin for the no-login admin preview", () => {
    const noLoginGates = { isAdmin: false, loginEnabled: false };

    // Default (flag unset / true): no-login mode keeps the admin preview.
    const shown = rankSettingsResults("admin", t, noLoginGates, vi.fn());
    expect(shown.map((result) => result.key)).toEqual([
      "setting-section:admin",
    ]);

    // Flag off: the modal hides admin sections, so search must too.
    const hidden = rankSettingsResults(
      "admin",
      t,
      { ...noLoginGates, showSettingsWhenNoLogin: false },
      vi.fn(),
    );
    expect(hidden).toEqual([]);

    // Admins keep admin sections regardless of the flag.
    const admin = rankSettingsResults(
      "admin",
      t,
      { isAdmin: true, loginEnabled: true, showSettingsWhenNoLogin: false },
      vi.fn(),
    );
    expect(admin.map((result) => result.key)).toEqual([
      "setting-section:admin",
    ]);
  });

  it("links the account row only where the account card renders", () => {
    const gates = { isAdmin: false, loginEnabled: true };
    expect(
      rankSettingsResults("password", t, gates, vi.fn()).map((r) => r.key),
    ).not.toContain("setting:general:account");
    expect(
      rankSettingsResults(
        "password",
        t,
        { ...gates, accountCardShown: true },
        vi.fn(),
      ).map((r) => r.key),
    ).toContain("setting:general:account");
  });

  it("offers billing to the organization owner, not every admin", () => {
    const admin = { isAdmin: true, loginEnabled: true };
    expect(rankSettingsResults("wallet", t, admin, vi.fn())).toEqual([]);
    expect(
      rankSettingsResults(
        "wallet",
        t,
        { ...admin, isOrgOwner: true },
        vi.fn(),
      ).map((r) => r.key),
    ).toEqual(["setting-section:billing"]);
  });

  it("lists a file whose data is lost but won't open it", () => {
    const openFile = vi.fn();
    const [lost] = rankFileResults(
      [
        {
          id: "f1",
          name: "Invoice2024.pdf",
          type: "application/pdf",
          dataUnavailable: true,
        } as unknown as StirlingFileStub,
      ],
      "2024",
      openFile,
      "File data is unavailable",
    );
    expect(lost.disabledReason).toBe("File data is unavailable");
    lost.onSelect();
    expect(openFile).not.toHaveBeenCalled();
  });

  it("hides account-bound settings from anonymous sessions", () => {
    const anonymous = rankSettingsResults(
      "team",
      t,
      { isAdmin: false, loginEnabled: true, isAnonymous: true },
      vi.fn(),
    );
    expect(anonymous).toEqual([]);

    const signedIn = rankSettingsResults(
      "team",
      t,
      { isAdmin: false, loginEnabled: true, isAnonymous: false },
      vi.fn(),
    );
    expect(signedIn.map((result) => result.key)).toEqual([
      "setting-section:teams",
    ]);

    // Hosts that omit the flag (portal, always signed-in) keep the section.
    const flagless = rankSettingsResults(
      "team",
      t,
      { isAdmin: false, loginEnabled: true },
      vi.fn(),
    );
    expect(flagless.map((result) => result.key)).toEqual([
      "setting-section:teams",
    ]);
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
