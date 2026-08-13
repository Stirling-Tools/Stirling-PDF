import { describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
} from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import {
  PipelineEditHeader,
  type PipelineEditHeaderProps,
} from "@portal/components/pipelines/PipelineEditHeader";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: PortalTestProviders });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderHeader(overrides: Partial<PipelineEditHeaderProps> = {}) {
  const handlers = {
    onNameChange: vi.fn(),
    onTogglePause: vi.fn(),
    onBack: vi.fn(),
    onSave: vi.fn(),
    onRun: vi.fn(),
    onClearHistory: vi.fn(),
    onDelete: vi.fn(),
    onViewDefinition: vi.fn(),
  };
  render(
    <PipelineEditHeader
      name="Claims redaction"
      enabled
      togglingEnabled={false}
      canSave
      blockers={[]}
      saving={false}
      running={false}
      clearingHistory={false}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe("PipelineEditHeader", () => {
  it("shows the name as the title and renames it in place", () => {
    const handlers = renderHeader();
    expect(screen.getByText("Claims redaction")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("portal.pipelines.builder.rename"));
    const input = screen.getByRole("textbox", {
      name: "portal.pipelines.composer.name",
    });
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(handlers.onNameChange).toHaveBeenCalledWith("Renamed");
  });

  it("abandons a rename on Escape, keeping the old name", () => {
    const handlers = renderHeader();
    fireEvent.click(screen.getByLabelText("portal.pipelines.builder.rename"));
    const input = screen.getByRole("textbox", {
      name: "portal.pipelines.composer.name",
    });
    fireEvent.change(input, { target: { value: "Discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(handlers.onNameChange).not.toHaveBeenCalled();
    expect(screen.getByText("Claims redaction")).toBeInTheDocument();
  });

  it("offers to pause a live pipeline and to activate a paused one", () => {
    const handlers = renderHeader();
    fireEvent.click(screen.getByText("portal.pipelines.builder.pause"));
    expect(handlers.onTogglePause).toHaveBeenCalled();

    renderHeader({ enabled: false });
    expect(
      screen.getByText("portal.pipelines.builder.activate"),
    ).toBeInTheDocument();
  });

  it("runs the saved pipeline and reads its definition from the row", () => {
    const handlers = renderHeader();
    fireEvent.click(screen.getByText("portal.pipelines.detail.run"));
    expect(handlers.onRun).toHaveBeenCalled();
    fireEvent.click(
      screen.getByLabelText("portal.pipelines.builder.viewDefinition"),
    );
    expect(handlers.onViewDefinition).toHaveBeenCalled();
  });

  it("keeps clear-history and delete behind the overflow tray", () => {
    const handlers = renderHeader();
    // Not in the row itself...
    expect(
      screen.queryByText("portal.pipelines.detail.clearHistory"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("portal.pipelines.detail.delete"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByLabelText("portal.pipelines.builder.moreActions"),
    );
    fireEvent.click(screen.getByText("portal.pipelines.detail.clearHistory"));
    expect(handlers.onClearHistory).toHaveBeenCalled();

    fireEvent.click(
      screen.getByLabelText("portal.pipelines.builder.moreActions"),
    );
    fireEvent.click(screen.getByText("portal.pipelines.detail.delete"));
    expect(handlers.onDelete).toHaveBeenCalled();
  });

  it("blocks saving until the edits are valid", () => {
    renderHeader({ canSave: false });
    expect(
      screen.getByText("portal.pipelines.composer.save").closest("button"),
    ).toBeDisabled();
  });

  it("explains, on hover, why Save is disabled", async () => {
    renderHeader({ canSave: false, blockers: ["Choose a destination"] });
    const save = document.querySelector(
      ".portal-pipeline-edit-header__save",
    ) as HTMLElement;
    fireEvent.pointerEnter(save);
    fireEvent.mouseEnter(save);
    expect(await screen.findByText("Choose a destination")).toBeInTheDocument();
  });
});
