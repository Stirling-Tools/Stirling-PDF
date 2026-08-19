import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchPoliciesByCategory } from "@app/services/policyBackend";

const listPolicies = vi.fn();
vi.mock("@app/services/policyApi", () => ({
  listPolicies: () => listPolicies(),
}));

/** A stored policy in the shape the backend returns. */
const policy = (id: string, categoryId?: string) => ({
  id,
  name: id,
  enabled: true,
  inputs: [],
  steps: [{ operation: "/api/v1/misc/compress-pdf", parameters: {} }],
  output: {
    type: "inline",
    options: categoryId ? { categoryId, sources: ["editor"] } : {},
  },
  outputIds: [],
});

describe("fetchPoliciesByCategory", () => {
  beforeEach(() => listPolicies.mockReset());

  it("keys a catalogue policy by its category", async () => {
    listPolicies.mockResolvedValue([policy("pol-1", "classification")]);

    const map = await fetchPoliciesByCategory();

    expect(map.get("classification")?.id).toBe("pol-1");
  });

  it("keeps a pipeline that has no category, keyed by its id", async () => {
    // Built on the Pipelines page, so no category tile stamped it. It is still a policy: one set
    // to run on editor uploads has to reach the editor's auto-run, which iterates this map.
    listPolicies.mockResolvedValue([policy("pol-adhoc")]);

    const map = await fetchPoliciesByCategory();

    expect(map.has("pol-adhoc")).toBe(true);
    expect(map.get("pol-adhoc")?.id).toBe("pol-adhoc");
  });

  it("carries both kinds at once without either displacing the other", async () => {
    listPolicies.mockResolvedValue([
      policy("pol-1", "classification"),
      policy("pol-adhoc"),
    ]);

    const map = await fetchPoliciesByCategory();

    expect([...map.keys()].sort()).toEqual(["classification", "pol-adhoc"]);
  });

  it("records run order from the list, which is the team's order", async () => {
    listPolicies.mockResolvedValue([
      policy("pol-1", "security"),
      policy("pol-adhoc"),
    ]);

    const map = await fetchPoliciesByCategory();

    expect(map.get("security")?.order).toBe(0);
    expect(map.get("pol-adhoc")?.order).toBe(1);
  });
});
