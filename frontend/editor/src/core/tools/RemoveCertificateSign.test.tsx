import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import RemoveCertificateSign from "@app/tools/RemoveCertificateSign";
import type { ToolFlowConfig } from "@app/components/tools/shared/createToolFlow";
import {
  buildRemoveCertificateSignFormData,
  removeCertificateSignOperationConfig,
} from "@app/hooks/tools/removeCertificateSign/useRemoveCertificateSignOperation";
import type { RemoveCertificateSignParameters } from "@app/hooks/tools/removeCertificateSign/useRemoveCertificateSignParameters";

const { operation, selectedFiles, endpoint } = vi.hoisted(() => ({
  operation: {
    files: [],
    downloadUrl: null,
    executeOperation: vi.fn().mockResolvedValue(undefined),
    resetResults: vi.fn(),
  },
  selectedFiles: [new File(["pdf"], "signed.pdf", { type: "application/pdf" })],
  endpoint: { enabled: true, loading: false },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@app/hooks/tools/shared/useViewScopedFiles", () => ({
  useViewScopedFiles: () => selectedFiles,
}));
vi.mock("@app/hooks/useEndpointConfig", () => ({
  useEndpointEnabled: () => endpoint,
}));
vi.mock("@app/hooks/tools/shared/useToolOperation", () => ({
  ToolType: { singleFile: 0 },
  defineSingleFileTool: (config: object) => config,
  useToolOperation: () => operation,
}));
vi.mock("@app/components/tools/shared/createToolFlow", () => ({
  createToolFlow: (config: ToolFlowConfig<RemoveCertificateSignParameters>) => (
    <>
      {config.steps.map((step) => (
        <div key={step.title}>{step.content}</div>
      ))}
      <button onClick={config.executeButton?.onClick}>
        {config.executeButton?.text}
      </button>
    </>
  ),
}));

describe("Remove Certificate Sign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    endpoint.loading = false;
  });

  it.each([false, true])(
    "submits removeVisibleSignature=%s from the checkbox",
    async (removeVisibleSignature) => {
      render(
        <MantineProvider>
          <RemoveCertificateSign />
        </MantineProvider>,
      );
      const checkbox = screen.getByRole("checkbox", {
        name: "Remove visible signature",
      });
      expect(checkbox).not.toBeChecked();
      if (removeVisibleSignature) {
        fireEvent.click(checkbox);
        expect(checkbox).toBeChecked();
      }
      fireEvent.click(screen.getByRole("button", { name: "Remove Signature" }));
      await waitFor(() =>
        expect(operation.executeOperation).toHaveBeenCalledWith(
          { removeVisibleSignature },
          selectedFiles,
        ),
      );
      const parameters = operation.executeOperation.mock
        .calls[0][0] as RemoveCertificateSignParameters;
      const formData = buildRemoveCertificateSignFormData(
        parameters,
        selectedFiles[0],
      );
      expect(formData.get("removeVisibleSignature")).toBe(
        String(removeVisibleSignature),
      );
      expect(formData.get("fileInput")).toBe(selectedFiles[0]);
    },
  );

  it("allows visible signature removal to be switched back off", async () => {
    render(
      <MantineProvider>
        <RemoveCertificateSign />
      </MantineProvider>,
    );
    const checkbox = screen.getByRole("checkbox", {
      name: "Remove visible signature",
    });
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Remove Signature" }));
    await waitFor(() =>
      expect(operation.executeOperation).toHaveBeenCalledWith(
        { removeVisibleSignature: false },
        selectedFiles,
      ),
    );
  });

  it("disables the checkbox while the endpoint is loading", () => {
    endpoint.loading = true;
    render(
      <MantineProvider>
        <RemoveCertificateSign />
      </MantineProvider>,
    );
    expect(
      screen.getByRole("checkbox", { name: "Remove visible signature" }),
    ).toBeDisabled();
  });

  it("preserves visible signatures for older saved automation parameters", () => {
    const legacyParameters = {} as RemoveCertificateSignParameters;
    expect(
      buildRemoveCertificateSignFormData(
        legacyParameters,
        selectedFiles[0],
      ).get("removeVisibleSignature"),
    ).toBe("false");
  });

  it.each([false, true])(
    "restores removeVisibleSignature=%s from saved API parameters",
    (removeVisibleSignature) => {
      const parameters = { removeVisibleSignature };
      expect(
        removeCertificateSignOperationConfig.fromApiParams!(
          removeCertificateSignOperationConfig.toApiParams!(parameters),
        ),
      ).toEqual(parameters);
    },
  );

  it("defaults older saved API parameters to keeping the visible signature", () => {
    expect(removeCertificateSignOperationConfig.fromApiParams!({})).toEqual({
      removeVisibleSignature: false,
    });
  });
});
