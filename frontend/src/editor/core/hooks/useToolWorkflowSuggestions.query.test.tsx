import { type ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fetchToolWorkflows,
  type ToolWorkflowDto,
} from "@editor/api/toolRecommendations";
import {
  SubcategoryId,
  ToolCategoryId,
  type ToolRegistry,
} from "@editor/data/toolsTaxonomy";
import { ToolType } from "@editor/hooks/tools/shared/toolOperationTypes";
import {
  useIsAutomatableTool,
  useToolWorkflowSuggestions,
} from "@editor/hooks/useToolWorkflowSuggestions";

const auth = vi.hoisted(() => ({ userId: "alice" as string | null }));

vi.mock("@editor/auth/UseSession", () => ({
  useAuth: () => ({ user: auth.userId ? { id: auth.userId } : null }),
}));

vi.mock("@editor/api/toolRecommendations", () => ({
  fetchToolWorkflows: vi.fn(),
}));

const registry: Partial<ToolRegistry> = {
  adjustContrast: {
    name: "Adjust Contrast",
    icon: null,
    component: null,
    description: "",
    categoryId: ToolCategoryId.STANDARD_TOOLS,
    subcategoryId: SubcategoryId.GENERAL,
    automationSettings: null,
    operationConfig: {
      operationType: "adjustContrast",
      toolType: ToolType.custom,
      customProcessor: async () => ({ files: [] }),
    },
  },
  flatten: {
    name: "Flatten",
    icon: null,
    component: null,
    description: "",
    categoryId: ToolCategoryId.STANDARD_TOOLS,
    subcategoryId: SubcategoryId.GENERAL,
    automationSettings: null,
    operationConfig: {
      operationType: "flatten",
      toolType: ToolType.singleFile,
      endpoint: "/api/v1/misc/flatten",
      buildFormData: () => new FormData(),
    },
  },
};

const workflows: ToolWorkflowDto[] = [
  { tools: ["adjustContrast", "flatten"], count: 4, scope: "USER" },
];

describe("workflow suggestions", () => {
  let client: QueryClient;

  beforeEach(() => {
    auth.userId = "alice";
    vi.mocked(fetchToolWorkflows).mockReset();
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  test("Automate can suggest frontend-only processors without backend endpoints", async () => {
    vi.mocked(fetchToolWorkflows).mockResolvedValue(workflows);
    const { result } = renderHook(
      () => useToolWorkflowSuggestions(registry, []),
      { wrapper },
    );

    expect(result.current).toBeNull();
    await waitFor(() =>
      expect(result.current).toEqual([
        {
          operations: ["adjustContrast", "flatten"],
          fileCount: 4,
          scope: "user",
        },
      ]),
    );
    const predicate = renderHook(() => useIsAutomatableTool(registry));
    expect(predicate.result.current("adjustContrast")).toBe(true);
  });

  test("does not reuse a previous account's fresh cached workflows", async () => {
    vi.mocked(fetchToolWorkflows).mockResolvedValueOnce(workflows);
    const { result, rerender } = renderHook(
      () => useToolWorkflowSuggestions(registry, []),
      { wrapper },
    );
    await waitFor(() => expect(result.current).toHaveLength(1));

    let finishRequest: (value: ToolWorkflowDto[]) => void = () => {};
    vi.mocked(fetchToolWorkflows).mockReturnValueOnce(
      new Promise((resolve) => {
        finishRequest = resolve;
      }),
    );
    auth.userId = "bob";
    rerender();

    expect(result.current).toBeNull();
    await waitFor(() => expect(fetchToolWorkflows).toHaveBeenCalledTimes(2));
    finishRequest([]);
    await waitFor(() => expect(result.current).toEqual([]));

    auth.userId = "alice";
    rerender();
    expect(result.current).toHaveLength(1);
    expect(fetchToolWorkflows).toHaveBeenCalledTimes(2);
  });

  test("returns an empty list when every workflow already exists", async () => {
    vi.mocked(fetchToolWorkflows).mockResolvedValue(workflows);
    const { result } = renderHook(
      () =>
        useToolWorkflowSuggestions(registry, [["adjustContrast", "flatten"]]),
      { wrapper },
    );

    await waitFor(() => expect(result.current).toEqual([]));
  });

  test("returns null when the backend cannot serve workflows", async () => {
    vi.mocked(fetchToolWorkflows).mockResolvedValue(null);
    const { result } = renderHook(
      () => useToolWorkflowSuggestions(registry, []),
      { wrapper },
    );

    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(result.current).toBeNull();
  });
});
