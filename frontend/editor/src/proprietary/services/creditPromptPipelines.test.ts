import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchCreditPromptPipelines,
  setCreditPromptPipelineEnabled,
} from "@app/services/creditPromptPipelines";

const { get, post, updatePolicy } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  updatePolicy: vi.fn(),
}));
vi.mock("@app/services/apiClient", () => ({ default: { get, post } }));
vi.mock("@app/services/policyStorage", () => ({
  loadPolicies: () => ({ rotate: { backendId: "rotate-id" } }),
  updatePolicy,
}));

describe("credit prompt pipeline controls", () => {
  beforeEach(() => vi.resetAllMocks());
  it("lists active pipelines with their saved sources and editor participation", async () => {
    get.mockImplementation(async (path: string) => ({
      data: path.endsWith("overview")
        ? {
            pipelines: [
              {
                id: "rotate-id",
                enabled: true,
                sources: [{ id: "inbox", name: "Shared inbox" }],
              },
              { id: "paused", enabled: false },
            ],
          }
        : path.endsWith("permissions")
          ? { canManagePolicies: true }
          : [{ id: "rotate-id", editor: { allowed: true, runOn: "export" } }],
    }));
    expect(await fetchCreditPromptPipelines()).toEqual({
      canManage: true,
      pipelines: [
        {
          id: "rotate-id",
          enabled: true,
          sources: [{ id: "inbox", name: "Shared inbox" }],
          editor: { allowed: true, runOn: "export" },
        },
      ],
    });
  });
  it("preserves the latest policy definition and updates the editor only after a successful save", async () => {
    const policy = {
      id: "rotate-id",
      name: "New name",
      enabled: true,
      required: false,
      inputs: [{ sourceId: "shared" }],
      routingRules: [{ condition: { type: "and" }, outputId: "archive" }],
      steps: [{ operation: "rotate", parameters: { angle: 90 } }],
    };
    get.mockResolvedValue({ data: policy });
    post.mockResolvedValue({ data: { ...policy, enabled: false } });
    await setCreditPromptPipelineEnabled("rotate-id", false);
    expect(post).toHaveBeenCalledWith(
      "/api/v1/policies",
      { ...policy, enabled: false },
      { suppressErrorToast: true },
    );
    expect(updatePolicy).toHaveBeenCalledWith("rotate", { enabled: false });
  });
  it("refuses to disable a policy made required since the list was loaded", async () => {
    get.mockResolvedValue({ data: { id: "rotate-id", required: true } });
    await expect(
      setCreditPromptPipelineEnabled("rotate-id", false),
    ).rejects.toThrow("Required policies");
    expect(post).not.toHaveBeenCalled();
    expect(updatePolicy).not.toHaveBeenCalled();
  });
  it("does not change the editor cache when a save fails", async () => {
    get.mockResolvedValue({
      data: { id: "rotate-id", enabled: true, required: false },
    });
    post.mockRejectedValue(new Error("offline"));
    await expect(
      setCreditPromptPipelineEnabled("rotate-id", false),
    ).rejects.toThrow("offline");
    expect(updatePolicy).not.toHaveBeenCalled();
  });
});
