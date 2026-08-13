import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { PolicySetupWizard } from "@portal/components/policies/PolicySetupWizard";
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  type CatalogueEntry,
  type DecoratedPolicy,
  type PolicySetupResult,
  type PipelineStep,
} from "@portal/api/policies";

// The wizard navigates to the source builder, so it needs a router like the app's.
const Providers = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={["/"]}>
    <PortalTestProviders>{children}</PortalTestProviders>
  </MemoryRouter>
);

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: Providers });

// Deterministic i18n: return the fallback when given, else the key. initReactI18next is stubbed
// because the import graph pulls core/i18n.ts, which registers it as a plugin.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // Second arg is a string fallback in some call sites and an interpolation object in others;
    // only treat a string as the fallback.
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const fetchSources = vi.fn();
vi.mock("@portal/api/sources", () => ({
  fetchSources: () => fetchSources(),
}));

const fetchIntegrations = vi.fn();
vi.mock("@portal/api/integrations", () => ({
  fetchIntegrations: () => fetchIntegrations(),
}));

const CONTINUE = "portal.policies.wizard.actions.continue";
const SAVE_CHANGES = "portal.policies.wizard.actions.saveChanges";
const ENABLE = "portal.policies.wizard.actions.enablePolicy";

const security = POLICY_CATEGORIES.find((c) => c.id === "security")!;
const securityConfig = POLICY_CONFIG.security;
const compliance = POLICY_CATEGORIES.find((c) => c.id === "compliance")!;
const complianceConfig = POLICY_CONFIG.compliance;

const PURVIEW_LABEL = "Apply a Microsoft Purview sensitivity label";

/** Two connected sources, both writable, so they show as sources and destinations. */
const CONNECTED_SOURCES = [
  { id: "src-folder", name: "Inbox folder", type: "folder" },
  { id: "src-s3", name: "Archive bucket", type: "s3" },
].map((s) => ({
  ...s,
  status: "active" as const,
  referenceCount: 0,
  referencingPolicies: [],
  config: [],
  docsTotal: 0,
}));

function editEntry(steps: PipelineStep[]): CatalogueEntry {
  const policy: DecoratedPolicy = {
    category: security,
    config: securityConfig,
    state: {
      configured: true,
      status: "active",
      sources: ["editor"],
      scopeTypes: [],
      reviewerEmail: "",
      fieldValues: {},
      runOn: "upload",
      outputMode: "new_version",
      outputName: "",
      outputNamePosition: "suffix",
      maxRetries: 0,
      retryDelayMinutes: 0,
      backendId: "pol-1",
      isDefault: true,
    },
    steps,
    stats: { enforced: 0, dataProcessed: "-", activeFor: "-" },
    activity: [],
  };
  return { category: security, config: securityConfig, policy };
}

/** Advance the wizard from the workflow tab to the settings tab and submit. */
async function submitWizard(saveLabel: string) {
  fireEvent.click(await screen.findByRole("button", { name: CONTINUE }));
  fireEvent.click(await screen.findByRole("button", { name: saveLabel }));
}

