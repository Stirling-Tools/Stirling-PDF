import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { PolicySetupWizard } from "@portal/components/policies/PolicySetupWizard";
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  type CatalogueEntry,
  type DecoratedPolicy,
  type PolicySetupResult,
  type PipelineStep,
} from "@portal/api/policies";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: MantineProvider });

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

const CONTINUE = "portal.policies.wizard.actions.continue";
const SAVE_CHANGES = "portal.policies.wizard.actions.saveChanges";
const ENABLE = "portal.policies.wizard.actions.enablePolicy";

const security = POLICY_CATEGORIES.find((c) => c.id === "security")!;
const securityConfig = POLICY_CONFIG.security;

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
});
