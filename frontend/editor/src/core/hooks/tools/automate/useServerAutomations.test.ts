import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import apiClient from "@app/services/apiClient";
import { expectConsole } from "@app/tests/failOnConsole";
import { useServerAutomations } from "@app/hooks/tools/automate/useServerAutomations";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";

vi.mock("@app/services/apiClient", () => ({
  default: { get: vi.fn() },
}));

const mockGet = vi.mocked(apiClient.get);

const registry = {
  compress: { operationConfig: { endpoint: "/api/v1/misc/compress-pdf" } },
} as unknown as Partial<ToolRegistry>;

const folderScanJson = JSON.stringify({
  name: "Shrink",
  pipeline: [
    {
      operation: "/api/v1/misc/compress-pdf",
      parameters: { compressionLevel: 5, fileInput: "automated" },
    },
  ],
});

describe("useServerAutomations", () => {
  beforeEach(() => vi.clearAllMocks());

  test("maps server folder configs to runnable automations", async () => {
    mockGet.mockResolvedValue({
      data: {
        pipelineConfigsWithNames: [{ json: folderScanJson, name: "Shrink" }],
      },
    });

    const { result } = renderHook(() => useServerAutomations(registry));

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(mockGet).toHaveBeenCalledWith(
      "/api/v1/ui-data/pipeline",
      expect.anything(),
    );
    expect(result.current[0]).toMatchObject({
      id: "server-0",
      name: "Shrink",
      icon: "server",
      operations: [
        { operation: "compress", parameters: { compressionLevel: 5 } },
      ],
    });
  });

  test("ignores the empty-folder placeholder and unparseable configs", async () => {
    expectConsole.warn(/Skipping server automation "broken"/);
    mockGet.mockResolvedValue({
      data: {
        pipelineConfigsWithNames: [
          { json: "", name: "No preloaded configs found" },
          { json: "{not json", name: "broken" },
        ],
      },
    });

    const { result } = renderHook(() => useServerAutomations(registry));

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    await waitFor(() => expect(result.current).toEqual([]));
  });
});
