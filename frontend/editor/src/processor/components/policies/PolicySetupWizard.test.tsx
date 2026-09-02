import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { ProcessorTestProviders } from "@processor/test/TestQueryProvider";
import { PolicySetupWizard } from "@processor/components/policies/PolicySetupWizard";
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  type CatalogueEntry,
  type DecoratedPolicy,
  type PolicySetupResult,
  type PipelineStep,
} from "@processor/api/policies";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: ProcessorTestProviders });

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

const fetchIntegrations = vi.fn();
vi.mock("@processor/api/integrations", () => ({
  fetchIntegrations: () => fetchIntegrations(),
}));

const SAVE_CHANGES = "processor.policies.wizard.actions.saveChanges";
const ENABLE = "processor.policies.wizard.actions.enablePolicy";

const security = POLICY_CATEGORIES.find((c) => c.id === "security")!;
const securityConfig = POLICY_CONFIG.security;
const compliance = POLICY_CATEGORIES.find((c) => c.id === "compliance")!;
const complianceConfig = POLICY_CONFIG.compliance;

const PURVIEW_LABEL = "Apply a Microsoft Purview sensitivity label";

function editEntry(steps: PipelineStep[]): CatalogueEntry {
  const policy: DecoratedPolicy = {
    category: security,
    config: securityConfig,
    state: {
      configured: true,
      status: "active",
      required: true,
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

/** Submit the single-page wizard. */
async function submitWizard(saveLabel: string) {
  fireEvent.click(await screen.findByRole("button", { name: saveLabel }));
}

describe("PolicySetupWizard", () => {
  beforeEach(() => {
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
      <PolicySetupWizard
        entry={entry}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        onCustomise={vi.fn()}
      />,
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

  it("preserves stored sources and unmodelled options on save", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const entry = editEntry([
      { operation: "/api/v1/security/auto-redact", parameters: {} },
    ]);
    // A customised policy carries a stored source the wizard has no UI for and an editor-authored
    // blob the codec doesn't model. A wizard save must round-trip both, not silently drop them.
    entry.policy!.state.sources = ["src-contracts"];
    entry.policy!.state.extraOptions = { automation: { name: "x" } };

    render(
      <PolicySetupWizard
        entry={entry}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        onCustomise={vi.fn()}
      />,
    );
    await submitWizard(SAVE_CHANGES);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const result = onSubmit.mock.calls[0][1] as PolicySetupResult;
    expect(result.sources).toEqual(["src-contracts"]);
    expect(result.extraOptions).toEqual({ automation: { name: "x" } });
  });

  it("hides the Purview step when no Purview tenant is connected", async () => {
    fetchIntegrations.mockResolvedValue([]);
    const entry: CatalogueEntry = {
      category: compliance,
      config: complianceConfig,
      policy: null,
    };

    render(
      <PolicySetupWizard
        entry={entry}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onCustomise={vi.fn()}
      />,
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
      <PolicySetupWizard
        entry={entry}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onCustomise={vi.fn()}
      />,
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
      <PolicySetupWizard
        entry={entry}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        onCustomise={vi.fn()}
      />,
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

  it("defaults a new security policy to enforcing on export", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const entry: CatalogueEntry = {
      category: security,
      config: securityConfig,
      policy: null,
    };

    render(
      <PolicySetupWizard
        entry={entry}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        onCustomise={vi.fn()}
      />,
    );
    await submitWizard(ENABLE);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const result = onSubmit.mock.calls[0][1] as PolicySetupResult;
    expect(result.runOn).toBe("export");
  });
});
