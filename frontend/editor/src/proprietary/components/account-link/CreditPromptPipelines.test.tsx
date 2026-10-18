import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { CreditPromptPipelines } from "@app/components/account-link/CreditPromptPipelines";

const { fetchPipelines, setEnabled } = vi.hoisted(() => ({
  fetchPipelines: vi.fn(),
  setEnabled: vi.fn(),
}));
vi.mock("@app/services/creditPromptPipelines", () => ({
  fetchCreditPromptPipelines: fetchPipelines,
  setCreditPromptPipelineEnabled: setEnabled,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
vi.mock("@app/ui", async () => ({
  ...(await import("@app/ui/Button")),
  ...(await import("@app/ui/ToggleSwitch")),
}));

const optional = {
  id: "rotate",
  name: "Rotate",
  enabled: true,
  required: false,
  trigger: "editor-upload",
  sources: [],
};
const required = {
  id: "redact",
  name: "Redact",
  enabled: true,
  required: true,
  trigger: "schedule",
  sources: [{ name: "Finance inbox" }],
  editor: { allowed: true, runOn: "export" },
};
function mount(onManagePipeline?: (id?: string) => void) {
  render(
    <MantineProvider>
      <QueryClientProvider client={new QueryClient()}>
        <CreditPromptPipelines
          affectedPipelineId="rotate"
          onManagePipeline={onManagePipeline}
        />
      </QueryClientProvider>
    </MantineProvider>,
  );
}
async function expand() {
  fireEvent.click(screen.getByText("Active pipelines"));
  await screen.findByRole("switch", { name: "Rotate" });
}

describe("active pipelines in the credit prompt", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fetchPipelines.mockResolvedValue({
      pipelines: [optional, required],
      canManage: true,
    });
    setEnabled.mockResolvedValue(undefined);
  });
  it("keeps controls secondary until expanded and identifies the source of the prompt", async () => {
    mount();
    expect(fetchPipelines).toHaveBeenCalledOnce();
    expect(screen.queryByRole("switch")).toBeNull();
    await expand();
    expect(screen.getByText("Editor · on upload")).toBeTruthy();
    expect(
      screen.getByText("Editor · before download, Finance inbox"),
    ).toBeTruthy();
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(
      screen.getByRole("button", { name: "Triggered this prompt" }),
    );
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Triggered this prompt",
    );
    expect(setEnabled).not.toHaveBeenCalled();
  });
  it("pauses an optional pipeline and keeps the row available to re-enable", async () => {
    mount();
    await expand();
    fireEvent.click(screen.getByRole("switch", { name: "Rotate" }));
    await screen.findByText("Paused");
    expect(
      screen.getByRole("button", { name: /^Active pipelines\s*1$/ }),
    ).toBeTruthy();
    expect(setEnabled).toHaveBeenCalledWith("rotate", false);
    expect(screen.getByRole("switch", { name: "Rotate" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("switch", { name: "Rotate" }));
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Rotate" })).toBeChecked(),
    );
    expect(setEnabled).toHaveBeenLastCalledWith("rotate", true);
  });
  it("protects required policies", async () => {
    mount();
    await expand();
    expect(screen.getByRole("switch", { name: "Redact" })).toBeDisabled();
    expect(
      screen.getByText("Required policy · manage in pipeline settings"),
    ).toBeTruthy();
  });
  it("leaves enablement unchanged and shows an error when the save fails", async () => {
    setEnabled.mockRejectedValue(new Error("offline"));
    mount();
    await expand();
    fireEvent.click(screen.getByRole("switch", { name: "Rotate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not change this pipeline",
    );
    expect(screen.getByRole("switch", { name: "Rotate" })).toBeChecked();
  });
  it("does not offer mutations without server management permission", async () => {
    fetchPipelines.mockResolvedValue({
      pipelines: [optional],
      canManage: false,
    });
    mount();
    await expand();
    expect(screen.getByRole("switch", { name: "Rotate" })).toBeDisabled();
  });
  it("limits the list to five rows and sends larger lists to Pipelines", async () => {
    fetchPipelines.mockResolvedValue({
      pipelines: [
        ...Array.from({ length: 6 }, (_, index) => ({
          ...optional,
          id: `pipeline-${index}`,
          name: `Pipeline ${index}`,
        })),
        optional,
      ],
      canManage: true,
    });
    const manage = vi.fn();
    mount(manage);
    await expand();
    expect(screen.getAllByRole("switch")).toHaveLength(5);
    expect(screen.getAllByRole("switch")[0]).toHaveAccessibleName("Rotate");
    fireEvent.click(screen.getByRole("button", { name: "View all pipelines" }));
    expect(manage).toHaveBeenCalledWith(undefined);
  });
});
