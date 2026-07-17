import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import { OutputsTab } from "@portal/components/outputs/OutputsTab";
import type { OutputView } from "@portal/api/outputs";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, {
    wrapper: ({ children }) => (
      <MantineProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </MantineProvider>
    ),
  });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigate };
});

const fetchOutputs = vi.fn();
vi.mock("@portal/api/outputs", () => ({
  fetchOutputs: () => fetchOutputs(),
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
    navigate.mockReset();
  });

  it("shows the empty state when there are no outputs", async () => {
    fetchOutputs.mockResolvedValue(response([]));
    render(<OutputsTab />);
    expect(
      await screen.findByText("portal.outputs.empty.title"),
    ).toBeInTheDocument();
  });

  it("lists outputs and opens the builder for a row", async () => {
    fetchOutputs.mockResolvedValue(response([ARCHIVE]));
    render(<OutputsTab />);

    fireEvent.click(await screen.findByText("Archive folder"));
    expect(navigate).toHaveBeenCalledWith(
      expect.stringContaining("/sources/outputs/out-archive"),
    );
  });

  it("opens the builder to create a new output", async () => {
    fetchOutputs.mockResolvedValue(response([ARCHIVE]));
    render(<OutputsTab />);

    await screen.findByText("Archive folder");
    fireEvent.click(screen.getByText("portal.outputs.actions.new"));
    expect(navigate).toHaveBeenCalledWith(
      expect.stringContaining("/sources/outputs/new"),
    );
  });
});
