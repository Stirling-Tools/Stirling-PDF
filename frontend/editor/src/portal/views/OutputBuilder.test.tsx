import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HttpError } from "@portal/api/http";
import { OutputBuilder } from "@portal/views/OutputBuilder";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: MantineProvider });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const createOutput = vi.fn();
const fetchOutput = vi.fn();
const deleteOutput = vi.fn();
vi.mock("@portal/api/outputs", () => ({
  createOutput: (o: unknown) => createOutput(o),
  fetchOutput: (id: string) => fetchOutput(id),
  deleteOutput: (id: string) => deleteOutput(id),
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
        <Route path="/processor/sources" element={<div>outputs list</div>} />
        <Route
          path="/processor/sources/outputs/new"
          element={<OutputBuilder />}
        />
        <Route
          path="/processor/sources/outputs/:id"
          element={<OutputBuilder />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OutputBuilder", () => {
  beforeEach(() => {
    createOutput.mockReset();
    createOutput.mockResolvedValue({ id: "out-1" });
    fetchOutput.mockReset();
    deleteOutput.mockReset();
    deleteOutput.mockResolvedValue(undefined);
    fetchS3Connections.mockReset();
    fetchS3Connections.mockResolvedValue([]);
  });

  it("creates a folder output and returns to the Outputs tab", async () => {
    renderBuilder("/processor/sources/outputs/new");

    fireEvent.change(screen.getByLabelText(/portal\.outputs\.builder\.name/), {
      target: { value: "Processed archive" },
    });
    fireEvent.change(
      screen.getByLabelText(
        /portal\.outputs\.types\.folder\.fields\.directory\.label/,
      ),
      { target: { value: "/data/processed" } },
    );
    fireEvent.click(screen.getByText("portal.outputs.builder.create"));

    await waitFor(() => expect(createOutput).toHaveBeenCalledTimes(1));
    expect(createOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Processed archive",
        type: "folder",
        options: expect.objectContaining({ directory: "/data/processed" }),
        enabled: true,
      }),
    );
    expect(await screen.findByText("outputs list")).toBeInTheDocument();
  });

  it("gates the s3 type on a chosen connection", async () => {
    renderBuilder("/processor/sources/outputs/new");
    fireEvent.change(screen.getByLabelText(/portal\.outputs\.builder\.name/), {
      target: { value: "Bucket out" },
    });
    fireEvent.click(screen.getByText("portal.outputs.types.s3.label"));
    expect(
      await screen.findByText(
        "portal.outputs.types.s3.fields.connection.label",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("portal.outputs.builder.create").closest("button"),
    ).toBeDisabled();
  });

  it("edits an existing output prefilled and saves with its id", async () => {
    fetchOutput.mockResolvedValue({
      id: "out-9",
      name: "Existing",
      type: "folder",
      options: { directory: "/old" },
      enabled: true,
    });
    renderBuilder("/processor/sources/outputs/out-9");

    const directory = await screen.findByLabelText(
      /portal\.outputs\.types\.folder\.fields\.directory\.label/,
    );
    expect((directory as HTMLInputElement).value).toBe("/old");
    fireEvent.change(directory, { target: { value: "/new" } });
    fireEvent.click(screen.getByText("portal.outputs.builder.save"));

    await waitFor(() => expect(createOutput).toHaveBeenCalledTimes(1));
    expect(createOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "out-9",
        options: expect.objectContaining({ directory: "/new" }),
      }),
    );
  });

  it("surfaces the 409 when deleting an output still in use", async () => {
    fetchOutput.mockResolvedValue({
      id: "out-9",
      name: "Existing",
      type: "folder",
      options: { directory: "/old" },
      enabled: true,
    });
    deleteOutput.mockRejectedValue(
      new HttpError(409, "Conflict", {
        detail: "Output is referenced by 2 policy(ies): A, B",
      }),
    );
    renderBuilder("/processor/sources/outputs/out-9");

    fireEvent.click(await screen.findByText("portal.outputs.builder.delete"));
    fireEvent.click(await screen.findByText("portal.outputs.delete.confirm"));

    expect(
      await screen.findByText("Output is referenced by 2 policy(ies): A, B"),
    ).toBeInTheDocument();
  });
});
