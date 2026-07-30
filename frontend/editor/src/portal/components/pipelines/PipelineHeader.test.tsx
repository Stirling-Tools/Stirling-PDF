import { describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
} from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import {
  PipelineHeader,
  type PipelineHeaderProps,
} from "@portal/components/pipelines/PipelineHeader";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: PortalTestProviders });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderHeader(overrides: Partial<PipelineHeaderProps> = {}) {
  const handlers = {
    onNameChange: vi.fn(),
    onEnabledChange: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onBack: vi.fn(),
    onTest: vi.fn(),
    onRun: vi.fn(),
    onClearHistory: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <PipelineHeader
      name="Claims redaction"
      enabled
      isEdit
      canSave
      saving={false}
      testing={false}
      running={false}
      clearingHistory={false}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe("PipelineHeader", () => {
  it("edits the pipeline's name and enabled state", () => {
    const handlers = renderHeader();
    fireEvent.change(
      screen.getByRole("textbox", { name: "portal.pipelines.composer.name" }),
      { target: { value: "Renamed" } },
    );
    expect(handlers.onNameChange).toHaveBeenCalledWith("Renamed");

    fireEvent.click(screen.getByRole("checkbox"));
    expect(handlers.onEnabledChange).toHaveBeenCalledWith(false);
  });

  it("offers run, clear history and delete only once the pipeline exists", () => {
    renderHeader({ isEdit: false });
    expect(
      screen.queryByText("portal.pipelines.detail.run"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("portal.pipelines.detail.clearHistory"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("portal.pipelines.detail.delete"),
    ).not.toBeInTheDocument();
    // A test run needs no saved record, so it stays: it is how you check the steps as you build.
    expect(
      screen.getByText("portal.pipelines.builder.testRun"),
    ).toBeInTheDocument();
  });

  it("labels the save action for what it will do", () => {
    renderHeader({ isEdit: false });
    expect(
      screen.getByText("portal.pipelines.composer.create"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("portal.pipelines.composer.save"),
    ).not.toBeInTheDocument();
  });

  it("blocks saving until the pipeline is valid", () => {
    renderHeader({ canSave: false });
    expect(
      screen.getByText("portal.pipelines.composer.save").closest("button"),
    ).toBeDisabled();
  });

  it("hands the chosen file to the test run", () => {
    const handlers = renderHeader();
    const file = new File(["x"], "claim.pdf", { type: "application/pdf" });
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
    expect(handlers.onTest).toHaveBeenCalledWith(file);
  });

  it("runs, clears and deletes from the actions row", () => {
    const handlers = renderHeader();
    fireEvent.click(screen.getByText("portal.pipelines.detail.run"));
    expect(handlers.onRun).toHaveBeenCalled();
    fireEvent.click(screen.getByText("portal.pipelines.detail.clearHistory"));
    expect(handlers.onClearHistory).toHaveBeenCalled();
    fireEvent.click(screen.getByText("portal.pipelines.detail.delete"));
    expect(handlers.onDelete).toHaveBeenCalled();
  });

  it("leaves the page through cancel and back", () => {
    const handlers = renderHeader();
    fireEvent.click(screen.getByText("portal.pipelines.composer.cancel"));
    expect(handlers.onCancel).toHaveBeenCalled();
    fireEvent.click(screen.getByText("portal.pipelines.builder.back"));
    expect(handlers.onBack).toHaveBeenCalled();
  });
});
