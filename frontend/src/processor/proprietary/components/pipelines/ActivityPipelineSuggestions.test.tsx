import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PortalTestProviders } from "@processor/test/TestQueryProvider";
import type { PipelineView, Policy } from "@processor/api/pipelines";
import type { ActivityChain } from "@editor/utils/activityChains";
import { ActivityPipelineSuggestions } from "@processor/components/pipelines/ActivityPipelineSuggestions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, _fallback?: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
    i18n: { changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@editor/contexts/ToolRegistryContext", () => {
  const tool = (name: string, operationType: string, endpoint: string) => ({
    name,
    icon: null,
    component: null,
    description: "",
    categoryId: "recommendedTools",
    subcategoryId: "general",
    operationConfig: {
      operationType,
      toolType: 0,
      endpoint,
      defaultParameters: {},
      buildFormData: () => new FormData(),
      toApiParams: (params: Record<string, unknown>) => ({ ...params }),
      fromApiParams: (params: Record<string, unknown>) => ({ ...params }),
    },
  });
  const allTools = {
    compress: tool("Compress", "compress", "/api/v1/misc/compress-pdf"),
    flatten: tool("Flatten", "flatten", "/api/v1/misc/flatten"),
  };
  return {
    useToolRegistry: () => ({
      regularTools: allTools,
      superTools: allTools,
      linkTools: allTools,
      allTools,
      getToolById: () => null,
    }),
  };
});

const suggestions = vi.hoisted(() => ({
  chains: null as ActivityChain[] | null,
  existing: [] as string[][],
}));

vi.mock("@editor/hooks/useToolWorkflowSuggestions", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@editor/hooks/useToolWorkflowSuggestions")
    >();
  return {
    ...actual,
    useToolWorkflowSuggestions: (_registry: unknown, existing: string[][]) => {
      suggestions.existing = existing;
      return suggestions.chains;
    },
  };
});

const pipeline = (steps: string[]): PipelineView => ({
  id: "p1",
  name: "Existing",
  enabled: true,
  required: false,
  icon: "",
  status: "idle" as PipelineView["status"],
  trigger: "manual",
  sources: [],
  steps,
  output: "inline",
  owner: "alice",
});

const renderSuggestions = (
  pipelines: PipelineView[],
  onOpen: (draft: Policy) => void = vi.fn(),
) =>
  render(
    <ActivityPipelineSuggestions pipelines={pipelines} onOpen={onOpen} />,
    { wrapper: PortalTestProviders },
  );

describe("ActivityPipelineSuggestions", () => {
  it("renders nothing when the server has no workflows to offer", () => {
    suggestions.chains = null;
    renderSuggestions([]);

    expect(screen.queryByText("portal.pipelines.activity.title")).toBeNull();
  });

  it("opens the builder with the workflow's steps as a draft", () => {
    suggestions.chains = [
      { operations: ["compress", "flatten"], fileCount: 4, scope: "team" },
    ];
    const onOpen = vi.fn();
    renderSuggestions([], onOpen);

    expect(screen.getByText("toolWorkflows.ranBy.team:4")).toBeTruthy();
    fireEvent.click(screen.getByText("Compress → Flatten"));

    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Compress → Flatten",
        inputs: [],
        steps: [
          { operation: "/api/v1/misc/compress-pdf", parameters: {} },
          { operation: "/api/v1/misc/flatten", parameters: {} },
        ],
      }),
    );
  });

  it("compares existing pipelines by tool, not by endpoint path", () => {
    suggestions.chains = [];
    renderSuggestions([
      pipeline(["/api/v1/misc/compress-pdf", "/api/v1/misc/flatten"]),
    ]);

    expect(suggestions.existing).toEqual([["compress", "flatten"]]);
  });
});
