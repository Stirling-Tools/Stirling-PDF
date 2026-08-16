import { describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
} from "@testing-library/react";
import { ProcessorTestProviders } from "@processor/test/TestQueryProvider";
import {
  PipelineEditHeader,
  type PipelineEditHeaderProps,
} from "@processor/components/pipelines/PipelineEditHeader";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: ProcessorTestProviders });

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
    onReprocess: vi.fn(),
    onDelete: vi.fn(),
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
      reprocessing={false}
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

    fireEvent.click(
      screen.getByLabelText("processor.pipelines.builder.rename"),
    );
    const input = screen.getByRole("textbox", {
      name: "processor.pipelines.composer.name",
    });
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(handlers.onNameChange).toHaveBeenCalledWith("Renamed");
  });

  it("abandons a rename on Escape, keeping the old name", () => {
    const handlers = renderHeader();
    fireEvent.click(
      screen.getByLabelText("processor.pipelines.builder.rename"),
    );
    const input = screen.getByRole("textbox", {
      name: "processor.pipelines.composer.name",
    });
    fireEvent.change(input, { target: { value: "Discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });
    // Escape must not commit, even via the blur that unmounting the field fires in a real browser.
    fireEvent.blur(input);
    expect(handlers.onNameChange).not.toHaveBeenCalled();
    expect(screen.getByText("Claims redaction")).toBeInTheDocument();
  });

  it("commits a rename when focus leaves the field", () => {
    const handlers = renderHeader();
    fireEvent.click(
      screen.getByLabelText("processor.pipelines.builder.rename"),
    );
    const input = screen.getByRole("textbox", {
      name: "processor.pipelines.composer.name",
    });
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.blur(input);
    expect(handlers.onNameChange).toHaveBeenCalledWith("Renamed");
  });

  it("offers to pause a live pipeline and to activate a paused one", () => {
    const handlers = renderHeader();
    fireEvent.click(screen.getByText("processor.pipelines.builder.pause"));
    expect(handlers.onTogglePause).toHaveBeenCalled();

    renderHeader({ enabled: false });
    expect(
      screen.getByText("processor.pipelines.builder.activate"),
    ).toBeInTheDocument();
  });

  it("runs the saved pipeline from the row", () => {
    const handlers = renderHeader();
    fireEvent.click(screen.getByText("processor.pipelines.detail.run"));
    expect(handlers.onRun).toHaveBeenCalled();
  });

  it("keeps clear-history and delete behind the overflow tray", () => {
    const handlers = renderHeader();
    // Not in the row itself...
    expect(
      screen.queryByText("processor.pipelines.detail.clearHistory"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("processor.pipelines.detail.delete"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByLabelText("processor.pipelines.builder.moreActions"),
    );
    fireEvent.click(
      screen.getByText("processor.pipelines.detail.clearHistory"),
    );
    expect(handlers.onReprocess).toHaveBeenCalled();

    fireEvent.click(
      screen.getByLabelText("processor.pipelines.builder.moreActions"),
    );
    fireEvent.click(screen.getByText("processor.pipelines.detail.delete"));
    expect(handlers.onDelete).toHaveBeenCalled();
  });

  it("blocks saving until the edits are valid", () => {
    renderHeader({ canSave: false });
    expect(
      screen.getByText("processor.pipelines.composer.save").closest("button"),
    ).toBeDisabled();
  });

  it("cannot pause while a save is committing", () => {
    renderHeader({ saving: true });
    expect(
      screen.getByText("processor.pipelines.builder.pause").closest("button"),
    ).toBeDisabled();
  });

  it("cannot save while a pause is committing", () => {
    renderHeader({ togglingEnabled: true });
    expect(
      screen.getByText("processor.pipelines.composer.save").closest("button"),
    ).toBeDisabled();
  });

  it("explains, on hover, why Save is disabled", async () => {
    renderHeader({ canSave: false, blockers: ["Choose a destination"] });
    const save = document.querySelector(
      ".processor-pipeline-edit-header__save",
    ) as HTMLElement;
    fireEvent.pointerEnter(save);
    fireEvent.mouseEnter(save);
    expect(await screen.findByText("Choose a destination")).toBeInTheDocument();
  });
});
