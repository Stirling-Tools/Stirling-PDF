import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PortalTestProviders } from "@processor/test/TestQueryProvider";
import type { PipelineView, Policy } from "@processor/api/pipelines";
import { fetchToolWorkflows } from "@editor/api/toolRecommendations";
import { ActivityPipelineSuggestions } from "@processor/components/pipelines/ActivityPipelineSuggestions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, _fallback?: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
    i18n: { changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@editor/auth/UseSession", () => ({
  useAuth: () => ({ user: { id: "alice" } }),
}));

vi.mock("@editor/api/toolRecommendations", () => ({
  fetchToolWorkflows: vi.fn(),
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
    adjustContrast: {
      ...tool("Adjust Contrast", "adjustContrast", ""),
      operationConfig: {
        operationType: "adjustContrast",
        toolType: 2,
        customProcessor: async () => ({ files: [] }),
      },
    },
    extractPages: {
      ...tool("Extract Pages", "extractPages", ""),
      operationConfig: {
        operationType: "extractPages",
        toolType: 2,
        endpoint: "/api/v1/general/rearrange-pages",
        customProcessor: async () => ({ files: [] }),
      },
    },
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
  beforeEach(() => {
    vi.mocked(fetchToolWorkflows).mockReset();
  });

  it("renders nothing when the server has no workflows to offer", () => {
    vi.mocked(fetchToolWorkflows).mockResolvedValue(null);
    renderSuggestions([]);

    expect(screen.queryByText("portal.pipelines.activity.title")).toBeNull();
  });

  it("opens the builder with the workflow's steps as a draft", async () => {
    vi.mocked(fetchToolWorkflows).mockResolvedValue([
      { tools: ["compress", "flatten"], count: 4, scope: "TEAM" },
    ]);
    const onOpen = vi.fn();
    renderSuggestions([], onOpen);

    expect(
      await screen.findByText("toolWorkflows.ranByShort.team:4"),
    ).toBeTruthy();
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

  it("excludes workflows needing frontend processing before applying the card limit", async () => {
    vi.mocked(fetchToolWorkflows).mockResolvedValue([
      {
        tools: ["compress", "extractPages", "flatten"],
        count: 120,
        scope: "TEAM",
      },
      ...Array.from({ length: 6 }, () => ({
        tools: ["compress", "adjustContrast", "flatten"],
        count: 100,
        scope: "TEAM" as const,
      })),
      { tools: ["compress", "flatten"], count: 4, scope: "TEAM" },
    ]);
    renderSuggestions([]);

    expect(await screen.findByText("Compress → Flatten")).toBeTruthy();
    expect(screen.queryByText(/Adjust Contrast/)).toBeNull();
    expect(screen.queryByText(/Extract Pages/)).toBeNull();
  });

  it("compares existing pipelines by tool, not by endpoint path", async () => {
    vi.mocked(fetchToolWorkflows).mockResolvedValue([
      { tools: ["compress", "flatten"], count: 4, scope: "TEAM" },
      { tools: ["flatten", "compress"], count: 3, scope: "TEAM" },
    ]);
    renderSuggestions([
      pipeline(["/api/v1/misc/compress-pdf", "/api/v1/misc/flatten"]),
    ]);

    expect(await screen.findByText("Flatten → Compress")).toBeTruthy();
    expect(screen.queryByText("Compress → Flatten")).toBeNull();
  });
});
