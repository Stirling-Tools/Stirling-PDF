import { describe, expect, it, vi } from "vitest";
import { render as baseRender, screen } from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { PipelineDefinitionModal } from "@portal/components/pipelines/PipelineDefinitionModal";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: PortalTestProviders });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const JSON_BODY = '{\n  "name": "Claims"\n}';

describe("PipelineDefinitionModal", () => {
  it("renders nothing while closed", () => {
    render(
      <PipelineDefinitionModal
        open={false}
        onClose={vi.fn()}
        json={JSON_BODY}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on the JSON tab", () => {
    render(<PipelineDefinitionModal open onClose={vi.fn()} json={JSON_BODY} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/"name": "Claims"/)).toBeInTheDocument();
  });

  it("shows the definition alone - no tab strip to choose between", () => {
    render(<PipelineDefinitionModal open onClose={vi.fn()} json={JSON_BODY} />);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});
