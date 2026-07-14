import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { SourcesResponse } from "@portal/api/sources";
import { Sources } from "@portal/views/Sources";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: MantineProvider });

// Deterministic i18n: keys returned verbatim.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const fetchSources = vi.fn();
vi.mock("@portal/api/sources", () => ({
  fetchSources: () => fetchSources(),
}));

const fetchS3Connections = vi.fn();
vi.mock("@portal/api/integrations", () => ({
  fetchS3Connections: () => fetchS3Connections(),
  deleteIntegration: vi.fn(),
}));

// The Agent Builder header action is a flavor seam; stub it to keep the test focused.
vi.mock("@portal/components/sources/AgentBuilderAction", () => ({
  AgentBuilderAction: () => null,
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
          path="/processor/sources/new"
          element={<div>source builder: new</div>}
        />
        <Route
          path="/processor/sources/:id"
          element={<div>source builder: edit</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Sources view", () => {
  beforeEach(() => {
    fetchSources.mockReset();
    fetchSources.mockResolvedValue(RESPONSE);
    fetchS3Connections.mockReset();
    fetchS3Connections.mockResolvedValue([]);
  });

  it("opens a source's own page on row click", async () => {
    renderView();
    fireEvent.click(await screen.findByText("Claims intake"));
    expect(await screen.findByText("source builder: edit")).toBeInTheDocument();
  });

  it("navigates to the create page from the connect button", async () => {
    renderView();
    await screen.findByText("Claims intake");
    fireEvent.click(screen.getByText("portal.sources.actions.connectSource"));
    expect(await screen.findByText("source builder: new")).toBeInTheDocument();
  });

  it("does not navigate when the virtual editor row is clicked", async () => {
    renderView();
    fireEvent.click(
      await screen.findByText("portal.sources.types.editor.label"),
    );
    // Still on the list: the builder stub never rendered.
    expect(screen.queryByText("source builder: edit")).not.toBeInTheDocument();
    expect(screen.getByText("Claims intake")).toBeInTheDocument();
  });

  it("shows the connections surface on the Connections tab", async () => {
    renderView();
    await screen.findByText("Claims intake");
    fireEvent.click(screen.getByText("portal.sources.tabs.connections"));
    // Empty connections list -> the connections empty state.
    expect(
      await screen.findByText("portal.connections.empty.title"),
    ).toBeInTheDocument();
    expect(fetchS3Connections).toHaveBeenCalled();
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
    expect(
      screen.queryByText("portal.sources.kpi.total"),
    ).not.toBeInTheDocument();
  });
});
