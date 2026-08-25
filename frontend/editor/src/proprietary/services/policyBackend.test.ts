import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  decodedToState,
  fetchPoliciesByCategory,
} from "@app/services/policyBackend";

const listPolicies = vi.fn();
vi.mock("@app/services/policyApi", () => ({
  listPolicies: () => listPolicies(),
}));

/** A stored policy in the shape the backend returns. */
const policy = (
  id: string,
  categoryId?: string,
  editor?: { allowed: boolean; runOn?: "upload" | "export" },
) => ({
  id,
  name: id,
  enabled: true,
  inputs: [],
  steps: [{ operation: "/api/v1/misc/compress-pdf", parameters: {} }],
  output: {
    type: "inline",
    options: { ...(categoryId ? { categoryId } : {}) },
  },
  outputIds: [],
  editor: {
    allowed: editor?.allowed ?? false,
    runOn: editor?.runOn ?? ("upload" as const),
  },
});

/** Decode one stored policy and project it onto the state the editor reads. */
async function stateOf(wire: ReturnType<typeof policy>, key: string) {
  listPolicies.mockResolvedValue([wire]);
  const decoded = (await fetchPoliciesByCategory()).get(key);
  if (!decoded) throw new Error(`no decoded policy for ${key}`);
  return decodedToState(decoded, undefined);
}

describe("fetchPoliciesByCategory", () => {
  beforeEach(() => listPolicies.mockReset());

  it("keys a catalogue policy by its category", async () => {
    listPolicies.mockResolvedValue([
      policy("pol-1", "classification", { allowed: true }),
    ]);

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
      policy("pol-1", "classification", { allowed: true }),
      policy("pol-adhoc"),
    ]);

    const map = await fetchPoliciesByCategory();

    expect([...map.keys()].sort()).toEqual(["classification", "pol-adhoc"]);
  });

  it("records run order from the list, which is the team's order", async () => {
    listPolicies.mockResolvedValue([
      policy("pol-1", "security", { allowed: true }),
      policy("pol-adhoc"),
    ]);

    const map = await fetchPoliciesByCategory();

    expect(map.get("security")?.order).toBe(0);
    expect(map.get("pol-adhoc")?.order).toBe(1);
  });
});

describe("decodedToState — runsOnEditor", () => {
  beforeEach(() => listPolicies.mockReset());

  it("runs a catalogue tile that opted into the editor", async () => {
    const state = await stateOf(
      policy("pol-1", "security", { allowed: true }),
      "security",
    );

    expect(state.runsOnEditor).toBe(true);
  });

  // Participation is the policy's own flag now, so a tile that never opted in does not run in the
  // editor just because nobody narrowed its scope.
  it("does not run a catalogue tile that never opted in", async () => {
    const state = await stateOf(policy("pol-1", "security"), "security");

    expect(state.runsOnEditor).toBe(false);
  });

  it("does not run a builder pipeline that never named the editor", async () => {
    // Blank here means nothing stamped it - the tile default would fire an S3 or folder
    // pipeline on every editor upload.
    const state = await stateOf(policy("pol-adhoc"), "pol-adhoc");

    expect(state.runsOnEditor).toBe(false);
  });

  it("runs a builder pipeline that names the editor outright", async () => {
    const state = await stateOf(
      policy("pol-adhoc", undefined, { allowed: true }),
      "pol-adhoc",
    );

    expect(state.runsOnEditor).toBe(true);
  });

  it("marks only a catalogue tile as a built-in default", async () => {
    expect(
      (await stateOf(policy("pol-1", "security"), "security")).isDefault,
    ).toBe(true);
    expect((await stateOf(policy("pol-adhoc"), "pol-adhoc")).isDefault).toBe(
      false,
    );
  });
});
