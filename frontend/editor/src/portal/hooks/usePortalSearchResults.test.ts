import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (
        key: string,
        fallbackOrOptions?: string | Record<string, unknown>,
      ) => {
        if (key === "portal.policies.defaultName") {
          return `${(fallbackOrOptions as Record<string, unknown>)?.category as string} Policy`;
        }
        if (typeof fallbackOrOptions === "string") return fallbackOrOptions;
        const labels: Record<string, string> = {
          "portal.nav.users": "Users",
          "portal.nav.policies": "Policies",
          "portal.nav.pipelines": "Pipelines",
          "portal.nav.sources": "Sources",
          "portal.nav.editor": "Editor",
          "superSearch.group.processor": "Processor",
          "superSearch.group.settings": "Settings",
          "superSearch.group.tools": "Tools",
          "settings.email.smtpHost": "SMTP host",
          "settings.email.title": "Email",
        };
        return labels[key] ?? key;
      },
    }),
  };
});

vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(() => vi.fn()),
}));

vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: vi.fn(() => ({
    config: {
      isAdmin: false,
      enableLogin: true,
    },
  })),
}));

vi.mock("@app/contexts/ToolRegistryContext", () => ({
  useToolRegistry: vi.fn(() => ({
    allTools: {},
  })),
}));

vi.mock("@portal/contexts/TierContext", () => ({
  useTier: vi.fn(() => ({
    tier: "pro",
  })),
}));

const mockOpenSettings = vi.fn();
vi.mock("@portal/contexts/UIContext", () => ({
  useUI: vi.fn(() => ({
    openSettings: mockOpenSettings,
  })),
}));

vi.mock("@app/data/toolsTaxonomy", () => ({
  getToolUrlPath: vi.fn((id: string) => `/tools/${id}`),
  isComingSoonTool: vi.fn(() => false),
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
      key: "email",
      labelKey: "settings.email.title",
      labelFallback: "Email",
      keywords: ["smtp", "email"],
      requiresLogin: true,
    },
  ],
}));

vi.mock("@app/data/settingsContentSearch", () => ({
  findSettingsContentMatch: vi.fn(() => null),
  buildMatchSnippet: vi.fn(() => ""),
}));

vi.mock("@app/data/processorSearchIndex", () => ({
  PROCESSOR_SEARCH_INDEX: [
    {
      id: "users",
      labelKey: "portal.nav.users",
      labelFallback: "Users",
      path: "/portal/users",
      keywords: ["members"],
    },
    {
      id: "policies",
      labelKey: "portal.nav.policies",
      labelFallback: "Policies",
      path: "/portal/policies",
      keywords: ["rules"],
    },
    {
      id: "pipelines",
      labelKey: "portal.nav.pipelines",
      labelFallback: "Pipelines",
      path: "/portal/pipelines",
      keywords: ["automation"],
    },
    {
      id: "sources",
      labelKey: "portal.nav.sources",
      labelFallback: "Sources",
      path: "/portal/sources",
      keywords: ["connectors"],
    },
  ],
}));

vi.mock("@portal/api/users", () => ({
  fetchUsers: vi.fn(),
}));

vi.mock("@portal/api/policies", () => ({
  fetchPolicies: vi.fn(),
}));

vi.mock("@portal/api/pipelines", () => ({
  fetchPipelines: vi.fn(),
}));

vi.mock("@portal/api/sources", () => ({
  fetchSources: vi.fn(),
}));

import type { CatalogueEntry } from "@portal/api/policies";
import { fetchPolicies } from "@portal/api/policies";
import type { PipelineView } from "@portal/api/pipelines";
import { fetchPipelines } from "@portal/api/pipelines";
import { fetchSources } from "@portal/api/sources";
import type { Member, UsersResponse } from "@portal/api/users";
import { fetchUsers } from "@portal/api/users";
import {
  rankPortalPipelineResults,
  rankPortalPolicyResults,
} from "@portal/search/entitySearch";
import { usePortalSearchResults } from "@portal/hooks/usePortalSearchResults";

function makePolicyEntry(overrides?: Partial<CatalogueEntry>): CatalogueEntry {
  return {
    category: {
      id: "security",
      label: "Security",
      tone: "purple",
      desc: "Protect sensitive documents",
    },
    config: {
      summary: "",
      rules: [],
      scopeLabel: "",
      fields: [],
      defaultOperations: [],
    },
    policy: {
      category: {
        id: "security",
        label: "Security",
        tone: "purple",
        desc: "Protect sensitive documents",
      },
      config: {
        summary: "",
        rules: [],
        scopeLabel: "",
        fields: [],
        defaultOperations: [],
      },
      state: {
        configured: true,
        status: "active",
        sources: [],
        scopeTypes: [],
        reviewerEmail: "",
        fieldValues: {},
        backendId: "policy-security",
      },
      steps: [],
      stats: {
        enforced: 0,
        dataProcessed: "0 B",
        activeFor: "0d",
      },
      activity: [],
    },
    ...overrides,
  };
}

