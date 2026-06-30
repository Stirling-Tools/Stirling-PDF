import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HttpError } from "@portal/api/http";
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
    fireEvent.click(await screen.findByText("sources.detail.delete"));

    // Confirm in the dialog.
    fireEvent.click(await screen.findByText("sources.delete.confirm"));

    await waitFor(() => {
      expect(deleteSource).toHaveBeenCalledWith("src-referenced");
    });

    expect(
      await screen.findByText("Source is referenced by 2 policies"),
    ).toBeInTheDocument();
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
    fireEvent.click(await screen.findByText("sources.detail.pause"));

    await waitFor(() => {
      expect(createSource).toHaveBeenCalledTimes(1);
    });
    expect(fetchSource).toHaveBeenCalledWith("src-referenced");
    expect(createSource).toHaveBeenCalledWith(
      expect.objectContaining({ id: "src-referenced", enabled: false }),
    );
  });
});