describe("PolicySetupWizard", () => {
  beforeEach(() => {
    fetchSources.mockResolvedValue({ sources: [] });
    fetchIntegrations.mockResolvedValue([]);
  });

  it("round-trips a saved step's backend params on edit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const entry = editEntry([
      {
        operation: "/api/v1/security/auto-redact",
        parameters: { listOfText: "foo\nbar", useRegex: true },
      },
    ]);

    render(
      <PolicySetupWizard entry={entry} onClose={vi.fn()} onSubmit={onSubmit} />,
    );
    await submitWizard(SAVE_CHANGES);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const result = onSubmit.mock.calls[0][1] as PolicySetupResult;
    // Only the saved tool is enabled on edit, and its patterns survive the wire -> UI -> wire trip.
    expect(result.steps).toEqual([
      expect.objectContaining({
        operation: "/api/v1/security/auto-redact",
        parameters: expect.objectContaining({ listOfText: "foo\nbar" }),
      }),
    ]);
  });

  it("hides the Purview step when no Purview tenant is connected", async () => {
    fetchIntegrations.mockResolvedValue([]);
    const entry: CatalogueEntry = {
      category: compliance,
      config: complianceConfig,
      policy: null,
    };

    render(
      <PolicySetupWizard entry={entry} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );

    // Sanitize is in the same chain and always shows, so once it renders the chain has loaded.
    await screen.findByText("Strip active content");
    // The Purview option can only fail without a connection, so it is not offered at all.
    expect(screen.queryByText(PURVIEW_LABEL)).toBeNull();
  });

  it("offers the Purview step once a Purview connection exists", async () => {
    fetchIntegrations.mockResolvedValue([
      { id: 1, name: "Corp Purview", integrationType: "PURVIEW", config: {} },
    ]);
    const entry: CatalogueEntry = {
      category: compliance,
      config: complianceConfig,
      policy: null,
    };

    render(
      <PolicySetupWizard entry={entry} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );

    await waitFor(() =>
      expect(screen.getByText(PURVIEW_LABEL)).toBeInTheDocument(),
    );
  });

  it("seeds the preset chain for a new policy (redact + sanitize on, watermark off)", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const entry: CatalogueEntry = {
      category: security,
      config: securityConfig,
      policy: null,
    };

    render(
      <PolicySetupWizard entry={entry} onClose={vi.fn()} onSubmit={onSubmit} />,
    );
    await submitWizard(ENABLE);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const result = onSubmit.mock.calls[0][1] as PolicySetupResult;
    const endpoints = result.steps.map((s) => s.operation);
    expect(endpoints).toEqual([
      "/api/v1/security/auto-redact",
      "/api/v1/security/sanitize-pdf",
    ]);
    // Redact carries the preset PII patterns as the backend's listOfText.
    const redact = result.steps[0].parameters as { listOfText?: string };
    expect(redact.listOfText).toBeTruthy();
  });

  it("binds one source and one destination, matching the backend's cap", async () => {
    fetchSources.mockResolvedValue({ sources: CONNECTED_SOURCES });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const entry: CatalogueEntry = {
      category: security,
      config: securityConfig,
      policy: null,
    };
    // Each source appears twice on the settings tab: source tile, then destination tile.
    const tiles = (name: RegExp) => screen.getAllByRole("button", { name });

    render(
      <PolicySetupWizard entry={entry} onClose={vi.fn()} onSubmit={onSubmit} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: CONTINUE }));
    await screen.findAllByRole("button", { name: /Inbox folder/ });

    fireEvent.click(tiles(/Inbox folder/)[0]);
    // Picking a second source replaces the first rather than adding to it.
    fireEvent.click(tiles(/Archive bucket/)[0]);
    fireEvent.click(tiles(/Inbox folder/)[1]);
    fireEvent.click(tiles(/Archive bucket/)[1]);
    fireEvent.click(screen.getByRole("button", { name: ENABLE }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const result = onSubmit.mock.calls[0][1] as PolicySetupResult;
    expect(result.sources).toEqual(["editor", "src-s3"]);
    expect(result.outputIds).toEqual(["src-s3"]);
    // S3 has no watcher, so the bound source is swept on a schedule.
    expect(result.trigger?.type).toBe("schedule");
  });

  it("trims a legacy multi-source policy back to one on edit", async () => {
    fetchSources.mockResolvedValue({ sources: CONNECTED_SOURCES });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const entry = editEntry([
      { operation: "/api/v1/security/sanitize-pdf", parameters: {} },
    ]);
    entry.policy!.state.sources = ["editor", "src-folder", "src-s3"];
    entry.policy!.state.outputIds = ["src-folder", "src-s3"];

    render(
      <PolicySetupWizard entry={entry} onClose={vi.fn()} onSubmit={onSubmit} />,
    );
    await submitWizard(SAVE_CHANGES);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const result = onSubmit.mock.calls[0][1] as PolicySetupResult;
    expect(result.sources).toEqual(["editor", "src-folder"]);
    expect(result.outputIds).toEqual(["src-folder"]);
  });
});
