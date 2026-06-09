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
    onComplete: (automation: unknown) => void;
  }) => {
    props.saveTriggerRef.current = () => props.onComplete(props.automation);
    return null;
  },
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

  it("shows the seeded Ingestion policy as active and others as set-up", () => {
    renderHost();
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Set up").length).toBeGreaterThanOrEqual(1);
  });

  it("opens the narrative view when an active policy is clicked", () => {
    renderHost();
    fireEvent.click(screen.getByText("Ingestion"));
    expect(screen.getByText("Enforces")).toBeInTheDocument();
    expect(screen.getByText("Edit Settings")).toBeInTheDocument();
  });

  it("shows an honest empty activity feed when no files have been uploaded", async () => {
    renderHost();
    fireEvent.click(screen.getByText("Ingestion"));
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    // Activity is derived from real uploads; with none, the empty state shows
    // (no curated mock rows).
    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
  });

  it("returns to the list via the back button", () => {
    renderHost();
    fireEvent.click(screen.getByText("Ingestion"));
    expect(screen.getByText("Enforces")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Back"));
    expect(screen.getByText("Policies")).toBeInTheDocument();
  });

  it("opens the setup wizard (workflow first) for an unconfigured policy", () => {
    renderHost();
    fireEvent.click(screen.getByText("Security"));
    expect(screen.getByText("Set up Security Policy")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  });

  it("advances through the wizard and enables the policy", async () => {
    renderHost();
    fireEvent.click(screen.getByText("Security"));
    fireEvent.click(screen.getByText("Continue")); // workflow → settings
    fireEvent.click(screen.getByText("Continue")); // settings → sources
    expect(screen.getByText("Sources")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Continue")); // sources → review
    expect(screen.getByText("Summary")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Enable Policy"));
    // Enable is async (links the workflow + creates the backing folder); the
    // detail footer with "Edit Settings" appears once the policy is configured.
    expect(await screen.findByText("Edit Settings")).toBeInTheDocument();
  });
});
