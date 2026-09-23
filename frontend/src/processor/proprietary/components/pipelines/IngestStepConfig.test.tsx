import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IngestStepConfig } from "@portal/components/pipelines/IngestStepConfig";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { aiEngineEnabled: true }, loading: false }),
}));

describe("ingestion overlap validation", () => {
  it("marks an excessive overlap invalid and clears the error when corrected", () => {
    const { rerender } = render(
      <IngestStepConfig
        parameters={{ chunkSize: 64, overlap: 64 }}
        onChange={vi.fn()}
      />,
    );
    const input = screen.getByLabelText(
      "portal.pipelines.builder.ingest.overlap",
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("portal.pipelines.builder.ingest.overlapTooBig"),
    ).toBeInTheDocument();
    rerender(
      <IngestStepConfig
        parameters={{ chunkSize: 64, overlap: 16 }}
        onChange={vi.fn()}
      />,
    );
    expect(input).not.toHaveAttribute("aria-invalid", "true");
    expect(
      screen.queryByText("portal.pipelines.builder.ingest.overlapTooBig"),
    ).not.toBeInTheDocument();
  });
});
