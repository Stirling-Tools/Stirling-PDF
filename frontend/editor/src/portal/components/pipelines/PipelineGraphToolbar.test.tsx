import { describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
} from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import {
  PipelineGraphToolbar,
  type PipelineGraphToolbarProps,
} from "@portal/components/pipelines/PipelineGraphToolbar";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: PortalTestProviders });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderToolbar(overrides: Partial<PipelineGraphToolbarProps> = {}) {
  const handlers = { onTest: vi.fn(), onDownloadOutput: vi.fn() };
  render(
    <PipelineGraphToolbar
      stepCount={2}
      testing={false}
      runResult={null}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe("PipelineGraphToolbar", () => {
  it("hands the chosen file to the test run", () => {
    const handlers = renderToolbar();
    const file = new File(["x"], "claim.pdf", { type: "application/pdf" });
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
    expect(handlers.onTest).toHaveBeenCalledWith(file);
  });

  it("will not offer a test run on a chain with no steps", () => {
    renderToolbar({ stepCount: 0 });
    expect(
      screen.getByText("portal.pipelines.builder.testRun").closest("button"),
    ).toBeDisabled();
  });

  it("shows no result strip until a test has been run", () => {
    renderToolbar();
    expect(
      screen.queryByText(/portal.pipelines.inspector.status/),
    ).not.toBeInTheDocument();
  });

  it("shows why a test run failed, not only that it did", () => {
    renderToolbar({
      runResult: {
        status: "failed",
        completedSteps: 1,
        stepCount: 3,
        error: "OCR failed: unreadable page",
      },
    });
    expect(screen.getByText("OCR failed: unreadable page")).toBeInTheDocument();
  });

  it("reports a finished run and downloads the file clicked", () => {
    const handlers = renderToolbar({
      runResult: {
        status: "completed",
        completedSteps: 2,
        stepCount: 2,
        outputs: [
          { fileId: "f1", fileName: "claim.pdf" },
          { fileId: "f2", fileName: null },
        ],
      },
    });
    fireEvent.click(screen.getByText("claim.pdf"));
    expect(handlers.onDownloadOutput).toHaveBeenCalledWith({
      fileId: "f1",
      fileName: "claim.pdf",
    });
    // A file the backend did not name still has to be reachable.
    expect(screen.getByText("f2")).toBeInTheDocument();
  });
});
