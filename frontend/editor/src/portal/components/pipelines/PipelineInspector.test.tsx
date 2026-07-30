import { describe, expect, it, vi } from "vitest";
import { render as baseRender, screen } from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import {
  PipelineInspector,
  type PipelineInspectorProps,
} from "@portal/components/pipelines/PipelineInspector";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: PortalTestProviders });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderInspector(overrides: Partial<PipelineInspectorProps> = {}) {
  render(
    <PipelineInspector title="OCR" {...overrides}>
      {/* `in` rather than ??, so a case of "nothing selected" can pass no children at all. */}
      {"children" in overrides ? overrides.children : <p>step editor</p>}
    </PipelineInspector>,
  );
}

describe("PipelineInspector", () => {
  it("shows the selected node's editor, named", () => {
    renderInspector();
    expect(screen.getByText("OCR")).toBeInTheDocument();
    expect(screen.getByText("step editor")).toBeInTheDocument();
  });

  it("says so when nothing is selected, rather than showing an empty form", () => {
    renderInspector({ children: null });
    expect(
      screen.getByText("portal.pipelines.inspector.noSelectionTitle"),
    ).toBeInTheDocument();
    expect(screen.queryByText("OCR")).not.toBeInTheDocument();
  });

  it("surfaces the error for the step a run stopped at, above its settings", () => {
    renderInspector({ error: "Redact: no search terms" });
    expect(screen.getByText("Redact: no search terms")).toBeInTheDocument();
    expect(screen.getByText("step editor")).toBeInTheDocument();
  });

  it("stays node-scoped: no definition or run-wide results here", () => {
    renderInspector();
    // The definition and a run's files are pipeline-wide and belong to the header.
    expect(screen.queryByText(/definition/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });
});
