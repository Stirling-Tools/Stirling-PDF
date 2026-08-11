import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PortalViewProviders } from "@portal/test/TestQueryProvider";

/**
 * The deep link into the create flow, which is the hole the first attempt at this left open.
 *
 * `?new=1` opens the modal from an effect rather than through the click handler, so guarding
 * openCreate did nothing for it. Both the Documents review queue and the pipelines empty state
 * arrive here that way, and each was a way past the gate.
 */
const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
const gate = { gated: true };

vi.mock("@portal/hooks/useConnectGate", () => ({
  useConnectGate: () => ({
    gated: gate.gated,
    loading: false,
    available: true,
    connect,
    guard:
      <A extends unknown[]>(action: (...args: A) => void) =>
      (...args: A) => {
        if (gate.gated) connect();
        else action(...args);
      },
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

describe("Sources deep link when the account is not connected", () => {
  beforeEach(() => {
    connect.mockReset();
    gate.gated = true;
    fetchSources.mockReset();
    fetchSources.mockResolvedValue({ kpis: [], sources: [EDITOR_ROW] });
  });

  it("asks to connect instead of opening the create modal", async () => {
    renderAt("/processor/sources?new=1");
    expect(
      await screen.findByText("portal.sources.empty.title"),
    ).toBeInTheDocument();
    expect(connect).toHaveBeenCalled();
    expect(screen.queryByText("portal.sources.builder.save")).toBeNull();
  });

  it("leaves the page looking exactly as it always does", async () => {
    renderAt("/processor/sources");
    expect(
      await screen.findByText("portal.sources.empty.title"),
    ).toBeInTheDocument();
  });

  it("still honours the deep link once connected", async () => {
    gate.gated = false;
    renderAt("/processor/sources?new=1");
    await screen.findByText("portal.sources.empty.title");
    expect(connect).not.toHaveBeenCalled();
  });
});
