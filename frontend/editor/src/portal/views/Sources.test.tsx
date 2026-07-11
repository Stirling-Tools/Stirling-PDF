import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import { HttpError } from "@portal/api/http";

const render = (
  ui: Parameters<typeof baseRender>[0],
  options?: Parameters<typeof baseRender>[1],
) => baseRender(ui, { wrapper: MantineProvider, ...options });
import type { SourcesResponse } from "@portal/api/sources";
import { Sources } from "@portal/views/Sources";

// Deterministic i18n: keys returned verbatim, so assertions are stable without
// the async TOML backend.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const fetchSources = vi.fn();
const fetchSource = vi.fn();
const fetchSourceDocCounts = vi.fn();
const createSource = vi.fn();
const deleteSource = vi.fn();
vi.mock("@portal/api/sources", () => ({
  fetchSources: () => fetchSources(),
  fetchSource: (id: string) => fetchSource(id),
  fetchSourceDocCounts: (id: string) => fetchSourceDocCounts(id),
  createSource: (source: unknown) => createSource(source),
  deleteSource: (id: string) => deleteSource(id),
}));

const fetchApiKeys = vi.fn();
vi.mock("@portal/api/infrastructure", () => ({
  fetchApiKeys: () => fetchApiKeys(),
}));

const RESPONSE: SourcesResponse = {
  kpis: [
    { value: 2, description: "" },
    { value: 1, description: "" },
    { value: 1, description: "" },
  ],
  sources: [
    {
      id: "src-referenced",
      name: "Claims intake",
      type: "folder",
      status: "active",
      referenceCount: 2,
      referencingPolicies: [
        { id: "pol-1", name: "Redaction" },
        { id: "pol-2", name: "Classification" },
      ],
      config: [{ label: "Directory", value: "/data/incoming" }],
      docsTotal: 1240,
      docs24h: 18,
      docs30d: 540,
    },
    {
      id: "src-orphan",
      name: "Scratch folder",
      type: "folder",
      status: "unused",
      referenceCount: 0,
      referencingPolicies: [],
      config: [{ label: "Directory", value: "/tmp/scratch" }],
      docsTotal: 1240,
      docs24h: 18,
      docs30d: 540,
    },
  ],
};

function renderView() {
  return render(
    <MemoryRouter>
      <Sources />
    </MemoryRouter>,
  );
}

describe("Sources view", () => {
  beforeEach(() => {
    fetchSources.mockReset();
    fetchSource.mockReset();
    fetchSourceDocCounts.mockReset();
    fetchSourceDocCounts.mockResolvedValue([]);
    createSource.mockReset();
    deleteSource.mockReset();
    fetchApiKeys.mockReset();
    fetchApiKeys.mockResolvedValue({ keys: [] });
  });

  it("surfaces the inline 409 message when deleting a referenced source", async () => {
    fetchSources.mockResolvedValue(RESPONSE);
    deleteSource.mockRejectedValue(
      new HttpError(409, "Conflict", {
        detail: "Source is referenced by 2 policies",
      }),
    );

    renderView();

    // Wait for the row to render after the async fetch resolves.
    const row = await screen.findByText("Claims intake");
    fireEvent.click(row);

    // Detail card opens with its delete action.
    fireEvent.click(await screen.findByText("portal.sources.detail.delete"));

    // Confirm in the dialog.
    fireEvent.click(await screen.findByText("portal.sources.delete.confirm"));

    await waitFor(() => {
      expect(deleteSource).toHaveBeenCalledWith("src-referenced");
    });

    expect(
      await screen.findByText("Source is referenced by 2 policies"),
    ).toBeInTheDocument();
  });

  it("shows the editor as a built-in source with no edit, pause, or delete actions", async () => {
    fetchSources.mockResolvedValue({
      kpis: [],
      sources: [
        {
          id: "editor",
          name: "Editor",
          type: "editor",
          status: "active",
          referenceCount: 1,
          referencingPolicies: [{ id: "pol-1", name: "Redaction" }],
          config: [],
          docsTotal: 8230,
          docs24h: 42,
          docs30d: 1680,
        },
      ],
    } satisfies SourcesResponse);

    renderView();

    // The editor row is labelled from its type (i18n keys are returned verbatim here).
    fireEvent.click(
      await screen.findByText("portal.sources.types.editor.label"),
    );

    // Detail opens, but none of the mutate actions are offered for the built-in source.
    await screen.findByText("portal.sources.detail.documents");
    expect(screen.queryByText("portal.sources.detail.edit")).toBeNull();
    expect(screen.queryByText("portal.sources.detail.pause")).toBeNull();
    expect(screen.queryByText("portal.sources.detail.delete")).toBeNull();
  });

  it("pauses a source by re-saving it with enabled flipped off", async () => {
    fetchSources.mockResolvedValue(RESPONSE);
    fetchSource.mockResolvedValue({
      id: "src-referenced",
      name: "Claims intake",
      type: "folder",
      options: { directory: "/data/incoming", mode: "consume" },
      enabled: true,
    });
    createSource.mockResolvedValue({});

    renderView();

    fireEvent.click(await screen.findByText("Claims intake"));
    fireEvent.click(await screen.findByText("portal.sources.detail.pause"));

    await waitFor(() => {
      expect(createSource).toHaveBeenCalledTimes(1);
    });
    expect(fetchSource).toHaveBeenCalledWith("src-referenced");
    expect(createSource).toHaveBeenCalledWith(
      expect.objectContaining({ id: "src-referenced", enabled: false }),
    );
  });

  it("shows the KPI stat boxes when sources exist", async () => {
    fetchSources.mockResolvedValue(RESPONSE);
    renderView();
    await screen.findByText("Claims intake");
    expect(screen.getByText("portal.sources.kpi.total")).toBeInTheDocument();
  });

  it("lists API keys as read-only rows with no edit/delete actions", async () => {
    fetchSources.mockResolvedValue({ ...RESPONSE, sources: [] });
    fetchApiKeys.mockResolvedValue({
      keys: [
        {
          id: "7",
          name: "Production ingest",
          prefix: "sk_a3f81b2c",
          created: "2026-03-02",
          lastUsed: "2026-07-10 09:14",
          status: "active",
          usageToday: 12,
          usageMonth: 340,
          usageTotal: 5000,
        },
      ],
    });

    renderView();

    const row = await screen.findByText("Production ingest");
    fireEvent.click(row);

    // Read-only note is shown; no destructive/edit actions for an API-key row.
    expect(
      await screen.findByText("portal.sources.detail.apiKeyReadOnly"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("portal.sources.detail.delete"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("portal.sources.detail.edit"),
    ).not.toBeInTheDocument();
  });

  it("hides the stat boxes and shows the connect CTA when empty", async () => {
    fetchSources.mockResolvedValue({
      kpis: [
        { value: 0, description: "" },
        { value: 0, description: "" },
        { value: 0, description: "" },
      ],
      sources: [],
    });
    renderView();
    // The empty-state panel renders.
    expect(
      await screen.findByText("portal.sources.empty.title"),
    ).toBeInTheDocument();
    // The KPI strip is gone: no stat-box labels over an empty page.
    expect(
      screen.queryByText("portal.sources.kpi.total"),
    ).not.toBeInTheDocument();
  });
});
