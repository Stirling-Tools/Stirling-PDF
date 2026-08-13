import { describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
} from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import {
  PipelineCreateHeader,
  type PipelineCreateHeaderProps,
} from "@portal/components/pipelines/PipelineCreateHeader";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: PortalTestProviders });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderHeader(overrides: Partial<PipelineCreateHeaderProps> = {}) {
  const handlers = {
    onNameChange: vi.fn(),
    onCreate: vi.fn(),
    onCreatePaused: vi.fn(),
    onBack: vi.fn(),
    onViewDefinition: vi.fn(),
  };
  render(
    <PipelineCreateHeader
      name="Claims redaction"
      canSave
      blockers={[]}
      saving={false}
      pendingCreateEnabled={null}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe("PipelineCreateHeader", () => {
  it("edits the pipeline's name", () => {
    const handlers = renderHeader();
    fireEvent.change(
      screen.getByRole("textbox", { name: "portal.pipelines.composer.name" }),
      { target: { value: "Renamed" } },
    );
    expect(handlers.onNameChange).toHaveBeenCalledWith("Renamed");
  });

  it("creates the pipeline, live or paused, and backs out", () => {
    const handlers = renderHeader();
    fireEvent.click(screen.getByText("portal.pipelines.composer.create"));
    expect(handlers.onCreate).toHaveBeenCalled();
    fireEvent.click(screen.getByText("portal.pipelines.composer.createPaused"));
    expect(handlers.onCreatePaused).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("portal.pipelines.builder.back"));
    expect(handlers.onBack).toHaveBeenCalled();
  });

  it("blocks both create actions until the pipeline is valid", () => {
    renderHeader({ canSave: false, blockers: ["Choose a destination"] });
    expect(
      screen.getByText("portal.pipelines.composer.create").closest("button"),
    ).toBeDisabled();
    expect(
      screen
        .getByText("portal.pipelines.composer.createPaused")
        .closest("button"),
    ).toBeDisabled();
  });

  it("explains, on hover, why the create buttons are disabled", async () => {
    renderHeader({
      canSave: false,
      blockers: ["Give the pipeline a name", "Choose a destination"],
    });
    const group = document.querySelector(
      ".portal-pipeline-create-header__create",
    ) as HTMLElement;
    fireEvent.pointerEnter(group);
    fireEvent.mouseEnter(group);
    expect(await screen.findByText("Choose a destination")).toBeInTheDocument();
    expect(screen.getByText("Give the pipeline a name")).toBeInTheDocument();
  });

  it("opens the definition from the icon", () => {
    const handlers = renderHeader();
    fireEvent.click(
      screen.getByLabelText("portal.pipelines.builder.viewDefinition"),
    );
    expect(handlers.onViewDefinition).toHaveBeenCalled();
  });
});
