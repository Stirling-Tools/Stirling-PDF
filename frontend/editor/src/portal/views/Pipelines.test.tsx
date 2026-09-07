import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { PipelinesOverviewResponse, Policy } from "@portal/api/pipelines";
import { Pipelines } from "@portal/views/Pipelines";

/** The builder route: shows the draft handed in navigation state, so the Customise hand-off can be
 * asserted without rendering the real builder. */
function DraftProbe() {
  const draft = (useLocation().state as { draft?: Policy } | null)?.draft;
  return (
    <div>
      pipeline page
      <span data-testid="draft-icon">{draft?.icon ?? ""}</span>
      <span data-testid="draft-name">{draft?.name ?? ""}</span>
    </div>
  );
}

const render = (
  ui: Parameters<typeof baseRender>[0],
  options?: Parameters<typeof baseRender>[1],
) => baseRender(ui, { wrapper: PortalTestProviders, ...options });

vi.mock("@portal/hooks/useConnectGate", () => ({
  useConnectGate: () => ({
    gated: false,
    loading: false,
    available: false,
    connect: vi.fn(),
    guard: (fn: unknown) => fn,
  }),
}));

// Deterministic i18n: keys returned verbatim. initReactI18next/Trans are exported too because the
// unified page pulls in modules (the policy wizard/catalogue) that reference them at import time.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
  Trans: (props: { children?: unknown }) => props.children,
}));

const fetchPipelines = vi.fn();
const fetchPipeline = vi.fn();
const savePipeline = vi.fn();
vi.mock("@portal/api/pipelines", () => ({
  fetchPipelines: () => fetchPipelines(),
  fetchPipeline: (id: string) => fetchPipeline(id),
  savePipeline: (policy: unknown) => savePipeline(policy),
}));

// The template gallery is out of scope here: keep the catalogue empty so the test focuses on the
// pipelines list.
vi.mock("@portal/queries/policies", () => ({
  usePoliciesOverview: () => ({ data: null, loading: false, error: null }),
}));

const RESPONSE: PipelinesOverviewResponse = {
  kpis: [
    { value: 2, description: "" },
    { value: 2, description: "" },
    { value: 0, description: "" },
  ],
  pipelines: [
    {
      id: "plc-redaction",
      name: "Redaction sweep",
      enabled: true,
      required: false,
      icon: "security",
      status: "active",
      trigger: "schedule",
      sources: [{ id: "src-claims", name: "Claims intake" }],
      steps: ["/api/v1/security/auto-redact"],
      output: "inline",
      owner: "security@acme.com",
    },
  ],
};

function renderView(initial = "/processor/pipelines") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/processor/pipelines" element={<Pipelines />} />
        <Route
          path="/processor/pipelines/new"
          element={<div>builder new</div>}
        />
        <Route path="/processor/pipelines/:id" element={<DraftProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Pipelines view", () => {
  beforeEach(() => {
    fetchPipelines.mockReset();
    fetchPipelines.mockResolvedValue(RESPONSE);
    fetchPipeline.mockReset();
    // A plain pipeline (no template origin) - parseSimplePolicy returns null, so the row opens the
    // full builder page.
    fetchPipeline.mockResolvedValue({
      id: "plc-redaction",
      name: "Redaction sweep",
      enabled: true,
      inputs: [],
      steps: [{ operation: "/api/v1/security/auto-redact", parameters: {} }],
      output: { type: "inline", options: {} },
      outputIds: [],
    });
    savePipeline.mockReset();
    savePipeline.mockResolvedValue(undefined);
  });

  it("opens the builder when creating a pipeline", async () => {
    renderView();
    await screen.findByText("Redaction sweep");
    fireEvent.click(
      screen.getByText("portal.pipelines.actions.newCustomPipeline"),
    );
    expect(await screen.findByText("builder new")).toBeInTheDocument();
  });

  it("opens the full builder when a plain pipeline row is clicked", async () => {
    renderView();
    fireEvent.click(await screen.findByText("Redaction sweep"));
    expect(await screen.findByText("pipeline page")).toBeInTheDocument();
  });

  it("pausing re-saves the stored record verbatim, only flipping enabled", async () => {
    // Template-representable, so the row opens the simple detail panel (not the builder). It carries
    // first-class fields the decoded view drops - a custom name and an icon - which pausing must not
    // rewrite.
    const policy = {
      id: "plc-redaction",
      name: "My custom redaction",
      enabled: true,
      required: false,
      icon: "shield",
      inputs: [],
      steps: [{ operation: "/api/v1/security/auto-redact", parameters: {} }],
      output: { type: "inline", options: { categoryId: "security" } },
      outputIds: [],
      editor: { allowed: true, runOn: "upload" },
    };
    fetchPipeline.mockResolvedValue(policy);

    renderView();
    fireEvent.click(await screen.findByText("Redaction sweep"));
    fireEvent.click(
      await screen.findByText("portal.policies.detail.actions.pause"),
    );

    await waitFor(() => expect(savePipeline).toHaveBeenCalled());
    // The whole record round-trips with only `enabled` flipped: name and icon survive.
    expect(savePipeline).toHaveBeenCalledWith({ ...policy, enabled: false });
  });

  it("keeps the custom icon and name when customising from the wizard", async () => {
    const policy = {
      id: "plc-redaction",
      name: "My custom redaction",
      enabled: true,
      required: false,
      icon: "shield",
      inputs: [],
      steps: [{ operation: "/api/v1/security/auto-redact", parameters: {} }],
      output: { type: "inline", options: { categoryId: "security" } },
      outputIds: [],
      editor: { allowed: true, runOn: "export" },
    };
    fetchPipeline.mockResolvedValue(policy);

    renderView();
    fireEvent.click(await screen.findByText("Redaction sweep")); // open detail panel
    fireEvent.click(
      await screen.findByText("portal.policies.detail.actions.editSettings"),
    ); // open wizard
    fireEvent.click(
      await screen.findByText("portal.policies.wizard.actions.customise"),
    ); // hand off to the builder

    // The draft carried into the builder keeps the stored icon and name, not the category default.
    expect(await screen.findByTestId("draft-icon")).toHaveTextContent("shield");
    expect(screen.getByTestId("draft-name")).toHaveTextContent(
      "My custom redaction",
    );
  });

  it("shows the KPI stat boxes when pipelines exist", async () => {
    renderView();
    await screen.findByText("Redaction sweep");
    expect(screen.getByText("portal.pipelines.kpi.total")).toBeInTheDocument();
  });

  it("hides the stat boxes and shows create + connect-source CTAs when empty", async () => {
    fetchPipelines.mockResolvedValue({
      kpis: [
        { value: 0, description: "" },
        { value: 0, description: "" },
        { value: 0, description: "" },
      ],
      pipelines: [],
    });
    renderView();
    expect(
      await screen.findByText("portal.pipelines.empty.title"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.pipelines.empty.connectSource"),
    ).toBeInTheDocument();
    // The KPI strip is gone: no stat-box labels over an empty page.
    expect(
      screen.queryByText("portal.pipelines.kpi.total"),
    ).not.toBeInTheDocument();
  });
});
