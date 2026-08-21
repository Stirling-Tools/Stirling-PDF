import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  type RenderResult,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import type { ReviewDocument } from "@portal/api/documents";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { UIProvider } from "@portal/contexts/UIContext";
import { ReviewQueue } from "@portal/components/documents/ReviewQueue";

// Deterministic i18n: keys returned verbatim.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigate };
});

// Isolate ReviewQueue's own branching: stub the heavy children so the test
// doesn't need TierProvider (DocumentDrawer → useTier) or the real table body.
vi.mock("@portal/components/documents/DocumentDrawer", () => ({
  DocumentDrawer: () => null,
}));
vi.mock("@portal/components/documents/ReviewQueueTable", () => ({
  ReviewQueueTable: () => null,
}));

const render = (ui: ReactElement): RenderResult =>
  baseRender(
    <MemoryRouter>
      <PortalTestProviders>
        <UIProvider>{ui}</UIProvider>
      </PortalTestProviders>
    </MemoryRouter>,
  );

const DOC: ReviewDocument = {
  id: "doc-1",
  name: "Invoice.pdf",
  type: "PDF",
  classification: "Invoice",
  auto: true,
  note: null,
  product: "Editor",
  action: null,
  user: "you@acme.com",
  status: "processed",
  reviewer: null,
  source: "Claims intake",
  confidence: 0.98,
  fieldsExtracted: 5,
  time: "2 min ago",
  sensitive: false,
  extractions: [],
  audit: [],
};

describe("ReviewQueue", () => {
  beforeEach(() => {
    navigate.mockReset();
  });

  it("hides the filter toolbar and shows CTAs when there are no documents", () => {
    render(<ReviewQueue documents={[]} loading={false} />);

    // Empty-state panel with both CTAs.
    expect(
      screen.getByText("portal.documents.queue.empty.title"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.documents.queue.empty.createPipeline"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.documents.queue.empty.connectSource"),
    ).toBeInTheDocument();

    // The filter pills (counters over the list) are gone in the empty state.
    expect(
      screen.queryByText("portal.documents.filters.all"),
    ).not.toBeInTheDocument();
  });

  it("opens the connect-a-source modal in place instead of navigating", async () => {
    render(<ReviewQueue documents={[]} loading={false} />);

    fireEvent.click(
      screen.getByText("portal.documents.queue.empty.connectSource"),
    );

    expect(
      await screen.findByText("portal.sources.types.folder.label"),
    ).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("still navigates to the pipeline builder from the other empty-state CTA", () => {
    render(<ReviewQueue documents={[]} loading={false} />);

    fireEvent.click(
      screen.getByText("portal.documents.queue.empty.createPipeline"),
    );

    expect(navigate).toHaveBeenCalledWith(
      `${toPortalPath(VIEW_PATHS.pipelines)}/new`,
    );
  });

  it("shows the filter toolbar when documents exist", () => {
    render(<ReviewQueue documents={[DOC]} loading={false} />);

    expect(
      screen.getByText("portal.documents.filters.all"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("portal.documents.queue.empty.title"),
    ).not.toBeInTheDocument();
  });
});
