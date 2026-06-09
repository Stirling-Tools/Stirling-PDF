import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

// The wizard's Workflow step embeds the Watch Folders automation builder, which
// needs the ToolWorkflow context. Mock it: a stub that wires the save trigger to
// hand back the seed automation, so the wizard's submit still completes.
vi.mock("@app/components/policies/PolicyWorkflowStep", () => ({
  AutomationMode: { CREATE: "create", EDIT: "edit", SUGGESTED: "suggested" },
  PolicyWorkflowStep: (props: {
    automation: unknown;
    saveTriggerRef: { current: (() => void) | null };
    onComplete: (automation: unknown, toolRegistry: unknown) => void;
  }) => {
    props.saveTriggerRef.current = () => props.onComplete(props.automation, {});
    return null;
  },
}));

// The backend is the source of truth, but these UI tests run offline: list
// rejects (so the mount reconcile keeps the local cache), while save/delete
// resolve so the enable flow completes.
vi.mock("@app/services/policyApi", () => ({
  listPolicies: vi.fn().mockRejectedValue(new Error("offline")),
  savePolicy: vi.fn().mockImplementation(async (p: { id?: string }) => ({
    ...p,
    id: p.id && p.id.length > 0 ? p.id : "be-test",
  })),
  getPolicy: vi.fn(),
  deletePolicy: vi.fn().mockResolvedValue(undefined),
  runStoredPolicy: vi.fn(),
  runPolicyPipeline: vi.fn(),
  getPolicyRun: vi.fn(),
}));

// Enabling a policy creates its backing Watch Folders SmartFolder (IndexedDB);
// jsdom's crypto lacks randomUUID, which smartFolderStorage uses for folder ids.
if (typeof globalThis.crypto?.randomUUID !== "function") {
  const orig = globalThis.crypto;
  vi.stubGlobal("crypto", {
    getRandomValues: orig?.getRandomValues?.bind(orig),
    randomUUID: () =>
      `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
  });
}
import {
  PoliciesSection,
  PolicyDetailTakeover,
  usePolicyDetailActive,
} from "@app/components/policies/PoliciesSidebar";
import { resetPolicySelection } from "@app/components/policies/policySelectionStore";

/**
 * Mirrors how RightSidebar swaps the policy list for the detail takeover: the
 * list shows above Tools when nothing is open, the takeover replaces it when a
 * policy is selected.
 */
function PoliciesHost() {
  const active = usePolicyDetailActive();
  return active ? <PolicyDetailTakeover /> : <PoliciesSection />;
}

function renderHost() {
  return render(
    <MantineProvider>
      <PoliciesHost />
    </MantineProvider>,
  );
}

describe("Policies right-sidebar surface", () => {
  beforeEach(() => {
    localStorage.clear();
    // Seed a configured Security policy (the only live category) in the local
    // cache. The backend list is mocked to reject (offline), so the mount
    // reconcile leaves it in place — giving the narrative tests a policy to open.
    localStorage.setItem(
      "stirling-policies-state",
      JSON.stringify({
        security: {
          configured: true,
          status: "active",
          sources: ["editor"],
          scopeTypes: [],
          reviewerEmail: "",
          fieldValues: {},
        },
      }),
    );
    resetPolicySelection();
  });

  it("renders the policy list with every category", () => {
    renderHost();
    expect(screen.getByText("Policies")).toBeInTheDocument();
    for (const label of [
      "Ingestion",
      "Security",
      "Compliance",
      "Routing",
      "Retention",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows Security as active and the unbuilt categories as Coming soon", () => {
    renderHost();
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
    // Ingestion, Compliance, Routing, Retention are locked for this release.
    expect(screen.getAllByText("Coming soon")).toHaveLength(4);
  });

  it("does not open a Coming soon policy when its row is clicked", () => {
    renderHost();
    fireEvent.click(screen.getByText("Ingestion"));
    // The locked row isn't a button — we stay on the list, nothing opens.
    expect(screen.getByText("Policies")).toBeInTheDocument();
    expect(screen.queryByText("Enforces")).not.toBeInTheDocument();
  });

  it("opens the narrative view when a live policy is clicked", () => {
    renderHost();
    fireEvent.click(screen.getByText("Security"));
    expect(screen.getByText("Enforces")).toBeInTheDocument();
    expect(screen.getByText("Edit Settings")).toBeInTheDocument();
  });

  it("shows an honest empty activity feed when no files have been uploaded", async () => {
    renderHost();
    fireEvent.click(screen.getByText("Security"));
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    // Activity is derived from real uploads; with none, the empty state shows.
    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
  });

  it("returns to the list via the back button", () => {
    renderHost();
    fireEvent.click(screen.getByText("Security"));
    expect(screen.getByText("Enforces")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Back"));
    expect(screen.getByText("Policies")).toBeInTheDocument();
  });
});
