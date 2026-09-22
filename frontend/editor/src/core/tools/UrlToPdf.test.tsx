import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import UrlToPdf from "@app/tools/UrlToPdf";
import { useEndpointEnabled } from "@app/hooks/useEndpointConfig";
import type { ToolFlowConfig } from "@app/components/tools/shared/createToolFlow";
import type { UrlToPdfParameters } from "@app/hooks/tools/urlToPdf/useUrlToPdfOperation";

const { executeOperation } = vi.hoisted(() => ({
  executeOperation: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@app/hooks/useEndpointConfig", () => ({
  useEndpointEnabled: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@app/hooks/tools/shared/useToolOperation", () => ({
  ToolType: { custom: 2 },
  useToolOperation: () => ({
    files: [],
    executeOperation,
    resetResults: vi.fn(),
    clearError: vi.fn(),
  }),
}));
vi.mock("@app/components/tools/shared/createToolFlow", () => ({
  createToolFlow: (config: ToolFlowConfig<UrlToPdfParameters>) => (
    <>
      {config.steps.map((step) => (
        <div key={step.title}>{step.content}</div>
      ))}
      <button
        disabled={config.executeButton?.disabledReason !== null}
        onClick={config.executeButton?.onClick}
      >
        Convert to PDF
      </button>
    </>
  ),
}));

describe("URL to PDF screen", () => {
  beforeEach(() => {
    executeOperation.mockClear();
    vi.mocked(useEndpointEnabled).mockReturnValue({
      enabled: true,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });
  it.each([
    { enabled: false, loading: false, error: null },
    { enabled: null, loading: true, error: null },
    { enabled: true, loading: false, error: "Unavailable" },
  ])("renders nothing for a direct link when %j", (status) => {
    vi.mocked(useEndpointEnabled).mockReturnValue({
      ...status,
      refetch: vi.fn(),
    });
    render(
      <MantineProvider>
        <UrlToPdf />
      </MantineProvider>,
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("converts a valid URL with no uploaded input files", () => {
    render(
      <MantineProvider>
        <UrlToPdf />
      </MantineProvider>,
    );
    const button = screen.getByRole("button", { name: "Convert to PDF" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "https://example.com" },
    });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(executeOperation).toHaveBeenCalledWith(
      { urlInput: "https://example.com" },
      [],
    );
  });
});
