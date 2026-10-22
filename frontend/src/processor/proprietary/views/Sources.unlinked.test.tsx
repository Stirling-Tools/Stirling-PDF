import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PortalViewProviders } from "@portal/test/TestQueryProvider";

/**
 * Connecting a source needs no Stirling account: the source is stored on this instance, and the
 * processing it feeds runs against the instance's own monthly grant. So neither the button nor the
 * `?new=1` deep link (how the Documents queue and the pipelines empty state arrive) asks for one.
 */
const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("@portal/hooks/useConnectGate", () => ({
  useConnectGate: () => ({
    gated: true,
    loading: false,
    available: true,
    connect,
    // Faithful to the real hook while gated, so re-guarding any of these actions fails the test
    // rather than passing through it.
    guard:
      <A extends unknown[]>(_action: (...args: A) => void) =>
      () =>
        connect(),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const fetchSources = vi.fn();
vi.mock("@portal/api/sources", () => ({
  fetchSources: () => fetchSources(),
  fetchSource: vi.fn(),
  createSource: vi.fn(),
  deleteSource: vi.fn(),
  isFolderAccessDeniedError: () => false,
}));
vi.mock("@portal/api/integrations", () => ({
  fetchIntegrations: () => Promise.resolve([]),
  fetchIntegrationCapabilities: () => Promise.resolve({ customApi: false }),
  fetchS3Connections: () => Promise.resolve([]),
  deleteIntegration: vi.fn(),
}));

import { Sources } from "@portal/views/Sources";

const EDITOR_ROW = {
  id: "editor",
  name: "Editor",
  type: "editor",
  status: "active",
  referenceCount: 0,
  referencingPolicies: [],
  config: [],
  docsTotal: 0,
  docs24h: 0,
  docs30d: 0,
};

const renderAt = (initial: string) =>
  render(
    <PortalViewProviders>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/processor/sources" element={<Sources />} />
        </Routes>
      </MemoryRouter>
    </PortalViewProviders>,
  );

describe("Sources on an instance with no Stirling account", () => {
  beforeEach(() => {
    connect.mockReset();
    fetchSources.mockReset();
    fetchSources.mockResolvedValue({ kpis: [], sources: [EDITOR_ROW] });
  });

  // Renders only once the fetch resolves, so finding it is also the await.
  const LIST = "portal.sources.table.source";
  const MODAL = "portal.sources.builder.createTitle";

  it("honours the create deep link rather than asking for an account", async () => {
    renderAt("/processor/sources?new=1");
    expect(await screen.findByText(LIST)).toBeInTheDocument();
    expect(await screen.findByText(MODAL)).toBeInTheDocument();
    expect(connect).not.toHaveBeenCalled();
  });

  it("leaves the page looking exactly as it always does", async () => {
    renderAt("/processor/sources");
    expect(await screen.findByText(LIST)).toBeInTheDocument();
    expect(connect).not.toHaveBeenCalled();
  });
});
