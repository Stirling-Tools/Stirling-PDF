import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
} from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import type { SourcesResponse } from "@portal/api/sources";
import { Sources } from "@portal/views/Sources";
import { UIProvider } from "@portal/contexts/UIContext";

// The view uses the shared query hooks and the embedded SourceModal reads
// useUI(), so wrap the query client + Mantine + the UI context.
const Providers = ({ children }: { children: ReactNode }) => (
  <PortalTestProviders>
    <UIProvider>{children}</UIProvider>
  </PortalTestProviders>
);

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: Providers });

// Deterministic i18n: keys returned verbatim.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const fetchSources = vi.fn();
const fetchSource = vi.fn();
vi.mock("@portal/api/sources", () => ({
  fetchSources: () => fetchSources(),
  fetchSource: (id: string) => fetchSource(id),
  createSource: vi.fn(),
  deleteSource: vi.fn(),
  isFolderAccessDeniedError: () => false,
}));

const fetchS3Connections = vi.fn();
vi.mock("@portal/api/integrations", () => ({
  fetchIntegrations: () => fetchS3Connections(),
  // Custom-API authoring is a server decision; these tests assert the default view.
  fetchIntegrationCapabilities: () => Promise.resolve({ customApi: false }),
  fetchS3Connections: () => fetchS3Connections(),
  deleteIntegration: vi.fn(),
}));

const RESPONSE: SourcesResponse = {
  kpis: [
    { value: 1, description: "" },
    { value: 1, description: "" },
    { value: 0, description: "" },
  ],
  sources: [
    {
      id: "editor",
      name: "Editor",
      type: "editor",
      status: "active",
      referenceCount: 0,
      referencingPolicies: [],
      config: [],
      docsTotal: 5,
      docs24h: 0,
      docs30d: 5,
    },
    {
      id: "src-1",
      name: "Claims intake",
      type: "folder",
      status: "active",
      referenceCount: 2,
      referencingPolicies: [],
      config: [{ label: "Directory", value: "/in" }],
      docsTotal: 1240,
      docs24h: 18,
      docs30d: 540,
    },
  ],
};

function renderView(initial = "/processor/sources") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/processor/sources" element={<Sources />} />
        <Route
          path="/processor/integrations"
          element={<div>integrations view</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Sources view", () => {
  beforeEach(() => {
    fetchSources.mockReset();
    fetchSources.mockResolvedValue(RESPONSE);
    fetchSource.mockReset();
    fetchSource.mockResolvedValue({
      id: "src-1",
      name: "Claims intake",
      type: "folder",
      options: { directory: "/in" },
      enabled: true,
    });
    fetchS3Connections.mockReset();
    fetchS3Connections.mockResolvedValue([]);
  });

  it("opens the edit modal on row click", async () => {
    renderView();
    fireEvent.click(await screen.findByText("Claims intake"));
    // The modal fetches the record and shows the configure form.
    expect(
      await screen.findByText("portal.sources.builder.save"),
    ).toBeInTheDocument();
    expect(fetchSource).toHaveBeenCalledWith("src-1");
  });

  it("opens the create modal from the connect button", async () => {
    renderView();
    await screen.findByText("Claims intake");
    fireEvent.click(
      screen.getAllByText("portal.sources.actions.connectSource")[0],
    );
    // Stage 1 of the modal: the connector catalogue with coming-soon entries.
    expect(
      await screen.findByText("portal.sources.types.sharepoint.label"),
    ).toBeInTheDocument();
  });

  it("opens the create modal on arrival with ?new=1", async () => {
    renderView("/processor/sources?new=1");
    expect(
      await screen.findByText("portal.sources.types.sharepoint.label"),
    ).toBeInTheDocument();
  });

  it("does not open the modal when the virtual editor row is clicked", async () => {
    renderView();
    fireEvent.click(
      await screen.findByText("portal.sources.types.editor.label"),
    );
    expect(fetchSource).not.toHaveBeenCalled();
    expect(
      screen.queryByText("portal.sources.builder.save"),
    ).not.toBeInTheDocument();
  });

  it("redirects the old connections tab to the integrations view", async () => {
    renderView("/processor/sources?tab=connections");
    expect(await screen.findByText("integrations view")).toBeInTheDocument();
  });

  it("hides the KPI strip and shows the empty state when only the editor exists", async () => {
    fetchSources.mockResolvedValue({
      kpis: RESPONSE.kpis,
      sources: [RESPONSE.sources[0]],
    });
    renderView();
    expect(
      await screen.findByText("portal.sources.empty.title"),
    ).toBeInTheDocument();
    expect(screen.queryByText("portal.sources.kpi.total")).toBeNull();
  });
});