function makePipelineView(
  id: string,
  name: string,
  trigger = "manual",
): PipelineView {
  return {
    id,
    name,
    enabled: true,
    status: "active",
    trigger,
    sources: [],
    steps: [],
    output: "inline",
    owner: "alice",
  };
}

function makeMember(overrides?: Partial<Member>): Member {
  return {
    id: "member-1",
    name: "Alice Admin",
    email: "alice@example.com",
    role: "admin",
    status: "active",
    lastActive: "1m ago",
    ...overrides,
  };
}

function makeUsersResponse(members: Member[]): UsersResponse {
  return {
    summary: {
      totalMembers: members.length,
      pendingInvites: 0,
      seatsUsed: members.length,
      seatLimit: null,
    },
    members,
    roles: [],
    access: {
      tier: "pro",
      seatsUsed: members.length,
      seatLimit: null,
    },
    mailEnabled: true,
    emailInvitesEnabled: true,
  };
}

function createDeferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve: (value: T) => resolve?.(value),
    reject: (reason?: unknown) => reject?.(reason),
  };
}

describe("usePortalSearchResults helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenSettings.mockReset();
    vi.mocked(fetchUsers).mockResolvedValue(makeUsersResponse([]));
    vi.mocked(fetchPolicies).mockResolvedValue({
      summary: {
        active: 0,
        paused: 0,
        categories: 0,
        docsEnforced: 0,
      },
      catalogue: [],
    });
    vi.mocked(fetchPipelines).mockResolvedValue({ kpis: [], pipelines: [] });
    vi.mocked(fetchSources).mockResolvedValue({ kpis: [], sources: [] });
  });

  it("ranks configured policies under the policies group", () => {
    const openPolicy = vi.fn();
    const results = rankPortalPolicyResults(
      [makePolicyEntry()],
      "security policy",
      (key: string, options?: Record<string, unknown>) =>
        key === "portal.policies.defaultName"
          ? `${options?.category as string} Policy`
          : key,
      openPolicy,
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      key: "portal-policy:security",
      group: "portal-policies",
      title: "Security Policy",
    });

    void results[0]?.onSelect();
    expect(openPolicy).toHaveBeenCalledWith("security");
  });

  it("filters policy-backed records out of the pipelines group", () => {
    const openPipeline = vi.fn();
    const results = rankPortalPipelineResults(
      [
        makePipelineView("policy-security", "Security Policy"),
        makePipelineView("custom-pipeline", "Nightly OCR"),
      ],
      "nightly",
      new Set(["policy-security"]),
      openPipeline,
    );

    expect(results.map((result) => result.key)).toEqual([
      "portal-pipeline:custom-pipeline",
    ]);
  });

  it("forwards portal settings row hits with their focus anchor", () => {
    const { result } = renderHook(() =>
      usePortalSearchResults("smtp", true, { scopeIds: ["settings"] }),
    );

    const settingHit = result.current.flatResults[0];
    expect(settingHit?.key).toBe("setting:email:smtp-host");

    void settingHit?.onSelect();
    expect(mockOpenSettings).toHaveBeenCalledWith("email", "smtp-host");
    expect(fetchUsers).not.toHaveBeenCalled();
  });

  it("fetches only the requested entity scope", async () => {
    vi.mocked(fetchUsers).mockResolvedValue(
      makeUsersResponse([makeMember({ id: "member-2", name: "Alice" })]),
    );

    const { result } = renderHook(() =>
      usePortalSearchResults("alice", true, { scopeIds: ["portal-users"] }),
    );

    await waitFor(() => expect(fetchUsers).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.loadingFiles).toBe(false));

    expect(fetchPolicies).not.toHaveBeenCalled();
    expect(fetchPipelines).not.toHaveBeenCalled();
    expect(fetchSources).not.toHaveBeenCalled();
    expect(result.current.groups.map((group) => group.id)).toEqual([
      "portal-users",
    ]);
  });

  it("reuses the in-flight query after close/reopen instead of sticking in loading", async () => {
    const firstUsers = createDeferred<UsersResponse>();
    vi.mocked(fetchUsers).mockImplementationOnce(() => firstUsers.promise);

    const { result, rerender } = renderHook(
      ({ query }) =>
        usePortalSearchResults(query, true, { scopeIds: ["portal-users"] }),
      {
        initialProps: { query: "alice" },
      },
    );

    await waitFor(() => expect(result.current.loadingFiles).toBe(true));
    expect(fetchUsers).toHaveBeenCalledTimes(1);

    rerender({ query: "" });
    await waitFor(() => expect(result.current.loadingFiles).toBe(false));

    rerender({ query: "alice" });
    await waitFor(() => expect(result.current.loadingFiles).toBe(true));
    expect(fetchUsers).toHaveBeenCalledTimes(1);

    firstUsers.resolve(
      makeUsersResponse([
        makeMember({ id: "member-3", name: "Alice Reloaded" }),
      ]),
    );

    await waitFor(() => expect(result.current.loadingFiles).toBe(false));
    expect(result.current.groups.map((group) => group.id)).toEqual([
      "portal-users",
    ]);
  });
});
