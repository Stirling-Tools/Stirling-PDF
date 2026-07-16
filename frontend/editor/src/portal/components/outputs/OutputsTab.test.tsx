import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { HttpError } from "@portal/api/http";
import { OutputsTab } from "@portal/components/outputs/OutputsTab";
import type { OutputView } from "@portal/api/outputs";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: MantineProvider });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const fetchOutputs = vi.fn();
const fetchOutput = vi.fn();
const deleteOutput = vi.fn();
vi.mock("@portal/api/outputs", () => ({
  fetchOutputs: () => fetchOutputs(),
  fetchOutput: (id: string) => fetchOutput(id),
  deleteOutput: (id: string) => deleteOutput(id),
  createOutput: vi.fn(),
}));

// The modal has its own test; stub it so the tab test stays focused.
vi.mock("@portal/components/outputs/OutputModal", () => ({
  OutputModal: () => null,
}));

const ARCHIVE: OutputView = {
  id: "out-archive",
  name: "Archive folder",
  type: "folder",
  status: "active",
  referenceCount: 2,
  referencingPolicies: [
    { id: "p1", name: "A" },
    { id: "p2", name: "B" },
  ],
  config: [{ label: "Directory", value: "/out" }],
};

function response(outputs: OutputView[]) {
  return { kpis: [], outputs };
}

describe("OutputsTab", () => {
  beforeEach(() => {
    fetchOutputs.mockReset();
    fetchOutput.mockReset();
    deleteOutput.mockReset();
    deleteOutput.mockResolvedValue(undefined);
  });

  it("shows the empty state when there are no outputs", async () => {
    fetchOutputs.mockResolvedValue(response([]));
    render(<OutputsTab />);
    expect(
      await screen.findByText("portal.outputs.empty.title"),
    ).toBeInTheDocument();
  });

  it("lists outputs and deletes one", async () => {
    fetchOutputs.mockResolvedValueOnce(response([ARCHIVE]));
    fetchOutputs.mockResolvedValueOnce(response([]));
    render(<OutputsTab />);

    expect(await screen.findByText("Archive folder")).toBeInTheDocument();
    fireEvent.click(screen.getByText("portal.outputs.delete"));
    await waitFor(() =>
      expect(deleteOutput).toHaveBeenCalledWith("out-archive"),
    );
  });

  it("surfaces the 409 when deleting an output still in use", async () => {
    fetchOutputs.mockResolvedValue(response([ARCHIVE]));
    deleteOutput.mockRejectedValue(
      new HttpError(409, "Conflict", {
        detail: "Output is referenced by 2 policy(ies): A, B",
      }),
    );
    render(<OutputsTab />);

    await screen.findByText("Archive folder");
    fireEvent.click(screen.getByText("portal.outputs.delete"));
    expect(
      await screen.findByText("Output is referenced by 2 policy(ies): A, B"),
    ).toBeInTheDocument();
  });
});
