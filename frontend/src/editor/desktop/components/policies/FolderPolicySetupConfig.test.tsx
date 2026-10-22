import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FolderPolicySetupConfig } from "@app/components/policies/FolderPolicySetupConfig";
import type { PolicySetupResult } from "@app/policies/catalog";
import { policyStep, policyStepToWire } from "@app/policies/operations";

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@app/services/apiClient", () => ({
  default: {
    get: () =>
      Promise.resolve({
        data: {
          enabled: true,
          engineReachable: true,
          indexingConfigured: false,
        },
      }),
  },
}));
vi.mock("@app/ui", () => ({
  FormField: ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <label>
      {label}
      {children}
    </label>
  ),
  Input: ({ value, readOnly }: { value: string; readOnly: boolean }) => (
    <input value={value} readOnly={readOnly} />
  ),
  Banner: ({ description }: { description: string }) => <p>{description}</p>,
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));
vi.mock("@app/components/policies/PolicyIngestionConfig", () => ({
  PolicyIngestionConfig: ({
    onTargetChange,
    allowExternal,
    children,
  }: {
    onTargetChange: (target: string) => void;
    allowExternal: boolean;
    children: React.ReactNode;
  }) => (
    <>
      {children}
      <button
        onClick={() => onTargetChange("export")}
        data-external={allowExternal}
      >
        Export without a database
      </button>
    </>
  ),
}));
function mount(
  steps = [policyStepToWire(policyStep("ingest"))],
  outputIds: string[] = [],
) {
  const onChange = vi.fn();
  const onValidityChange = vi.fn();
  const result: PolicySetupResult = {
    required: false,
    runsOnEditor: false,
    sources: [],
    scopeTypes: [],
    reviewerEmail: "",
    fieldValues: {},
    outputMode: "new_version",
    outputName: "",
    outputNamePosition: "suffix",
    runOn: "upload",
    maxRetries: 0,
    retryDelayMinutes: 0,
    steps,
    outputIds,
  };
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FolderPolicySetupConfig
        result={result}
        onChange={onChange}
        onValidityChange={onValidityChange}
        folderName="Documents"
      />
    </QueryClientProvider>,
  );
  return { onChange, onValidityChange };
}
describe("desktop folder policy settings", () => {
  it("offers corpus export without importing Processor or requiring an embedding provider", async () => {
    const { onChange, onValidityChange } = mount();
    await waitFor(() =>
      expect(onValidityChange).toHaveBeenLastCalledWith(false),
    );
    expect(screen.getByRole("region", { name: "Output" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Destination" })).toHaveValue(
      "Documents",
    );
    const button = screen.getByRole("button", {
      name: "Export without a database",
    });
    expect(button).toHaveAttribute("data-external", "false");
    fireEvent.click(button);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        outputIds: [],
        steps: [
          expect.objectContaining({
            parameters: expect.objectContaining({
              index: false,
              includeOriginal: true,
              exportChunksJsonl: true,
            }),
          }),
        ],
      }),
    );
  });
  it("preserves an existing external target until the user returns results to the folder", () => {
    const { onChange, onValidityChange } = mount(
      [policyStepToWire(policyStep("ocr"))],
      ["saved-database"],
    );
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Return results to this folder" }),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ outputIds: [] }),
    );
  });
});
