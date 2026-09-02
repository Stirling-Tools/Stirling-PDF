import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (
        key: string,
        fallbackOrOptions?: string | Record<string, unknown>,
      ) => {
        if (key === "processor.policies.defaultName") {
          return `${(fallbackOrOptions as Record<string, unknown>)?.category as string} Policy`;
        }
        if (typeof fallbackOrOptions === "string") return fallbackOrOptions;
        const labels: Record<string, string> = {
          "processor.nav.users": "Users",
          "processor.nav.policies": "Policies",
          "processor.nav.pipelines": "Pipelines",
          "processor.nav.sources": "Sources",
          "processor.nav.editor": "Editor",
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

vi.mock("@processor/contexts/TierContext", () => ({
  useTier: vi.fn(() => ({
    tier: "pro",
  })),
}));

const mockOpenSettings = vi.fn();
vi.mock("@processor/contexts/UIContext", () => ({
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
      labelKey: "processor.nav.users",
      labelFallback: "Users",
      path: "/portal/users",
      keywords: ["members"],
    },
    {
      id: "policies",
      labelKey: "processor.nav.policies",
      labelFallback: "Policies",
      path: "/portal/policies",
      keywords: ["rules"],
    },
    {
      id: "pipelines",
      labelKey: "processor.nav.pipelines",
      labelFallback: "Pipelines",
      path: "/portal/pipelines",
      keywords: ["automation"],
    },
    {
      id: "sources",
      labelKey: "processor.nav.sources",
      labelFallback: "Sources",
      path: "/portal/sources",
      keywords: ["connectors"],
    },
    {
      id: "docs",
      labelKey: "processor.nav.docs",
      labelFallback: "Documentation",
      path: "/portal/docs",
      keywords: ["docs"],
    },
  ],
  // Tests run as an org admin; per-scope access gating has its own coverage
  // in the stubbed suite.
  isPortalEntityScopeAccessible: () => true,
}));

// The roster is fetched through the flavor-resolved usersBackend (the same
// path the shared users query uses), not @processor/api/users directly.
vi.mock("@app/processor/usersBackend", () => ({
  usersBackend: {
    fetchUsers: vi.fn(),
  },
}));

// Keep the real (pure) assemblePolicies; only the network fetchers are mocked.
vi.mock("@processor/api/policies", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@processor/api/policies")>()),
  fetchPoliciesList: vi.fn(),
  fetchPolicyRuns: vi.fn(),
}));

vi.mock("@processor/api/pipelines", () => ({
  fetchPipelines: vi.fn(),
}));

vi.mock("@processor/api/sources", () => ({
  fetchSources: vi.fn(),
}));

import type { CatalogueEntry } from "@processor/api/policies";
import { fetchPoliciesList, fetchPolicyRuns } from "@processor/api/policies";
import type { PipelineView } from "@processor/api/pipelines";
import { fetchPipelines } from "@processor/api/pipelines";
import { fetchSources } from "@processor/api/sources";
import type { Member, UsersResponse } from "@processor/api/users";
import { usersBackend } from "@app/processor/usersBackend";
import {
  rankDocsResults,
  rankPortalPipelineResults,
  rankPortalPolicyResults,
} from "@processor/search/entitySearch";
import { useProcessorSearchResults } from "@processor/hooks/useProcessorSearchResults";

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
        required: false,
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
    required: false,
    icon: "",
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

function queryWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

describe("useProcessorSearchResults helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenSettings.mockReset();
    vi.mocked(usersBackend.fetchUsers).mockResolvedValue(makeUsersResponse([]));
    vi.mocked(fetchPoliciesList).mockResolvedValue([]);
    vi.mocked(fetchPolicyRuns).mockResolvedValue([]);
    vi.mocked(fetchPipelines).mockResolvedValue({ kpis: [], pipelines: [] });
    vi.mocked(fetchSources).mockResolvedValue({ kpis: [], sources: [] });
  });

  it("ranks configured policies under the policies group", () => {
    const openPolicy = vi.fn();
    const results = rankPortalPolicyResults(
      [makePolicyEntry()],
      "security policy",
      (key: string, options?: Record<string, unknown>) =>
        key === "processor.policies.defaultName"
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

  it("full-text searches the bundled docs, not just their titles", () => {
    const navigate = vi.fn();
    // "Tesseract" appears in the OCR doc body but in no doc title — a hit
    // whose snippet contains it proves content search.
    const results = rankDocsResults("Tesseract", navigate);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.subtitle).toMatch(/tesseract/i);

    void results[0]?.onSelect();
    expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/\/docs#./));
  });

  it("forwards portal settings row hits with their focus anchor", () => {
    const { result } = renderHook(
      () => useProcessorSearchResults("smtp", true, { scopeIds: ["settings"] }),
      { wrapper: queryWrapper() },
    );

    const settingHit = result.current.flatResults[0];
    expect(settingHit?.key).toBe("setting:email:smtp-host");

    void settingHit?.onSelect();
    expect(mockOpenSettings).toHaveBeenCalledWith("email", "smtp-host");
    expect(usersBackend.fetchUsers).not.toHaveBeenCalled();
  });

  it("fetches only the requested entity scope", async () => {
    vi.mocked(usersBackend.fetchUsers).mockResolvedValue(
      makeUsersResponse([makeMember({ id: "member-2", name: "Alice" })]),
    );

    const { result } = renderHook(
      () =>
        useProcessorSearchResults("alice", true, {
          scopeIds: ["portal-users"],
        }),
      { wrapper: queryWrapper() },
    );

    await waitFor(() =>
      expect(usersBackend.fetchUsers).toHaveBeenCalledTimes(1),
    );
    await waitFor(() => expect(result.current.loadingFiles).toBe(false));

    expect(fetchPoliciesList).not.toHaveBeenCalled();
    expect(fetchPipelines).not.toHaveBeenCalled();
    expect(fetchSources).not.toHaveBeenCalled();
    expect(result.current.groups.map((group) => group.id)).toEqual([
      "portal-users",
    ]);
  });

  it("reuses the in-flight query after close/reopen instead of sticking in loading", async () => {
    const firstUsers = createDeferred<UsersResponse>();
    vi.mocked(usersBackend.fetchUsers).mockImplementationOnce(
      () => firstUsers.promise,
    );

    const { result, rerender } = renderHook(
      ({ query }) =>
        useProcessorSearchResults(query, true, { scopeIds: ["portal-users"] }),
      {
        initialProps: { query: "alice" },
        wrapper: queryWrapper(),
      },
    );

    await waitFor(() => expect(result.current.loadingFiles).toBe(true));
    expect(usersBackend.fetchUsers).toHaveBeenCalledTimes(1);

    rerender({ query: "" });
    await waitFor(() => expect(result.current.loadingFiles).toBe(false));

    rerender({ query: "alice" });
    await waitFor(() => expect(result.current.loadingFiles).toBe(true));
    expect(usersBackend.fetchUsers).toHaveBeenCalledTimes(1);

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
