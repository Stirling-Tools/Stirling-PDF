import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SourceBuilder } from "@portal/views/SourceBuilder";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: MantineProvider });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const createSource = vi.fn();
const fetchSource = vi.fn();
const deleteSource = vi.fn();
vi.mock("@portal/api/sources", () => ({
  createSource: (s: unknown) => createSource(s),
  fetchSource: (id: string) => fetchSource(id),
  deleteSource: (id: string) => deleteSource(id),
}));

const fetchS3Connections = vi.fn();
vi.mock("@portal/api/integrations", () => ({
  fetchS3Connections: () => fetchS3Connections(),
  createIntegration: vi.fn(),
}));

function renderBuilder(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/processor/sources" element={<div>sources list</div>} />
        <Route path="/processor/sources/new" element={<SourceBuilder />} />
        <Route path="/processor/sources/:id" element={<SourceBuilder />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SourceBuilder", () => {
  beforeEach(() => {
    createSource.mockReset();
    createSource.mockResolvedValue({ id: "src-1" });
    fetchSource.mockReset();
    deleteSource.mockReset();
    deleteSource.mockResolvedValue(undefined);
    fetchS3Connections.mockReset();
    fetchS3Connections.mockResolvedValue([]);
  });

  it("creates a folder source and returns to the list", async () => {
    renderBuilder("/processor/sources/new");

    // Folder is the first offered type; fill name + directory.
    fireEvent.change(screen.getByLabelText(/portal\.sources\.wizard\.name/), {
      target: { value: "Claims intake" },
    });
    fireEvent.change(
      screen.getByLabelText(
        /portal\.sources\.types\.folder\.fields\.directory\.label/,
      ),
      { target: { value: "/data/incoming" } },
    );
    fireEvent.click(screen.getByText("portal.sources.builder.create"));

    await waitFor(() => expect(createSource).toHaveBeenCalledTimes(1));
    expect(createSource).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Claims intake",
        type: "folder",
        options: expect.objectContaining({ directory: "/data/incoming" }),
        enabled: true,
      }),
    );
    expect(await screen.findByText("sources list")).toBeInTheDocument();
  });

  it("blocks create until required fields are filled", async () => {
    renderBuilder("/processor/sources/new");
    // Name given but directory (required) still blank -> Create disabled.
    fireEvent.change(screen.getByLabelText(/portal\.sources\.wizard\.name/), {
      target: { value: "Nameonly" },
    });
    expect(
      screen.getByText("portal.sources.builder.create").closest("button"),
    ).toBeDisabled();
  });

  it("edits an existing source prefilled and saves with its id", async () => {
    fetchSource.mockResolvedValue({
      id: "src-9",
      name: "Existing",
      type: "folder",
      options: { directory: "/old", mode: "consume" },
      enabled: true,
    });
    renderBuilder("/processor/sources/src-9");

    const directory = await screen.findByLabelText(
      /portal\.sources\.types\.folder\.fields\.directory\.label/,
    );
    expect((directory as HTMLInputElement).value).toBe("/old");
    fireEvent.change(directory, { target: { value: "/new" } });
    fireEvent.click(screen.getByText("portal.sources.builder.save"));

    await waitFor(() => expect(createSource).toHaveBeenCalledTimes(1));
    expect(createSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "src-9",
        options: expect.objectContaining({ directory: "/new" }),
      }),
    );
  });

  it("deletes an existing source after confirmation", async () => {
    fetchSource.mockResolvedValue({
      id: "src-9",
      name: "Existing",
      type: "folder",
      options: { directory: "/old" },
      enabled: true,
    });
    renderBuilder("/processor/sources/src-9");

    fireEvent.click(await screen.findByText("portal.sources.builder.delete"));
    fireEvent.click(await screen.findByText("portal.sources.delete.confirm"));

    await waitFor(() => expect(deleteSource).toHaveBeenCalledWith("src-9"));
    expect(await screen.findByText("sources list")).toBeInTheDocument();
  });
});
